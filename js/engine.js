/* 九州弈阵 · 单机版 —— 六边形自动战斗引擎（无 DOM，可独立测试） */
(function () {
  'use strict';

  const D = window.GF.DATA;
  const W = 7, H = 8;

  function key(r, c) { return r * W + c; }
  function inBounds(r, c) { return r >= 0 && r < H && c >= 0 && c < W; }

  function offsetToCube(r, c) {
    const x = c - ((r - (r & 1)) / 2);
    const z = r;
    return { x, z, y: -x - z };
  }
  function cubeToOffset(x, z) {
    return { r: z, c: x + ((z - (z & 1)) / 2) };
  }
  function cubeDistance(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }
  function hexDist(a, b) {
    return cubeDistance(offsetToCube(a.r, a.c), offsetToCube(b.r, b.c));
  }
  function cubeRound(x, y, z) {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: rx, y: ry, z: rz };
  }
  function hexLine(a, b) {
    const ca = offsetToCube(a.r, a.c), cb = offsetToCube(b.r, b.c);
    const n = cubeDistance(ca, cb);
    if (n === 0) return [a];
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = cubeRound(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, ca.z + (cb.z - ca.z) * t);
      const o = cubeToOffset(p.x, p.z);
      if (out.length && out[out.length - 1].r === o.r && out[out.length - 1].c === o.c) continue;
      out.push(o);
    }
    return out;
  }

  const NB_EVEN = [[0, 1], [0, -1], [-1, 0], [-1, -1], [1, 0], [1, -1]];
  const NB_ODD = [[0, 1], [0, -1], [-1, 1], [-1, 0], [1, 1], [1, 0]];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STAR_HP = [1, 1.8, 3.24];
  const STAR_AD = [1, 1.5, 2.25];

  class Battle {
    constructor(opts) {
      this.rng = mulberry32((opts.seed || Date.now()) >>> 0);
      this.time = 0;
      this.over = false;
      this.winner = null;
      this.timeout = false;
      this.events = [];
      this.timers = [];
      this.units = [];
      this.occupied = new Array(W * H).fill(null);
      this.seed = opts.seed || 1;

      this.playerTraits = this.computeTraits(opts.playerUnits);
      this.enemyTraits = this.computeTraits(opts.enemyUnits);

      opts.playerUnits.forEach((ref, i) => this.addUnit(ref, 'player', i));
      opts.enemyUnits.forEach((ref, i) => this.addUnit(ref, 'enemy', i));

      this.applyTraits('player', this.playerTraits);
      this.applyTraits('enemy', this.enemyTraits);

      this.units.forEach(u => {
        u.hp = u.hpMax;
        u.mana = Math.min(u.manaMax, u.startMana);
        u.attackCd = 0.2 + this.rng() * 0.3;
      });

      this.jumpAssassins('player');
      this.jumpAssassins('enemy');
      this.checkEnd();
    }

    /* ---------- 初始化 ---------- */
    computeTraits(refs) {
      const counts = {};
      refs.forEach(r => {
        const traits = (r.def && r.def.traits) || [];
        const seen = new Set(traits);
        seen.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      });
      const out = {};
      Object.keys(counts).forEach(id => {
        const def = D.TRAITS[id];
        if (!def) return;
        let tier = 0;
        def.breakpoints.forEach((bp, i) => { if (counts[id] >= bp) tier = i + 1; });
        out[id] = { id, count: counts[id], tier, def };
      });
      return out;
    }

    addUnit(ref, team, index) {
      const def = ref.def;
      const star = ref.star || 1;
      let r = ref.r, c = ref.c;
      if (!inBounds(r, c) || this.occupied[key(r, c)]) {
        const spot = this.findFreeCell({ r: Math.max(0, Math.min(H - 1, r)), c: Math.max(0, Math.min(W - 1, c)) });
        if (spot) { r = spot.r; c = spot.c; }
      }
      const u = {
        uid: (team === 'player' ? 'p' : 'e') + index,
        team, def,
        id: def.id, name: def.name, glyph: def.glyph || def.name[0],
        color: def.color || '#fbbf24', cost: def.cost || 1, star,
        traits: (def.traits || []).slice(),
        r, c,
        hpMax: Math.round(def.hp * STAR_HP[star - 1]),
        hp: 0, ad: Math.round(def.ad * STAR_AD[star - 1]), ap: 0,
        as: def.as, asPct: 0, armor: def.armor, mr: def.mr,
        critChance: 0.25, critDmg: 1.4,
        range: def.range, manaMax: def.mana || 100, startMana: def.startMana || 0,
        mana: 0, shield: 0, shieldTimer: 0,
        attackCd: 0, moveCd: 0, castLock: 0, stun: 0,
        buffs: [], dots: [], alive: true, target: null,
        items: (ref.items || []).slice(),
        dmgAmp: 0, healAmp: 0, lifesteal: 0, extraAttackChance: 0,
        ricochet: 0, ricochetPct: 0, sgMana: 0, futureTier: 0, futureStacks: 0,
        assassinJump: false, spellCrit: false,
        giantSlayer: false, blueBuff: false, magicReduction: 0,
        reflect: 0, warmog: false, redemptionTimer: 5, archangelTimer: 4,
        archangelStacks: 0, ionicTimer: 3, guinsooStacks: 0,
        titanStacks: 0, sunfireTimer: 1, grievous: 0, grievousPct: 0, mrShred: 0,
        ccImmune: false, image: def.image || null
      };
      this.applyItems(u);
      this.units.push(u);
      this.occupied[key(r, c)] = u;
      return u;
    }

    applyItems(u) {
      u.items.forEach(id => {
        const it = D.ITEM_BY_ID[id];
        if (!it) return;
        const s = it.stats || {};
        if (s.hp) { u.hpMax += s.hp; }
        if (s.ad) u.ad += s.ad;
        if (s.ap) u.ap += s.ap;
        if (s.armor) u.armor += s.armor;
        if (s.mr) u.mr += s.mr;
        if (s.asPct) u.asPct += s.asPct;
        if (s.critChance) u.critChance += s.critChance;
        if (s.critDmg) u.critDmg += s.critDmg;
        if (s.mana) u.startMana += s.mana;
        if (s.dmgAmp) u.dmgAmp += s.dmgAmp;
        if (s.healAmp) u.healAmp += s.healAmp;
        switch (id) {
          case 'giant_slayer': u.giantSlayer = true; break;
          case 'blue_buff': u.blueBuff = true; break;
          case 'warmog': u.warmog = true; break;
          case 'redemption': u.redemption = true; break;
          case 'archangel': u.archangel = true; break;
          case 'ionic': u.ionic = true; break;
          case 'guinsoo': u.guinsoo = true; break;
          case 'dragon_claw': u.magicReduction = 0.25; break;
          case 'thornmail': u.reflect = 0.2; break;
          case 'titan': u.titan = true; break;
          case 'jeweled': u.spellCrit = true; break;
          case 'sunfire': u.sunfire = true; break;
          default: break;
        }
      });
    }

    applyTraits(team, traits) {
      const list = this.units.filter(u => u.team === team);
      Object.keys(traits).forEach(id => {
        const info = traits[id];
        if (info.tier > 0) info.def.apply(list, info.tier, this);
      });
    }

    jumpAssassins(team) {
      const enemies = this.units.filter(u => u.team !== team && u.alive);
      if (!enemies.length) return;
      this.units.filter(u => u.team === team && u.assassinJump && u.alive).forEach(u => {
        const target = enemies.slice().sort((a, b) => (a.armor - b.armor) || (a.hp - b.hp))[0];
        if (!target) return;
        const spot = this.findFreeNear({ r: target.r, c: target.c }, 1) ||
          this.findFreeNear({ r: target.r, c: target.c }, 2);
        if (spot) {
          this.occupied[key(u.r, u.c)] = null;
          u.r = spot.r; u.c = spot.c;
          this.occupied[key(u.r, u.c)] = u;
          this.events.push({ t: 'move', uid: u.uid, r: u.r, c: u.c, jump: true });
        }
      });
    }

    /* ---------- 查询 ---------- */
    cellOf(u) { return { r: u.r, c: u.c }; }
    cell(a, b) { return hexDist(a, b); }
    dist(a, b) { return hexDist(this.cellOf(a), this.cellOf(b)); }
    enemies(u) { return this.units.filter(x => x.team !== u.team && x.alive); }
    allies(u) { return this.units.filter(x => x.team === u.team && x.alive); }
    random(list) { return list[Math.floor(this.rng() * list.length)]; }
    lowestHp(list) {
      const l = list.filter(u => u.alive);
      if (!l.length) return null;
      return l.reduce((a, b) => (b.hp < a.hp ? b : a));
    }
    farthest(list, from) {
      const l = list.filter(u => u.alive);
      if (!l.length) return null;
      let best = l[0], bd = -1;
      l.forEach(u => { const d = this.dist(from, u); if (d > bd) { bd = d; best = u; } });
      return best;
    }
    nearestTarget(u) {
      const list = this.enemies(u);
      if (!list.length) return null;
      let best = list[0], bd = 999;
      list.forEach(e => {
        const d = this.dist(u, e);
        if (d < bd || (d === bd && e.hp < best.hp)) { bd = d; best = e; }
      });
      return best;
    }
    findFreeCell(center) {
      for (let rad = 0; rad <= 6; rad++) {
        const cells = this.cellsInRadius(center, rad).filter(p => !this.occupied[key(p.r, p.c)]);
        if (cells.length) return cells[0];
      }
      return null;
    }
    findFreeNear(center, radius) {
      const cells = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (this.occupied[key(r, c)]) continue;
        if (hexDist({ r, c }, center) <= radius) cells.push({ r, c });
      }
      if (!cells.length) return null;
      cells.sort((a, b) => hexDist(a, center) - hexDist(b, center));
      return cells[0];
    }
    cellsInRadius(center, rad) {
      const out = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (hexDist({ r, c }, center) === rad) out.push({ r, c });
      }
      return out;
    }
    blinkNear(u, target) {
      const spot = this.findFreeNear(this.cellOf(target), 1);
      if (!spot) return false;
      this.occupied[key(u.r, u.c)] = null;
      u.r = spot.r; u.c = spot.c;
      this.occupied[key(u.r, u.c)] = u;
      this.events.push({ t: 'move', uid: u.uid, r: u.r, c: u.c, jump: true });
      return true;
    }

    /* ---------- 属性 ---------- */
    buffSum(u, field) {
      let v = 0;
      if (!u || !u.buffs) return 0;
      u.buffs.forEach(b => { if (b[field]) v += b[field]; });
      return v;
    }
    effAs(u) {
      let mult = 1 + u.asPct + u.guinsooStacks * 0.06 + this.buffSum(u, 'asPct');
      if (u.futureTier) mult += u.futureStacks * (u.futureTier === 2 ? 0.25 : 0.12);
      return Math.max(0.15, Math.min(5, u.as * mult));
    }
    effAd(u) { return u.ad * (1 + this.buffSum(u, 'adPct')); }
    effAp(u) { return u.ap + this.buffSum(u, 'ap'); }
    ap(u) { return 1 + this.effAp(u) / 100; }
    effArmor(u) { return Math.max(0, u.armor + this.buffSum(u, 'armor')); }
    effMr(u) {
      let mr = Math.max(0, u.mr + this.buffSum(u, 'mr'));
      if (u.mrShred > 0) mr *= 0.7;
      return mr;
    }
    effLifesteal(u) { return u.lifesteal + this.buffSum(u, 'lifesteal'); }
    healAmp(u) { return 1 + u.healAmp + this.buffSum(u, 'healAmp'); }

    /* ---------- 核心：伤害 / 治疗 / 护盾 ---------- */
    dealDamage(source, target, raw, opts) {
      opts = opts || {};
      if (this.over || !target || !target.alive || raw <= 0) return 0;
      let amount = raw;
      const type = opts.type || 'physical';

      if (type === 'physical') {
        amount *= 100 / (100 + this.effArmor(target));
      } else if (type === 'magic') {
        amount *= 100 / (100 + this.effMr(target));
        if (target.magicReduction) amount *= (1 - target.magicReduction);
      }

      if (source && source.alive) {
        if (source.dmgAmp) amount *= (1 + source.dmgAmp);
        if (source.giantSlayer && target.hpMax > 1200) amount *= 1.25;
      }

      let crit = false;
      if (opts.forceCrit) crit = true;
      else if (opts.attack) crit = this.rng() < Math.min(1, source ? source.critChance : 0.25);
      else if (opts.spell && source && source.spellCrit) crit = this.rng() < Math.min(1, source.critChance);
      if (crit) amount *= source ? source.critDmg : 1.4;

      amount = Math.max(1, Math.round(amount));
      let absorbed = 0;
      if (target.shield > 0) {
        absorbed = Math.min(target.shield, amount);
        target.shield -= absorbed;
        amount -= absorbed;
        if (target.shield <= 0) target.shieldTimer = 0;
      }
      target.hp -= amount;

      this.events.push({
        t: 'dmg', uid: target.uid, value: amount, shield: absorbed,
        kind: type, crit, cell: { r: target.r, c: target.c }
      });

      if (absorbed > 0) this.events.push({ t: 'shieldHit', uid: target.uid, value: absorbed });

      if (opts.attack) {
        target.mana = Math.min(target.manaMax, target.mana + 5);
        if (target.reflect && source && source.alive) {
          this.dealDamage(target, source, (amount + absorbed) * target.reflect, { type: 'magic', reflect: true });
        }
      }

      const ls = this.effLifesteal(source || {});
      if (ls > 0 && source && source.alive) {
        this.heal(source, source, (amount + absorbed) * ls);
      }

      if (opts.attack && source && source.alive && target.alive) {
        if (source.guinsoo) {
          source.guinsooStacks = Math.min(20, source.guinsooStacks + 1);
        }
        if (source.titan) {
          source.titanStacks = Math.min(30, source.titanStacks + 1);
          source.ad += 1; source.ap += 1;
        }
      }

      if (target.hp <= 0) this.kill(target);
      return amount + absorbed;
    }

    magic(source, target, amount, opts) {
      return this.dealDamage(source, target, amount, Object.assign({ type: 'magic', spell: true }, opts || {}));
    }
    physical(source, target, amount, opts) {
      return this.dealDamage(source, target, amount, Object.assign({ type: 'physical', spell: true }, opts || {}));
    }
    trueDamage(source, target, amount, opts) {
      return this.dealDamage(source, target, amount, Object.assign({ type: 'true', spell: true }, opts || {}));
    }

    heal(source, target, amount) {
      if (!target || !target.alive || amount <= 0) return 0;
      amount *= this.healAmp(source || {});
      if (target.grievous > 0) amount *= (1 - (target.grievousPct || 0.5));
      const before = target.hp;
      target.hp = Math.min(target.hpMax, target.hp + Math.round(amount));
      const real = Math.round(target.hp - before);
      if (real > 0) this.events.push({ t: 'heal', uid: target.uid, value: real, cell: { r: target.r, c: target.c } });
      return real;
    }

    shield(target, amount, duration) {
      if (!target || !target.alive) return;
      target.shield += Math.round(amount);
      target.shieldTimer = Math.max(target.shieldTimer || 0, duration || 4);
      this.events.push({ t: 'shield', uid: target.uid, value: Math.round(amount), cell: { r: target.r, c: target.c } });
    }

    stun(target, duration) {
      if (!target || !target.alive) return;
      if (target.ccImmune || this.buffSum(target, 'ccImmune') > 0) return;
      target.stun = Math.max(target.stun, duration);
      this.events.push({ t: 'stun', uid: target.uid, value: duration });
    }

    cleanse(target) {
      target.stun = 0;
      this.events.push({ t: 'cleanse', uid: target.uid });
    }

    buff(target, obj, duration) {
      if (!target || !target.alive) return;
      const b = Object.assign({}, obj, { remaining: duration || 4 });
      target.buffs.push(b);
      if (obj.ccImmune) target.ccImmune = true;
      this.events.push({ t: 'buff', uid: target.uid, kind: Object.keys(obj)[0] });
    }

    burn(target, total, duration, source) {
      if (!target || !target.alive) return;
      target.dots.push({
        dps: total / duration, remaining: duration, tick: 0.5, source
      });
    }

    burnArea(source, center, radius, total, duration) {
      this.enemies(source).forEach(e => {
        if (hexDist(this.cellOf(e), center) <= radius) this.burn(e, total, duration, source);
      });
    }

    grievous(target, duration, pct) {
      if (!target || !target.alive) return;
      target.grievous = Math.max(target.grievous, duration);
      target.grievousPct = Math.max(target.grievousPct || 0, pct || 0.5);
    }

    /* ---------- 范围 / 直线 ---------- */
    aoe(source, center, radius, amount, type, exclude) {
      let hit = 0;
      this.enemies(source).forEach(e => {
        if (e === exclude) return;
        if (hexDist(this.cellOf(e), center) <= radius) {
          if (type === 'magic') this.magic(source, e, amount);
          else if (type === 'true') this.trueDamage(source, e, amount);
          else this.physical(source, e, amount);
          hit++;
        }
      });
      return hit;
    }

    beam(source, target, amount, type) {
      const from = this.cellOf(source);
      const ca = offsetToCube(source.r, source.c);
      const cb = offsetToCube(target.r, target.c);
      const len = cubeDistance(ca, cb) || 1;
      const ex = Math.round(cb.x + ((cb.x - ca.x) / len) * 4);
      const ez = Math.round(cb.z + ((cb.z - ca.z) / len) * 4);
      const end = cubeToOffset(ex, ez);
      const line = hexLine(from, end).filter(p => inBounds(p.r, p.c));
      const set = new Set(line.map(p => key(p.r, p.c)));
      this.enemies(source).forEach(e => {
        if (set.has(key(e.r, e.c))) {
          if (type === 'magic') this.magic(source, e, amount);
          else if (type === 'true') this.trueDamage(source, e, amount);
          else this.physical(source, e, amount);
        }
      });
      this.events.push({ t: 'beam', from, to: end, color: source.color, kind: type });
    }

    fx(kind, data) {
      this.events.push(Object.assign({ t: 'fx', kind }, data || {}));
    }

    after(delay, fn) {
      this.timers.push({ t: delay, fn });
    }

    /* ---------- 行动 ---------- */
    basicAttack(u, target, isExtra) {
      if (!u.alive || !target || !target.alive || this.over) return;
      if (u.stun > 0) return;
      const ranged = u.range > 1;
      this.events.push({
        t: 'attack', uid: u.uid, targetUid: target.uid,
        from: { r: u.r, c: u.c }, to: { r: target.r, c: target.c }, ranged
      });
      this.dealDamage(u, target, this.effAd(u), { type: 'physical', attack: true });
      u.mana = Math.min(u.manaMax, u.mana + 10);
      u.attackCd = Math.max(0.12, 1 / this.effAs(u));

      if (u.ricochet > 0 && target.alive) {
        const around = this.enemies(u)
          .filter(e => e !== target && this.dist(e, target) <= 2)
          .slice(0, u.ricochet);
        around.forEach(e => {
          this.dealDamage(u, e, this.effAd(u) * u.ricochetPct, { type: 'physical', spell: true });
          this.events.push({ t: 'ricochet', from: { r: target.r, c: target.c }, to: { r: e.r, c: e.c } });
        });
      }

      if (!isExtra && u.extraAttackChance > 0 && this.rng() < u.extraAttackChance) {
        this.after(0.08, () => {
          if (u.alive && target.alive && !this.over) this.basicAttack(u, target, true);
        });
        this.events.push({ t: 'extra', uid: u.uid });
      }
    }

    cast(u) {
      if (!u.def.spell || !u.def.spell.cast) return;
      const vals = u.def.spell.vals || {};
      u.mana = 0;
      u.castLock = 0.3;
      this.events.push({ t: 'cast', uid: u.uid, name: u.def.spell.name, cell: { r: u.r, c: u.c }, color: u.color });
      u.def.spell.cast(this, u, vals);
      if (u.blueBuff) u.mana = 20;
      if (u.sgMana > 0) {
        this.allies(u).forEach(a => {
          if (a.traits.includes('starguardian')) {
            a.mana = Math.min(a.manaMax, a.mana + u.sgMana);
          }
        });
      }
      this.checkEnd();
    }

    nextStep(u, target) {
      const start = { r: u.r, c: u.c };
      const sk = key(start.r, start.c);
      const prev = new Map();
      prev.set(sk, null);
      const q = [start];
      let found = null;
      while (q.length) {
        const cur = q.shift();
        if (!(cur.r === start.r && cur.c === start.c) && hexDist(cur, target) <= u.range) {
          found = cur; break;
        }
        const dirs = (cur.r & 1) ? NB_ODD : NB_EVEN;
        for (const d of dirs) {
          const nr = cur.r + d[0], nc = cur.c + d[1];
          if (!inBounds(nr, nc)) continue;
          const nk = key(nr, nc);
          if (prev.has(nk)) continue;
          const occ = this.occupied[nk];
          if (occ && occ.alive) continue;
          prev.set(nk, { r: cur.r, c: cur.c });
          q.push({ r: nr, c: nc });
        }
      }
      if (!found) return null;
      let cur = found;
      while (prev.get(key(cur.r, cur.c)) && !(prev.get(key(cur.r, cur.c)).r === start.r && prev.get(key(cur.r, cur.c)).c === start.c)) {
        cur = prev.get(key(cur.r, cur.c));
      }
      return cur;
    }

    moveUnit(u, step) {
      if (!step) return;
      this.occupied[key(u.r, u.c)] = null;
      u.r = step.r; u.c = step.c;
      this.occupied[key(u.r, u.c)] = u;
      u.moveCd = 0.36;
      this.events.push({ t: 'move', uid: u.uid, r: u.r, c: u.c });
    }

    /* ---------- 回合 ---------- */
    tick(dt) {
      if (this.over) return;
      this.time += dt;

      // 计时器
      if (this.timers.length) {
        const timers = this.timers;
        this.timers = [];
        timers.forEach(tm => {
          tm.t -= dt;
          if (tm.t <= 0) {
            if (!this.over) tm.fn();
          } else this.timers.push(tm);
        });
      }

      // 状态
      this.units.forEach(u => {
        if (!u.alive) return;
        u.stun = Math.max(0, u.stun - dt);
        u.castLock = Math.max(0, u.castLock - dt);
        u.attackCd = Math.max(0, u.attackCd - dt);
        u.moveCd = Math.max(0, u.moveCd - dt);
        u.grievous = Math.max(0, u.grievous - dt);
        if (u.grievous <= 0) u.grievousPct = 0;
        u.mrShred = Math.max(0, u.mrShred - dt);
        if (u.shield > 0) {
          u.shieldTimer -= dt;
          if (u.shieldTimer <= 0) { u.shield = 0; }
        }
        if (u.buffs.length) {
          u.buffs.forEach(b => { b.remaining -= dt; });
          u.buffs = u.buffs.filter(b => b.remaining > 0);
          u.ccImmune = u.buffs.some(b => b.ccImmune);
        }
        if (u.dots.length) {
          u.dots.forEach(d => {
            d.remaining -= dt; d.tick -= dt;
            if (d.tick <= 0) {
              d.tick += 0.5;
              this.dealDamage(d.source, u, d.dps * 0.5, { type: 'magic', dot: true });
            }
          });
          u.dots = u.dots.filter(d => d.remaining > 0 && u.alive);
        }
        if (u.warmog && u.hp > 0) this.heal(u, u, u.hpMax * 0.02 * dt);
        if (u.archangel) {
          u.archangelTimer -= dt;
          if (u.archangelTimer <= 0) {
            u.archangelTimer += 4;
            u.ap += 20; u.archangelStacks++;
            this.events.push({ t: 'buff', uid: u.uid, kind: 'ap' });
          }
        }
        if (u.redemption) {
          u.redemptionTimer -= dt;
          if (u.redemptionTimer <= 0) {
            u.redemptionTimer += 5;
            this.allies(u).forEach(a => this.heal(u, a, (a.hpMax - a.hp) * 0.08));
            this.events.push({ t: 'fx', kind: 'healAll', color: '#22d3ee' });
          }
        }
        if (u.ionic) {
          u.ionicTimer -= dt;
          if (u.ionicTimer <= 0) {
            u.ionicTimer += 3;
            this.enemies(u).forEach(e => {
              if (this.dist(u, e) <= 2) {
                e.mrShred = Math.max(e.mrShred, 4);
                this.magic(u, e, 60);
              }
            });
          }
        }
        if (u.sunfire) {
          u.sunfireTimer -= dt;
          if (u.sunfireTimer <= 0) {
            u.sunfireTimer += 1;
            this.enemies(u).forEach(e => {
              if (this.dist(u, e) <= 1) {
                this.magic(u, e, e.hpMax * 0.02);
                this.grievous(e, 3, 0.3);
              }
            });
          }
        }
      });

      // 机关
      if (this.time % 5 < dt) {
        this.units.forEach(u => {
          if (u.alive && u.futureTier && u.futureStacks < 5) {
            u.futureStacks++;
            this.events.push({ t: 'future', uid: u.uid });
          }
        });
      }

      // 行动
      const order = this.units.filter(u => u.alive);
      for (const u of order) {
        if (this.over) break;
        if (!u.alive || u.stun > 0 || u.castLock > 0) continue;
        if (!u.target || !u.target.alive) u.target = this.nearestTarget(u);
        let target = u.target;
        if (!target) { this.checkEnd(); continue; }

        if (u.mana >= u.manaMax && u.manaMax > 0) {
          this.cast(u);
          continue;
        }

        const d = this.dist(u, target);
        if (d <= u.range) {
          if (u.attackCd <= 0) this.basicAttack(u, target);
        } else if (u.moveCd <= 0) {
          const step = this.nextStep(u, target);
          if (step) this.moveUnit(u, step);
          else if (u.range > 1 && d <= u.range + 1) {
            if (u.attackCd <= 0) this.basicAttack(u, target);
          }
        }
      }

      this.checkEnd();
      if (!this.over && this.time >= 35) {
        const tickSecond = Math.floor(this.time) !== Math.floor(this.time - dt);
        if (tickSecond) {
          this.units.forEach(u => { if (u.alive) this.dealDamage(null, u, u.hpMax * 0.04, { type: 'true' }); });
        }
      }
      if (!this.over && this.time >= 50) {
        const p = this.units.filter(u => u.team === 'player' && u.alive);
        const e = this.units.filter(u => u.team === 'enemy' && u.alive);
        const pr = p.reduce((s, u) => s + u.hp / u.hpMax, 0);
        const er = e.reduce((s, u) => s + u.hp / u.hpMax, 0);
        this.finish(pr >= er ? 'player' : 'enemy', true);
      }
    }

    kill(u) {
      if (!u.alive) return;
      u.alive = false;
      u.hp = 0;
      u.shield = 0;
      this.occupied[key(u.r, u.c)] = null;
      this.events.push({ t: 'death', uid: u.uid, cell: { r: u.r, c: u.c } });
      this.units.forEach(x => { if (x.target === u) x.target = null; });
    }

    checkEnd() {
      if (this.over) return;
      const p = this.units.some(u => u.team === 'player' && u.alive);
      const e = this.units.some(u => u.team === 'enemy' && u.alive);
      if (!p && !e) this.finish('draw', false);
      else if (!p) this.finish('enemy', false);
      else if (!e) this.finish('player', false);
    }

    finish(winner, timeout) {
      if (this.over) return;
      this.over = true;
      this.winner = winner;
      this.timeout = !!timeout;
      this.events.push({ t: 'end', winner, timeout: !!timeout });
    }

    snapshot() {
      return this.units.map(u => ({
        uid: u.uid, hp: Math.max(0, Math.round(u.hp)), hpMax: u.hpMax,
        mana: Math.round(u.mana), manaMax: u.manaMax,
        shield: Math.round(u.shield), stun: u.stun,
        alive: u.alive, r: u.r, c: u.c, ad: Math.round(this.effAd(u)),
        ap: Math.round(this.effAp(u)), as: this.effAs(u)
      }));
    }
  }

  window.GF = window.GF || {};
  window.GF.Battle = Battle;
  window.GF.hex = { hexDist, offsetToCube, cubeToOffset, hexLine, key, inBounds, W, H };
})();
