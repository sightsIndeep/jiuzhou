/* 九州弈阵 · 单机版 —— 对局运营：商店 / 经济 / 升级 / AI 对手 / 淘汰 */
(function () {
  'use strict';

  const D = window.GF.DATA;
  const ECON = D.ECON;
  const W = 7, H = 8;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSeed() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const a = new Uint32Array(1);
        window.crypto.getRandomValues(a);
        return a[0] >>> 0;
      }
    } catch (e) {}
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.difficulty = opts.difficulty || 'normal';
      this.seed = opts.seed != null ? opts.seed : makeSeed();
      this.rng = mulberry32(this.seed);
      this.listeners = {};
      this.uidCounter = 0;

      this.board = new Array(W * H).fill(null);
      this.bench = new Array(ECON.benchSize).fill(null);
      this.units = new Map();

      this.state = {
        phase: 'prep',
        round: 0,
        hp: 100,
        gold: ECON.startGold,
        level: ECON.startLevel,
        xp: 0,
        streak: 0,
        streakType: null,
        shop: [],
        shopLocked: false,
        itemBench: new Array(ECON.itemBenchSize).fill(null),
        bots: [],
        opponent: null,
        pveWave: null,
        lastOpponentId: null,
        prepTime: 30,
        prepMax: 30,
        battle: null,
        result: null,
        log: [],
        gameOver: false,
        placement: null,
        wins: 0,
        losses: 0,
        totalDamage: 0,
        speed: 1,
        roundStartedAt: 0
      };

      this.battle = null;
      this.resolved = false;
      this.endDelay = 0;

      this.initBots();
      this.giveStarterUnits();
      this.beginRound(1);
      this.log('欢迎来到九州弈阵，祝你旗开得胜！', 'info');
      this.emit('change');
    }

    on(evt, fn) {
      (this.listeners[evt] = this.listeners[evt] || []).push(fn);
    }
    emit(evt, data) {
      (this.listeners[evt] || []).forEach(fn => {
        try { fn(data); } catch (e) { console.error(e); }
      });
    }
    toast(text, kind) { this.emit('toast', { text, kind: kind || 'info' }); }
    sfx(name) { this.emit('sfx', name); }

    log(text, kind) {
      this.state.log.unshift({ text, kind: kind || 'info', round: this.state.round });
      if (this.state.log.length > 40) this.state.log.pop();
      this.emit('log', this.state.log);
    }

    /* ================= 初始化 ================= */
    initBots() {
      const themes = Object.keys(D.TRAITS).filter(id =>
        id !== 'dragon' && D.UNITS.filter(u => u.traits.includes(id)).length >= 5
      );
      this.state.bots = D.BOTS.map((b, i) => {
        const t1 = themes[Math.floor(this.rng() * themes.length)];
        let t2 = themes[Math.floor(this.rng() * themes.length)];
        if (t2 === t1) t2 = themes[(themes.indexOf(t1) + 1) % themes.length];
        return {
          id: 'bot' + i,
          name: b.name, glyph: b.glyph, color: b.color,
          hp: 100, alive: true, place: null,
          level: 2, board: [], power: 0, traitSummary: [],
          theme: t1, theme2: t2,
          streak: 0, lastResult: null
        };
      });
    }

    giveStarterUnits() {
      const oneCost = D.UNITS.filter(u => u.cost === 1);
      let pool = [];
      let lastKey = '';
      try { lastKey = localStorage.getItem('gf:starterPair') || ''; } catch (e) {}
      for (let attempt = 0; attempt < 5; attempt++) {
        pool = shuffle(oneCost, this.rng).slice(0, 2);
        const key = pool.map(u => u.id).sort().join('+');
        if (key !== lastKey || oneCost.length <= 2) {
          try { localStorage.setItem('gf:starterPair', key); } catch (e) {}
          break;
        }
      }
      pool.forEach(def => {
        const u = this.createUnit(def.id);
        this.addToBench(u);
        this.autoPlace(u.uid);
      });
      this.log(`开局赠送：${pool.map(u => u.name).join('、')}`, 'info');
    }

    createUnit(id, star) {
      const def = D.UNIT_BY_ID[id];
      const u = {
        uid: 'u' + (++this.uidCounter),
        id, def, star: star || 1,
        items: [], location: null, r: null, c: null, benchIndex: null
      };
      this.units.set(u.uid, u);
      return u;
    }

    /* ================= 商店 / 经济 ================= */
    rollShop() {
      const odds = ECON.shopOdds[this.state.level] || ECON.shopOdds[9];
      const shop = [];
      for (let i = 0; i < 5; i++) {
        let r = this.rng(), cost = 1, acc = 0;
        for (let j = 0; j < 5; j++) {
          acc += odds[j];
          if (r <= acc) { cost = j + 1; break; }
          cost = j + 1;
        }
        const pool = D.UNITS.filter(u => u.cost === cost);
        const def = pool[Math.floor(this.rng() * pool.length)];
        shop.push({ id: def.id, cost: def.cost, sold: false });
      }
      return shop;
    }

    refreshShop(manual) {
      if (this.state.phase !== 'prep' && this.state.phase !== 'combat') return { ok: false, msg: '当前阶段无法刷新' };
      if (manual) {
        if (this.state.gold < ECON.refreshCost) return { ok: false, msg: '金币不足' };
        this.state.gold -= ECON.refreshCost;
        this.sfx('refresh');
      }
      this.state.shop = this.rollShop();
      this.state.shopLocked = false;
      this.emit('change');
      return { ok: true };
    }

    toggleLock() {
      this.state.shopLocked = !this.state.shopLocked;
      this.sfx('click');
      this.emit('change');
    }

    buyUnit(index) {
      if (this.state.phase !== 'prep' && this.state.phase !== 'combat') return { ok: false, msg: '当前阶段无法购买' };
      const slot = this.state.shop[index];
      if (!slot || slot.sold) return { ok: false, msg: '该棋子已售出' };
      const def = D.UNIT_BY_ID[slot.id];
      if (this.state.gold < def.cost) return { ok: false, msg: '金币不足' };
      const free = this.bench.findIndex(x => !x);
      if (free < 0) return { ok: false, msg: '备战席已满' };
      this.state.gold -= def.cost;
      slot.sold = true;
      const u = this.createUnit(def.id);
      this.addToBench(u, free);
      this.log(`购买 ${def.name}（${def.cost} 金）`, 'buy');
      this.sfx('buy');
      this.checkCombines();
      this.emit('change');
      return { ok: true };
    }

    buyXp() {
      if (this.state.phase !== 'prep' && this.state.phase !== 'combat') return { ok: false, msg: '当前阶段无法购买经验' };
      if (this.state.level >= ECON.maxLevel) return { ok: false, msg: '已达到最高等级' };
      if (this.state.gold < ECON.xpBuyCost) return { ok: false, msg: '金币不足' };
      this.state.gold -= ECON.xpBuyCost;
      this.sfx('xp');
      this.addXp(ECON.xpBuyAmount);
      this.emit('change');
      return { ok: true };
    }

    addXp(n) {
      if (this.state.level >= ECON.maxLevel) return;
      this.state.xp += n;
      let need = ECON.xpTable[this.state.level];
      while (this.state.level < ECON.maxLevel && need && this.state.xp >= need) {
        this.state.xp -= need;
        this.state.level++;
        this.log(`升级到 ${this.state.level} 级！上阵位 +1`, 'levelup');
        this.sfx('levelup');
        this.toast(`等级提升至 ${this.state.level} 级`, 'level');
        need = ECON.xpTable[this.state.level];
      }
      if (this.state.level >= ECON.maxLevel) this.state.xp = 0;
    }

    xpNeed() {
      if (this.state.level >= ECON.maxLevel) return 0;
      return ECON.xpTable[this.state.level] || 0;
    }

    /* ================= 棋盘操作 ================= */
    boardCount() { return this.board.filter(Boolean).length; }
    idx(r, c) { return r * W + c; }
    unitAt(r, c) { return this.board[this.idx(r, c)]; }

    addToBench(u, index) {
      let i = index;
      if (i === undefined || i === null || this.bench[i]) i = this.bench.findIndex(x => !x);
      if (i < 0) return false;
      this.bench[i] = u;
      u.location = 'bench';
      u.benchIndex = i;
      u.r = null; u.c = null;
      return true;
    }

    addToBoard(u, r, c) {
      this.board[this.idx(r, c)] = u;
      u.location = 'board';
      u.r = r; u.c = c;
      u.benchIndex = null;
    }

    clearLocation(u) {
      if (u.location === 'board' && this.board[this.idx(u.r, u.c)] === u) {
        this.board[this.idx(u.r, u.c)] = null;
      } else if (u.location === 'bench' && this.bench[u.benchIndex] === u) {
        this.bench[u.benchIndex] = null;
      }
      u.r = null; u.c = null; u.benchIndex = null; u.location = null;
    }

    autoPlace(uid) {
      const u = this.units.get(uid);
      if (!u || u.location === 'board') return { ok: false };
      if (this.boardCount() >= this.state.level) return { ok: false, msg: `上阵位已满（${this.state.level}）` };
      const isMelee = u.def.range <= 1;
      const rows = isMelee ? [4, 5, 6, 7] : [7, 6, 5, 4];
      const cols = [3, 2, 4, 1, 5, 0, 6];
      for (const r of rows) for (const c of cols) {
        if (!this.board[this.idx(r, c)]) {
          if (u.location === 'bench') this.bench[u.benchIndex] = null;
          this.addToBoard(u, r, c);
          this.sfx('place');
          this.emit('change');
          return { ok: true, r, c };
        }
      }
      return { ok: false };
    }

    moveUnit(uid, r, c) {
      if (this.state.phase !== 'prep') return { ok: false, msg: '战斗中无法调整阵容' };
      const u = this.units.get(uid);
      if (!u) return { ok: false };
      if (r < 4 || r >= H || c < 0 || c >= W) return { ok: false, msg: '只能放在己方半场' };
      const dest = this.board[this.idx(r, c)];
      if (dest === u) return { ok: true };

      if (u.location === 'bench') {
        if (!dest && this.boardCount() >= this.state.level) {
          return { ok: false, msg: `上阵位已满（${this.state.level}）` };
        }
        const oldBench = u.benchIndex;
        this.bench[oldBench] = null;
        if (dest) {
          this.addToBench(dest, oldBench);
        }
        this.addToBoard(u, r, c);
      } else if (u.location === 'board') {
        const oldR = u.r, oldC = u.c;
        if (dest) {
          this.board[this.idx(r, c)] = u;
          u.r = r; u.c = c;
          this.board[this.idx(oldR, oldC)] = dest;
          dest.r = oldR; dest.c = oldC;
        } else {
          this.board[this.idx(oldR, oldC)] = null;
          this.addToBoard(u, r, c);
        }
      } else {
        return { ok: false };
      }
      this.sfx('place');
      this.emit('change');
      return { ok: true };
    }

    moveToBench(uid, index) {
      if (this.state.phase !== 'prep') return { ok: false, msg: '战斗中无法调整阵容' };
      const u = this.units.get(uid);
      if (!u) return { ok: false };
      const dest = this.bench[index];
      if (u.location === 'bench') {
        if (dest === u) return { ok: true };
        const old = u.benchIndex;
        this.bench[old] = dest || null;
        if (dest) { dest.benchIndex = old; dest.location = 'bench'; }
        this.bench[index] = u;
        u.benchIndex = index;
      } else if (u.location === 'board') {
        const oldR = u.r, oldC = u.c;
        if (dest) {
          this.board[this.idx(oldR, oldC)] = dest;
          dest.location = 'board'; dest.r = oldR; dest.c = oldC; dest.benchIndex = null;
        } else {
          this.board[this.idx(oldR, oldC)] = null;
        }
        this.bench[index] = u;
        u.location = 'bench'; u.benchIndex = index; u.r = null; u.c = null;
      }
      this.sfx('place');
      this.emit('change');
      return { ok: true };
    }

    addItem(itemId) {
      const item = D.ITEM_BY_ID[itemId];
      const value = item && item.component ? 1 : 2;
      const i = this.state.itemBench.findIndex(x => !x);
      if (i < 0) {
        this.state.gold += value;
        this.log(`装备栏已满，${item ? item.name : '装备'} 转换为 ${value} 金`, 'info');
        return false;
      }
      this.state.itemBench[i] = itemId;
      return true;
    }

    returnItems(unit) {
      unit.items.forEach(id => this.addItem(id));
      unit.items = [];
    }

    sellUnit(uid) {
      if (this.state.phase !== 'prep') return { ok: false, msg: '战斗中无法出售' };
      const u = this.units.get(uid);
      if (!u) return { ok: false };
      const refund = u.def.cost * Math.pow(3, u.star - 1);
      this.clearLocation(u);
      this.returnItems(u);
      this.units.delete(uid);
      this.state.gold += refund;
      this.log(`出售 ${u.def.name}${u.star > 1 ? '（' + u.star + '星）' : ''}，+${refund} 金`, 'sell');
      this.sfx('sell');
      this.emit('change');
      return { ok: true, refund };
    }

    unequipAll(uid) {
      if (this.state.phase !== 'prep') return { ok: false, msg: '只能在自己准备阶段卸装备' };
      const u = this.units.get(uid);
      if (!u) return { ok: false, msg: '找不到这个棋子' };
      if (!u.items.length) return { ok: false, msg: '这个棋子没有装备' };
      const free = this.state.itemBench.filter(x => !x).length;
      if (free < u.items.length) {
        return { ok: false, msg: `装备席需要 ${u.items.length} 个空位，当前只有 ${free} 个` };
      }
      const items = u.items.slice();
      u.items = [];
      items.forEach(id => this.addItem(id));
      this.log(`${u.def.name} 卸下 ${items.length} 件装备`, 'item');
      this.sfx('equip');
      this.emit('change');
      return { ok: true, count: items.length };
    }

    sellItem(index) {
      if (this.state.phase !== 'prep') return { ok: false };
      const itemId = this.state.itemBench[index];
      if (!itemId) return { ok: false };
      const item = D.ITEM_BY_ID[itemId];
      const value = item && item.component ? 1 : 2;
      this.state.itemBench[index] = null;
      this.state.gold += value;
      this.sfx('sell');
      this.emit('change');
      return { ok: true, value, name: item ? item.name : '' };
    }

    equipItem(itemIndex, uid) {
      if (this.state.phase !== 'prep') return { ok: false, msg: '战斗中无法装备' };
      const itemId = this.state.itemBench[itemIndex];
      if (!itemId) return { ok: false };
      const item = D.ITEM_BY_ID[itemId];
      const u = this.units.get(uid);
      if (!item || !u) return { ok: false };

      // 两件基础材料放在同一个棋子身上时自动合成
      if (item.component) {
        const compIndex = u.items.findIndex(id => {
          const it = D.ITEM_BY_ID[id];
          return it && it.component;
        });
        if (compIndex >= 0) {
          const otherId = u.items[compIndex];
          const combinedId = D.combineItems(itemId, otherId);
          if (!combinedId) return { ok: false, msg: '这两件基础材料无法合成' };
          this.state.itemBench[itemIndex] = null;
          u.items.splice(compIndex, 1);
          u.items.push(combinedId);
          const combined = D.ITEM_BY_ID[combinedId];
          const other = D.ITEM_BY_ID[otherId];
          this.log(`${u.def.name} 合成 ${combined.name}（${other.name} + ${item.name}）`, 'combine');
          this.toast(`合成 ${combined.name}`, 'combine');
          this.sfx('combine');
          this.emit('change');
          return { ok: true, combined: true, itemId: combinedId };
        }
      }

      if (u.items.length >= 3) return { ok: false, msg: '每名棋子最多装备 3 件装备' };
      this.state.itemBench[itemIndex] = null;
      u.items.push(itemId);
      this.log(`将 ${item.name} 装备给 ${u.def.name}`, 'item');
      this.sfx('equip');
      this.emit('change');
      return { ok: true };
    }

    checkCombines() {
      for (let guard = 0; guard < 20; guard++) {
        const groups = {};
        this.units.forEach(u => {
          if (u.star >= 3) return;
          const k = u.id + '@' + u.star;
          (groups[k] = groups[k] || []).push(u);
        });
        let group = null;
        for (const k in groups) {
          if (groups[k].length >= 3) { group = groups[k]; break; }
        }
        if (!group) break;
        group.sort((a, b) => (a.location === 'board' ? -1 : 0) - (b.location === 'board' ? -1 : 0));
        const survivor = group[0];
        const consumed = group.slice(1, 3);
        consumed.forEach(c => {
          this.clearLocation(c);
          c.items.forEach(id => this.addItem(id));
          c.items = [];
          this.units.delete(c.uid);
        });
        survivor.star++;
        this.log(`三星之路：合成 ${survivor.star} 星 ${survivor.def.name}！`, 'combine');
        this.toast(`合成 ${survivor.star} 星 ${survivor.def.name}`, 'combine');
        this.sfx('combine');
      }
    }

    getBoardUnits() {
      return this.board.filter(Boolean);
    }

    getTraits(units) {
      const list = units || this.getBoardUnits();
      const counts = {};
      list.forEach(u => {
        new Set(u.def.traits).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      });
      const out = [];
      Object.keys(counts).forEach(id => {
        const def = D.TRAITS[id];
        if (!def) return;
        let tier = 0;
        def.breakpoints.forEach((bp, i) => { if (counts[id] >= bp) tier = i + 1; });
        out.push({ id, count: counts[id], tier, def });
      });
      out.sort((a, b) => (b.tier - a.tier) || (b.count - a.count));
      return out;
    }

    boardPower(units) {
      const list = units || this.getBoardUnits();
      const traits = this.getTraits(list);
      const tierBonus = traits.reduce((s, t) => s + t.tier, 0);
      const base = list.reduce((s, u) => {
        const starMult = u.star === 3 ? 5 : u.star === 2 ? 2.2 : 1;
        return s + u.def.cost * starMult * (1 + 0.14 * u.items.length);
      }, 0);
      return Math.round(base * (1 + tierBonus * 0.04) * 10);
    }

    /* ================= 回合流程 ================= */
    getStageInfo(round) {
      const r = round || this.state.round;
      if (r <= 3) return { stage: 1, sub: r, pve: true, label: `1-${r}` };
      const stage = 2 + Math.floor((r - 4) / D.ROUNDS_PER_STAGE);
      const sub = ((r - 4) % D.ROUNDS_PER_STAGE) + 1;
      return { stage, sub, pve: sub === 6, label: `${stage}-${sub}` };
    }

    getPveWave(round) {
      return D.PVE_WAVES[round] || null;
    }

    beginRound(round) {
      this.state.round = round;
      const info = this.getStageInfo(round);
      this.state.pveWave = info.pve ? this.getPveWave(round) : null;
      this.state.phase = 'prep';
      this.state.prepMax = round === 1 ? 45 : 30;
      this.state.prepTime = this.state.prepMax;
      this.state.result = null;
      this.state.battle = null;
      this.battle = null;
      this.resolved = false;
      this.endDelay = 0;

      this.refreshBotBoards();

      if (this.state.pveWave) {
        this.state.opponent = null;
      } else {
        const alive = this.state.bots.filter(b => b.alive);
        let pool = alive.filter(b => b.id !== this.state.lastOpponentId);
        if (!pool.length) pool = alive;
        const opp = pool[Math.floor(this.rng() * pool.length)];
        this.state.opponent = opp || null;
        if (opp) this.state.lastOpponentId = opp.id;
      }

      if (this.state.shopLocked) {
        this.state.shopLocked = false;
      } else {
        this.state.shop = this.rollShop();
      }

      this.log(`—— 第 ${info.label} 回合${info.pve ? '（野怪）' : ''} ——`, 'round');
      this.emit('roundStart', info);
      this.emit('change');
    }

    nextRound() {
      if (this.state.gameOver) return;
      if (this.state.round >= 30) {
        this.finishByHp();
        return;
      }
      this.beginRound(this.state.round + 1);
    }

    finishByHp() {
      const bots = this.state.bots.filter(b => b.alive);
      const rank = 1 + bots.filter(b => b.hp > this.state.hp).length;
      this.state.placement = rank;
      this.state.gameOver = true;
      this.state.phase = 'over';
      this.log(`比赛达到 30 回合上限，按生命值排名：第 ${rank} 名`, 'round');
      this.emit('gameOver', { placement: rank });
      this.emit('change');
    }

    refreshBotBoards() {
      this.state.bots.forEach(bot => {
        if (!bot.alive) return;
        this.generateBotBoard(bot);
      });
    }

    generateBotBoard(bot) {
      const round = this.state.round;
      const diff = this.difficulty;
      let level = clamp(2 + Math.floor((round + 2) / 2.9), 2, 10);
      if (diff === 'easy') level = Math.max(2, level - 1);
      if (diff === 'hard') level = Math.min(10, level + 1);
      const maxCost = clamp(1 + Math.floor(round / 4), 1, 5);
      const pool = D.UNITS.filter(u => u.cost <= maxCost);
      const needMelee = Math.min(level, Math.ceil(level / 2));
      const chosen = [];
      const used = new Set();

      const themeScore = u => {
        let s = this.rng() * 2 + u.cost * 0.5;
        if (u.traits.includes(bot.theme)) s += 4;
        if (u.traits.includes(bot.theme2)) s += 2;
        return s;
      };

      // 先补前排
      for (let i = 0; i < needMelee; i++) {
        let cands = pool.filter(u => u.range <= 1 && !used.has(u.id));
        if (!cands.length) cands = pool.filter(u => !used.has(u.id));
        let best = null, bs = -1;
        cands.forEach(u => { const s = themeScore(u); if (s > bs) { bs = s; best = u; } });
        if (!best) break;
        chosen.push(best); used.add(best.id);
      }
      // 补后排 / 剩余
      while (chosen.length < level) {
        const cands = pool.filter(u => !used.has(u.id));
        if (!cands.length) break;
        let best = null, bs = -1;
        cands.forEach(u => {
          let s = themeScore(u);
          if (u.range > 1) s += 0.8;
          if (s > bs) { bs = s; best = u; }
        });
        chosen.push(best); used.add(best.id);
      }

      let p2 = clamp(0.02 + (round - 4) * 0.05, 0, 0.78);
      if (diff === 'easy') p2 -= 0.1;
      if (diff === 'hard') p2 += 0.08;
      p2 = clamp(p2, 0, 0.9);
      const p3 = clamp((round - 14) * 0.01, 0, 0.12);

      const refs = chosen.map(def => {
        let star = 1;
        const costPenalty = (def.cost - 1) * 0.06;
        if (this.rng() < p2 - costPenalty) star = 2;
        if (def.cost <= 2 && this.rng() < p3) star = 3;
        return { def, star, items: [], r: 0, c: 0 };
      });

      let itemCount = Math.floor(round / 3);
      if (diff === 'easy') itemCount -= 2;
      if (diff === 'hard') itemCount += 2;
      itemCount = clamp(itemCount, 0, 14);
      const itemPool = D.ITEMS.map(i => i.id);
      const sortedForItems = refs.slice().sort((a, b) => b.def.cost - a.def.cost);
      for (let i = 0; i < itemCount; i++) {
        const target = sortedForItems[i % Math.max(1, sortedForItems.length)];
        if (target.items.length < 3) target.items.push(itemPool[Math.floor(this.rng() * itemPool.length)]);
      }

      this.positionBotUnits(refs);
      bot.level = level;
      bot.board = refs;
      bot.power = this.botPower(refs);
      const traits = this.getTraits(refs.map(r => ({ def: r.def })));
      bot.traitSummary = traits.filter(t => t.tier > 0).slice(0, 3);
      return refs;
    }

    positionBotUnits(refs) {
      const cells = new Set();
      const placed = new Set();
      const place = (u, rows, cols) => {
        for (const r of rows) for (const c of cols) {
          const k = r + ',' + c;
          if (!cells.has(k)) {
            cells.add(k); u.r = r; u.c = c; placed.add(u); return true;
          }
        }
        return false;
      };
      const melee = refs.filter(u => u.def.range <= 1);
      const ranged = refs.filter(u => u.def.range > 1).sort((a, b) => b.def.cost - a.def.cost);
      melee.forEach(u => place(u, [3, 2], [3, 2, 4, 1, 5, 0, 6]));
      ranged.forEach(u => place(u, [0, 1, 2], [3, 2, 4, 1, 5, 0, 6]));
      refs.forEach(u => { if (!placed.has(u)) place(u, [2, 1, 0], [3, 2, 4, 1, 5, 0, 6]); });
    }

    botPower(refs) {
      const traits = this.getTraits(refs.map(r => ({ def: r.def })));
      const tierBonus = traits.reduce((s, t) => s + t.tier, 0);
      const base = refs.reduce((s, r) => {
        const starMult = r.star === 3 ? 5 : r.star === 2 ? 2.2 : 1;
        return s + r.def.cost * starMult * (1 + 0.13 * r.items.length);
      }, 0);
      return Math.round(base * (1 + tierBonus * 0.05) * 10);
    }

    getEnemyRefs() {
      const st = this.state;
      if (st.pveWave) {
        return st.pveWave.units.map(w => ({
          def: D.MONSTER_BY_ID[w.id], star: w.star || 1, items: [], r: w.r, c: w.c
        }));
      }
      if (!st.opponent) return [];
      return st.opponent.board.map(r => ({ def: r.def, star: r.star, items: r.items.slice(), r: r.r, c: r.c }));
    }

    startCombat() {
      if (this.state.phase !== 'prep') return;
      const playerRefs = this.getBoardUnits().map(u => ({
        def: u.def, star: u.star, items: u.items.slice(), r: u.r, c: u.c
      }));
      const enemyRefs = this.getEnemyRefs();
      const seed = Math.floor(this.rng() * 1e9);
      this.battle = new window.GF.Battle({
        playerUnits: playerRefs,
        enemyUnits: enemyRefs,
        seed
      });
      this.state.battle = this.battle;
      this.state.phase = 'combat';
      this.state.prepTime = 0;
      this.resolved = false;
      this.endDelay = 1.2;
      this.sfx('battle');
      this.emit('battleStart', this.battle);
      this.emit('change');
      if (this.battle.over) this.endDelay = 0.6;
    }

    update(dt) {
      dt = Math.min(dt, 0.05);
      const st = this.state;
      if (st.phase === 'prep') {
        st.prepTime -= dt;
        if (st.prepTime <= 0) {
          st.prepTime = 0;
          this.startCombat();
        }
      } else if (st.phase === 'combat' && this.battle) {
        if (!this.battle.over) this.battle.tick(dt * st.speed);
        if (this.battle.over) {
          this.endDelay -= dt * st.speed;
          if (this.endDelay <= 0 && !this.resolved) this.resolveBattle();
        }
      }
    }

    resolveBattle() {
      if (this.resolved) return;
      this.resolved = true;
      const b = this.battle;
      const st = this.state;
      const info = this.getStageInfo();
      const stage = info.stage;
      const baseDamage = D.STAGE_BASE_DAMAGE[clamp(stage, 1, 7)] || 5;
      const win = b.winner === 'player';
      const playerSurvivors = b.units.filter(u => u.team === 'player' && u.alive).length;
      const enemySurvivors = b.units.filter(u => u.team === 'enemy' && u.alive).length;
      const pve = !!st.pveWave;

      let damageToPlayer = 0, damageToOpponent = 0;
      if (win) {
        damageToOpponent = baseDamage + playerSurvivors;
        if (st.opponent) st.opponent.hp = Math.max(0, st.opponent.hp - damageToOpponent);
      } else if (b.winner === 'enemy') {
        damageToPlayer = baseDamage + enemySurvivors;
        if (this.difficulty === 'easy') damageToPlayer = Math.ceil(damageToPlayer * 0.8);
        if (this.difficulty === 'hard') damageToPlayer = Math.ceil(damageToPlayer * 1.15);
        st.hp = Math.max(0, st.hp - damageToPlayer);
        st.totalDamage += damageToPlayer;
        this.emit('damageFlash', damageToPlayer);
      }

      if (!pve) {
        if (win) {
          st.wins++;
          if (st.streakType === 'win') st.streak++;
          else { st.streakType = 'win'; st.streak = 1; }
          st.opponent && (st.opponent.streak = (st.opponent.streak || 0) + 1);
        } else if (b.winner === 'enemy') {
          st.losses++;
          if (st.streakType === 'loss') st.streak++;
          else { st.streakType = 'loss'; st.streak = 1; }
        }
      }

      const interest = Math.min(5, Math.floor(st.gold / 10));
      const streakBonus = st.streak >= 5 ? 3 : st.streak >= 4 ? 2 : st.streak >= 2 ? 1 : 0;
      const winBonus = (!pve && win) ? 1 : 0;
      const pveGold = (pve && win && st.pveWave) ? st.pveWave.gold : 0;
      const totalGold = 5 + interest + streakBonus + winBonus + pveGold;
      const levelBefore = st.level;
      this.addXp(ECON.xpPerRound);
      st.gold += totalGold;

      const itemNames = [];
      let autoSoldItems = 0;
      if (pve && win && st.pveWave) {
        // 每次野怪掉落基础材料，数量为原奖励的 2 倍；两件基础材料可合成器物
        for (let i = 0; i < st.pveWave.items * 2; i++) {
          const item = D.COMPONENTS[Math.floor(this.rng() * D.COMPONENTS.length)];
          if (!this.addItem(item.id)) autoSoldItems++;
          itemNames.push(item.name);
        }
      }

      let botLogs = [];
      if (!pve) {
        botLogs = this.simulateOtherBotFights(st.opponent ? st.opponent.id : null);
      }

      const eliminations = this.processEliminations();

      if (win) {
        this.sfx('victory');
        this.log(st.opponent ? `战胜 ${st.opponent.name}，造成 ${damageToOpponent} 点伤害！` : `击退 ${st.pveWave.name}！`, 'win');
      } else if (b.winner === 'enemy') {
        this.sfx('defeat');
        this.log(st.opponent ? `不敌 ${st.opponent.name}，损失 ${damageToPlayer} 点生命` : `不敌 ${st.pveWave.name}，损失 ${damageToPlayer} 点生命`, 'loss');
      } else {
        this.log('双方鏖战至时间耗尽，判定平局', 'info');
      }

      const result = {
        win: b.winner === 'player',
        draw: b.winner === 'draw',
        pve,
        opponent: st.opponent ? { name: st.opponent.name, glyph: st.opponent.glyph, color: st.opponent.color, hp: st.opponent.hp } : null,
        pveName: st.pveWave ? st.pveWave.name : null,
        damageToPlayer, damageToOpponent,
        playerSurvivors, enemySurvivors,
        income: { base: 5, interest, streak: streakBonus, win: winBonus, pve: pveGold, total: totalGold },
        items: itemNames,
        autoSoldItems,
        levelBefore, levelAfter: st.level,
        eliminated: eliminations,
        botLogs,
        gameOver: st.gameOver,
        placement: st.placement,
        playerHp: st.hp,
        round: st.round,
        stageLabel: info.label
      };

      st.result = result;
      st.phase = 'result';
      this.emit('battleEnd', result);
      this.emit('change');
    }

    simulateOtherBotFights(excludeId) {
      const st = this.state;
      let pool = st.bots.filter(b => b.alive && b.id !== excludeId);
      pool = shuffle(pool, this.rng);
      const logs = [];
      const stage = this.getStageInfo().stage;
      const base = D.STAGE_BASE_DAMAGE[clamp(stage, 1, 7)] || 5;
      for (let i = 0; i + 1 < pool.length; i += 2) {
        const a = pool[i], b = pool[i + 1];
        const pa = a.power * (0.9 + this.rng() * 0.2);
        const pb = b.power * (0.9 + this.rng() * 0.2);
        const winner = pa >= pb ? a : b;
        const loser = pa >= pb ? b : a;
        const dmg = base + 5 + Math.floor(this.rng() * 6);
        loser.hp = Math.max(0, loser.hp - dmg);
        winner.lastResult = 'win';
        loser.lastResult = 'loss';
        logs.push(`${winner.name} 击败 ${loser.name}`);
        this.log(`${winner.name} 击败了 ${loser.name}（-${dmg}）`, 'bot');
      }
      return logs;
    }

    processEliminations() {
      const st = this.state;
      const dead = [];
      if (st.hp <= 0) dead.push({ kind: 'player', name: '你', hp: st.hp });
      st.bots.forEach(b => { if (b.alive && b.hp <= 0) dead.push({ kind: 'bot', bot: b, name: b.name, hp: b.hp }); });
      dead.sort((a, b) => a.hp - b.hp);
      let slots = 1 + st.bots.filter(b => b.alive).length;
      const eliminated = [];
      dead.forEach(d => {
        const place = slots;
        slots--;
        if (d.kind === 'bot') {
          d.bot.alive = false;
          d.bot.place = place;
          this.log(`${d.bot.name} 被淘汰（第 ${place} 名）`, 'elim');
          eliminated.push({ name: d.bot.name, place });
        } else {
          st.placement = place;
          st.hp = 0;
          st.gameOver = true;
          this.log(`你被淘汰了（第 ${place} 名）`, 'elim');
          eliminated.push({ name: '你', place });
        }
      });

      const aliveBots = st.bots.filter(b => b.alive);
      if (!st.gameOver && st.hp > 0 && aliveBots.length === 0) {
        st.placement = 1;
        st.gameOver = true;
        this.log('全场只剩你一人，成功吃鸡！', 'win');
        this.sfx('chicken');
      }
      if (st.gameOver && st.phase !== 'result') {
        st.phase = 'over';
      }
      return eliminated;
    }

    continueFromResult() {
      if (this.state.phase !== 'result') return;
      if (this.state.gameOver) {
        this.state.phase = 'over';
        this.emit('gameOver', { placement: this.state.placement });
        this.emit('change');
        return;
      }
      this.nextRound();
      this.sfx('click');
    }

    /* ================= 查询辅助 ================= */
    getOpponentTraits() {
      if (!this.state.opponent) return [];
      return this.getTraits(this.state.opponent.board.map(r => ({ def: r.def })));
    }

    getAliveCount() {
      return (this.state.hp > 0 ? 1 : 0) + this.state.bots.filter(b => b.alive).length;
    }

    getPlacementTitle(place) {
      if (place === 1) return '九州之主';
      if (place <= 4) return '稳稳上分';
      if (place <= 6) return '棋差一着';
      return '下把必 C';
    }
  }

  window.GF = window.GF || {};
  window.GF.Game = Game;
})();
