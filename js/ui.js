/* 九州弈阵 · 单机版 —— 界面渲染与交互 */
(function () {
  'use strict';

  const D = window.GF.DATA;
  const ECON = D.ECON;
  const COST_COLORS = D.COST_COLORS;
  const BOARD_W = 478, BOARD_H = 462;
  const STAR_HP = [1, 1.8, 3.24];
  const STAR_AD = [1, 1.5, 2.25];
  const W = 7, H = 8;

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = n => Math.round(n).toLocaleString('zh-CN');

  function cellPct(r, c) {
    const x = 14 + 30 + c * 60 + ((r & 1) ? 30 : 0);
    const y = 14 + 35 + r * 52;
    return { x: (x / BOARD_W) * 100, y: (y / BOARD_H) * 100 };
  }
  function cellPx(el, r, c) {
    const rect = el.getBoundingClientRect();
    const p = cellPct(r, c);
    return { x: rect.width * p.x / 100, y: rect.height * p.y / 100, w: rect.width, h: rect.height };
  }
  function setUnitPos(el, r, c) {
    const p = cellPct(r, c);
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.style.zIndex = String(10 + Math.round(r * 2));
  }
  function itemName(id) { return (D.ITEM_BY_ID[id] || {}).name || id; }
  function traitName(id) { return (D.TRAITS[id] || {}).name || id; }
  function unitDef(id) { return D.UNIT_BY_ID[id] || D.MONSTER_BY_ID[id]; }
  function enemyOwnerLabel() {
    if (!UI.game) return '敌方';
    const st = UI.game.state;
    if (st.opponent) return `敌方 · ${st.opponent.name}`;
    if (st.pveWave) return '野怪';
    return '敌方';
  }
  function randomBetween(a, b) { return a + Math.random() * (b - a); }

  const Sound = {
    ctx: null,
    enabled: true,
    init() {
      if (!this.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
        } catch (e) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, gain, when, slide) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + (when || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.035, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    play(name) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      switch (name) {
        case 'click': this.tone(760, 0.04, 'triangle', 0.018); break;
        case 'buy': this.tone(660, 0.07, 'triangle', 0.035); this.tone(920, 0.09, 'triangle', 0.03, 0.06); break;
        case 'sell': this.tone(430, 0.08, 'triangle', 0.03); this.tone(300, 0.1, 'triangle', 0.025, 0.06); break;
        case 'refresh': this.tone(300, 0.1, 'sawtooth', 0.012, 0, 900); break;
        case 'place': this.tone(260, 0.05, 'sine', 0.04); break;
        case 'equip': this.tone(880, 0.06, 'sine', 0.03); this.tone(1180, 0.08, 'sine', 0.02, 0.05); break;
        case 'xp': this.tone(520, 0.05, 'triangle', 0.02); break;
        case 'combine':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.03, i * 0.07));
          break;
        case 'levelup':
          [392, 523, 659, 880].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.03, i * 0.08));
          break;
        case 'battle':
          this.tone(110, 0.25, 'sine', 0.08);
          this.tone(55, 0.4, 'sine', 0.06, 0.03);
          this.tone(440, 0.18, 'sawtooth', 0.012, 0.05, 220);
          break;
        case 'victory':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.036, i * 0.11));
          this.tone(1318, 0.5, 'sine', 0.025, 0.46);
          break;
        case 'defeat':
          [330, 294, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.03, i * 0.12));
          break;
        case 'chicken':
          [523, 784, 1047, 1318, 1568].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.038, i * 0.1));
          this.tone(2093, 0.6, 'sine', 0.025, 0.55);
          break;
        default: break;
      }
    }
  };

  const UI = {
    game: null,
    selectedUid: null,
    selectedItemIndex: null,
    drag: null,
    battleUnits: {},
    tooltipTarget: null,
    tooltipKey: '',
    tooltipPinned: false,
    resultVisible: false,
    resultTimer: null,
    bannerTimer: null,
    lastShopKey: '',
    suppressClick: false,
    difficulty: 'normal'
  };
  window.GF.UI = UI;
  window.GF.Sound = Sound;

  /* ============================================================
     初始化
     ============================================================ */
  UI.init = function () {
    UI.els = {
      homeScreen: $('homeScreen'),
      gameScreen: $('gameScreen'),
      startBtn: $('startBtn'),
      guideBtn: $('guideBtn'),
      homeHelpBtn: $('homeHelpBtn'),
      diffPicker: $('diffPicker'),
      homeHexfield: $('homeHexfield'),
      stageLabel: $('stageLabel'),
      stageType: $('stageType'),
      timerBox: $('timerBox'),
      timerLabel: $('timerLabel'),
      timerVal: $('timerVal'),
      timerFill: $('timerFill'),
      hpVal: $('hpVal'),
      hpFill: $('hpFill'),
      goldVal: $('goldVal'),
      interestHint: $('interestHint'),
      levelVal: $('levelVal'),
      xpText: $('xpText'),
      xpFill: $('xpFill'),
      streakPill: $('streakPill'),
      speedBtn: $('speedBtn'),
      soundBtn: $('soundBtn'),
      helpBtn: $('helpBtn'),
      traitList: $('traitList'),
      traitActive: $('traitActive'),
      powerVal: $('powerVal'),
      powerFill: $('powerFill'),
      powerHint: $('powerHint'),
      oppoInline: $('oppoInline'),
      oppoTraits: $('oppoTraits'),
      boardHint: $('boardHint'),
      scoutBtn: $('scoutBtn'),
      board: $('board'),
      boardShell: $('boardShell'),
      hexLayer: $('hexLayer'),
      unitLayer: $('unitLayer'),
      fxLayer: $('fxLayer'),
      boardCount: $('boardCount'),
      selectedBar: $('selectedBar'),
      selectedName: $('selectedName'),
      selectedStar: $('selectedStar'),
      sellSelectedBtn: $('sellSelectedBtn'),
      unequipBtn: $('unequipBtn'),
      readyBtn: $('readyBtn'),
      benchSlots: $('benchSlots'),
      benchCount: $('benchCount'),
      shopPanel: $('shopPanel'),
      shopLevel: $('shopLevel'),
      shopOdds: $('shopOdds'),
      shopCards: $('shopCards'),
      lockBtn: $('lockBtn'),
      xpBtn: $('xpBtn'),
      refreshBtn: $('refreshBtn'),
      playerList: $('playerList'),
      aliveCount: $('aliveCount'),
      oppoTag: $('oppoTag'),
      oppoCard: $('oppoCard'),
      itemSlots: $('itemSlots'),
      itemCount: $('itemCount'),
      logList: $('logList'),
      resultOverlay: $('resultOverlay'),
      resultKicker: $('resultKicker'),
      resultTitle: $('resultTitle'),
      resultSub: $('resultSub'),
      resDamageDealt: $('resDamageDealt'),
      resDamageTaken: $('resDamageTaken'),
      resHp: $('resHp'),
      resIncomeTotal: $('resIncomeTotal'),
      resIncomeRows: $('resIncomeRows'),
      resItems: $('resItems'),
      resNotes: $('resNotes'),
      resultBtn: $('resultBtn'),
      gameOver: $('gameOver'),
      goPlace: $('goPlace'),
      goTitle: $('goTitle'),
      goSub: $('goSub'),
      goStats: $('goStats'),
      goBoard: $('goBoard'),
      againBtn: $('againBtn'),
      homeBtn: $('homeBtn'),
      confetti: $('confetti'),
      helpModal: $('helpModal'),
      scoutModal: $('scoutModal'),
      scoutHead: $('scoutHead'),
      scoutBody: $('scoutBody'),
      tooltip: $('tooltip'),
      toasts: $('toasts'),
      dragGhost: $('dragGhost'),
      battleBanner: $('battleBanner')
    };

    buildHomeHexes();
    bindStaticEvents();
    bindGameEvents();
    bindDragEvents();
    bindKeyboard();
    bindTooltip();
    startLoop();
  };

  function buildHomeHexes() {
    const field = UI.els.homeHexfield;
    if (!field) return;
    for (let i = 0; i < 22; i++) {
      const h = document.createElement('i');
      h.className = 'float-hex';
      const size = randomBetween(34, 106);
      h.style.width = size + 'px';
      h.style.height = size * 1.16 + 'px';
      h.style.left = randomBetween(-4, 100) + '%';
      h.style.top = randomBetween(8, 96) + '%';
      h.style.animationDuration = randomBetween(12, 26) + 's';
      h.style.animationDelay = (-randomBetween(0, 20)) + 's';
      h.style.opacity = randomBetween(0.1, 0.45);
      field.appendChild(h);
    }
  }

  /* ============================================================
     事件绑定
     ============================================================ */
  function bindStaticEvents() {
    UI.els.diffPicker.addEventListener('click', e => {
      const b = e.target.closest('button[data-diff]');
      if (!b) return;
      UI.difficulty = b.dataset.diff;
      UI.els.diffPicker.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      Sound.play('click');
    });

    UI.els.startBtn.addEventListener('click', () => {
      Sound.init();
      Sound.play('click');
      UI.startGame(UI.difficulty);
    });
    UI.els.guideBtn.addEventListener('click', () => UI.openModal('help'));
    UI.els.homeHelpBtn.addEventListener('click', () => UI.openModal('help'));
    UI.els.helpBtn.addEventListener('click', () => UI.openModal('help'));
    UI.els.scoutBtn.addEventListener('click', () => UI.openScout());

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModals());
    });

    UI.els.speedBtn.addEventListener('click', () => {
      if (!UI.game) return;
      UI.game.state.speed = UI.game.state.speed === 1 ? 2 : 1;
      UI.els.speedBtn.textContent = UI.game.state.speed + '×';
      Sound.play('click');
    });

    UI.els.soundBtn.addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      try { localStorage.setItem('gf_sound', Sound.enabled ? '1' : '0'); } catch (e) { /* ignore */ }
      UI.els.soundBtn.classList.toggle('off', !Sound.enabled);
      if (Sound.enabled) Sound.play('click');
    });
    try {
      const saved = localStorage.getItem('gf_sound');
      if (saved === '0') { Sound.enabled = false; UI.els.soundBtn.classList.add('off'); }
    } catch (e) { /* ignore */ }

    UI.els.readyBtn.addEventListener('click', () => {
      if (!UI.game) return;
      if (UI.game.state.phase === 'prep') {
        UI.game.startCombat();
      } else if (UI.resultVisible) {
        continueResult();
      }
    });

    UI.els.refreshBtn.addEventListener('click', () => {
      if (!UI.game) return;
      const r = UI.game.refreshShop(true);
      if (!r.ok) UI.toast(r.msg, 'error');
    });
    UI.els.xpBtn.addEventListener('click', () => {
      if (!UI.game) return;
      const r = UI.game.buyXp();
      if (!r.ok) UI.toast(r.msg, 'error');
    });
    UI.els.lockBtn.addEventListener('click', () => {
      if (!UI.game) return;
      UI.game.toggleLock();
      const locked = UI.game.state.shopLocked;
      UI.toast(locked ? '商店已锁定，下回合保留' : '商店已解锁', 'success');
    });

    UI.els.sellSelectedBtn.addEventListener('click', () => {
      if (!UI.game || !UI.selectedUid) return;
      const r = UI.game.sellUnit(UI.selectedUid);
      if (!r.ok) UI.toast(r.msg, 'error');
      UI.selectUnit(null);
    });

    UI.els.unequipBtn.addEventListener('click', () => {
      if (!UI.game || !UI.selectedUid) return;
      const r = UI.game.unequipAll(UI.selectedUid);
      if (!r.ok) UI.toast(r.msg || '无法卸下装备', 'error');
      else {
        hideTooltip();
        UI.toast(`已卸下 ${r.count} 件装备`, 'success');
      }
    });

    UI.els.resultBtn.addEventListener('click', continueResult);

    UI.els.againBtn.addEventListener('click', () => {
      Sound.play('click');
      UI.els.gameOver.classList.add('hidden');
      UI.startGame(UI.game ? UI.game.difficulty : UI.difficulty);
    });
    UI.els.homeBtn.addEventListener('click', () => {
      Sound.play('click');
      UI.returnHome();
    });

    UI.els.shopCards.addEventListener('click', e => {
      const card = e.target.closest('.shop-card');
      if (!card || !UI.game) return;
      if (UI.game.state.phase !== 'prep' && UI.game.state.phase !== 'combat') { UI.toast('回合结算中无法购买', 'error'); return; }
      const idx = +card.dataset.shopIndex;
      hideTooltip();
      const r = UI.game.buyUnit(idx);
      if (!r.ok) UI.toast(r.msg, 'error');
    });

    UI.els.benchSlots.addEventListener('click', e => {
      if (!UI.game || UI.game.state.phase !== 'prep') return;
      if (e.target.closest('.unit')) return;
      const slot = e.target.closest('[data-bench]');
      if (!slot) return;
      if (UI.selectedUid) {
        const r = UI.game.moveToBench(UI.selectedUid, +slot.dataset.bench);
        if (!r.ok) UI.toast(r.msg, 'error');
      }
    });

    UI.els.benchSlots.addEventListener('dblclick', e => {
      const unit = e.target.closest('.unit[data-uid]');
      if (!unit || !UI.game) return;
      if (UI.game.state.phase !== 'prep') return;
      const r = UI.game.autoPlace(unit.dataset.uid);
      if (!r.ok && r.msg) UI.toast(r.msg, 'error');
      else if (r.ok) Sound.play('place');
    });

    UI.els.board.addEventListener('click', e => {
      if (!UI.game || UI.game.state.phase !== 'prep') return;
      if (e.target.closest('.unit')) return;
      const cell = e.target.closest('.hex-cell');
      if (!cell) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (UI.selectedItemIndex !== null) {
        const u = UI.game.unitAt(r, c);
        if (u) {
          equipSelectedItem(u.uid);
        } else {
          UI.toast('请点击一名棋子来装备', 'error');
        }
        return;
      }
      if (UI.selectedUid) {
        const res = UI.game.moveUnit(UI.selectedUid, r, c);
        if (!res.ok) UI.toast(res.msg, 'error');
      } else {
        UI.selectUnit(null);
      }
      hideTooltip();
    });

    // 点击敌方英雄（侦察残影或战斗中的敌方棋子）查看详情
    UI.els.unitLayer.addEventListener('click', e => {
      if (!UI.game) return;
      const el = e.target.closest('.unit');
      if (!el || !el.classList.contains('enemy')) return;
      const phase = UI.game.state.phase;
      if (phase !== 'prep' && phase !== 'combat') return;
      UI.selectUnit(null);
      pinUnitTooltip(el);
    });

    UI.els.oppoCard.addEventListener('click', e => {
      if (e.target.closest('.mini-btn')) return;
      if (UI.game && UI.game.state.phase === 'prep') UI.openScout();
    });

    // 点击空白区域时关闭固定在屏幕上的英雄详情
    document.addEventListener('click', e => {
      if (!UI.tooltipPinned) return;
      if (e.target.closest && e.target.closest('[data-tip]')) return;
      hideTooltip();
    }, true);

    // 拖拽结束后的第一次 click 直接吞掉，避免误触棋盘/商店
    document.addEventListener('click', e => {
      if (!UI.suppressClick) return;
      UI.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // 点击空白取消选择
    document.addEventListener('click', e => {
      if (!UI.game) return;
      if (e.target.closest('.unit, .item-chip, .board, .bench-slot, .selected-bar, .item-slot')) return;
      UI.selectUnit(null);
      UI.selectItem(null);
    });
  }

  function bindGameEvents() { /* game 实例事件在 startGame 中绑定 */ }

  function bindTooltip() {
    document.addEventListener('pointermove', e => {
      if (UI.drag && UI.drag.active) { hideTooltip(); return; }
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (UI.tooltipPinned) {
        // 点击打开的详情弹窗会保持在原位，只有移动到另一个可查看目标时才切换
        if (!t) return;
        UI.tooltipPinned = false;
      }
      if (!t) { hideTooltip(); return; }
      const key = [t.dataset.tip, t.dataset.id, t.dataset.star, t.dataset.items, t.dataset.count].join('|');
      if (key !== UI.tooltipKey) {
        UI.tooltipKey = key;
        UI.tooltipTarget = t;
        showTooltipFor(t);
      }
      positionTooltip(e.clientX, e.clientY);
    });
    document.addEventListener('pointerleave', hideTooltip);
    window.addEventListener('blur', hideTooltip);
  }

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!UI.els.helpModal.classList.contains('hidden') || !UI.els.scoutModal.classList.contains('hidden')) {
          UI.closeModals();
        } else if (UI.resultVisible) {
          continueResult();
        } else {
          UI.selectUnit(null);
          UI.selectItem(null);
        }
        return;
      }
      if (UI.isPaused()) return;
      if (!UI.game) return;

      if (UI.resultVisible) {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          continueResult();
        }
        return;
      }
      if (UI.game.state.phase === 'prep') {
        if (e.code === 'Space') {
          e.preventDefault();
          UI.game.startCombat();
        } else if (e.key === 'd' || e.key === 'D') {
          const r = UI.game.refreshShop(true);
          if (!r.ok) UI.toast(r.msg, 'error');
        } else if (e.key === 'f' || e.key === 'F') {
          const r = UI.game.buyXp();
          if (!r.ok) UI.toast(r.msg, 'error');
        } else if (e.key === 'e' || e.key === 'E') {
          if (UI.selectedUid) {
            UI.game.sellUnit(UI.selectedUid);
            UI.selectUnit(null);
          }
        } else if (/^[1-5]$/.test(e.key)) {
          const r = UI.game.buyUnit(+e.key - 1);
          if (!r.ok) UI.toast(r.msg, 'error');
        }
      }
    });
  }

  /* ============================================================
     游戏生命周期
     ============================================================ */
  UI.startGame = function (difficulty) {
    Sound.init();
    clearTimeout(UI.resultTimer);
    UI.resultVisible = false;
    UI.selectedUid = null;
    UI.selectedItemIndex = null;
    UI.battleUnits = {};
    UI.lastShopKey = '';
    UI.tooltipKey = '';

    UI.els.homeScreen.classList.add('hidden');
    UI.els.gameScreen.classList.remove('hidden');
    UI.els.gameOver.classList.add('hidden');
    UI.els.resultOverlay.classList.add('hidden');
    UI.els.helpModal.classList.add('hidden');
    UI.els.scoutModal.classList.add('hidden');
    UI.els.battleBanner.classList.add('hidden');
    UI.els.unitLayer.innerHTML = '';
    UI.els.fxLayer.innerHTML = '';
    UI.els.dragGhost.classList.add('hidden');
    UI.els.confetti.innerHTML = '';
    hideTooltip();

    const game = new window.GF.Game({ difficulty: difficulty || 'normal' });
    UI.game = game;
    const st = game.state;
    UI.els.speedBtn.textContent = st.speed + '×';
    UI.els.soundBtn.classList.toggle('off', !Sound.enabled);

    game.on('change', () => UI.renderAll());
    game.on('roundStart', () => UI.onRoundStart());
    game.on('battleStart', b => UI.onBattleStart(b));
    game.on('battleEnd', r => UI.onBattleEnd(r));
    game.on('gameOver', () => UI.showGameOver());
    game.on('toast', t => UI.toast(t.text, t.kind));
    game.on('sfx', name => Sound.play(name));
    game.on('log', () => UI.renderLog());
    game.on('damageFlash', () => UI.flashHp());

    buildHexes();
    UI.renderAll();
  };

  UI.returnHome = function () {
    UI.game = null;
    UI.els.gameScreen.classList.add('hidden');
    UI.els.homeScreen.classList.remove('hidden');
    UI.els.gameOver.classList.add('hidden');
    UI.els.resultOverlay.classList.add('hidden');
    UI.els.helpModal.classList.add('hidden');
    UI.els.scoutModal.classList.add('hidden');
    UI.els.unitLayer.innerHTML = '';
    UI.els.fxLayer.innerHTML = '';
    UI.els.confetti.innerHTML = '';
    hideTooltip();
  };

  function buildHexes() {
    const layer = UI.els.hexLayer;
    layer.innerHTML = '';
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const d = document.createElement('div');
        d.className = 'hex-cell ' + (r < 4 ? 'enemy' : 'player');
        d.dataset.r = r; d.dataset.c = c; d.dataset.cell = '1';
        const p = cellPct(r, c);
        d.style.left = p.x + '%';
        d.style.top = p.y + '%';
        layer.appendChild(d);
      }
    }
  }

  UI.onRoundStart = function () {
    clearTimeout(UI.resultTimer);
    UI.resultVisible = false;
    UI.selectedUid = null;
    UI.selectedItemIndex = null;
    UI.els.resultOverlay.classList.add('hidden');
    UI.els.gameOver.classList.add('hidden');
    UI.els.battleBanner.classList.add('hidden');
    UI.els.unitLayer.innerHTML = '';
    UI.els.fxLayer.innerHTML = '';
    UI.els.board.classList.remove('battle-active');
    UI.battleUnits = {};
    hideTooltip();
  };

  UI.onBattleStart = function (battle) {
    if (!UI.game) return;
    hideTooltip();
    UI.selectedUid = null;
    UI.selectedItemIndex = null;
    UI.resultVisible = false;
    clearTimeout(UI.resultTimer);
    UI.els.resultOverlay.classList.add('hidden');
    UI.els.unitLayer.innerHTML = '';
    UI.els.fxLayer.innerHTML = '';
    UI.els.board.classList.add('battle-active');
    UI.battleUnits = {};
    UI.els.benchSlots.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));

    battle.units.forEach(u => {
      const el = makeUnitEl(u, 'in-battle');
      el.dataset.uid = u.uid;
      el.dataset.team = u.team;
      if (u.team === 'enemy') el.dataset.owner = enemyOwnerLabel();
      setUnitPos(el, u.r, u.c);
      UI.els.unitLayer.appendChild(el);
      UI.battleUnits[u.uid] = el;
      updateUnitBars(u, el);
    });
    UI.renderTop();
    UI.renderShop();
    UI.renderTraits();
    UI.renderSelected();
    UI.showBanner('战 斗 开 始', 'gold');
    UI.els.readyBtn.textContent = '战斗中…';
    UI.els.readyBtn.disabled = true;
  };

  UI.onBattleEnd = function (result) {
    if (!result) return;
    UI.showBanner(result.win ? '胜 利' : (result.draw ? '平 局' : '战 败'), result.win ? 'gold' : 'red');
    clearTimeout(UI.resultTimer);
    UI.resultTimer = setTimeout(() => {
      if (UI.game && UI.game.state.result === result) UI.showResult(result);
    }, 850);
  };

  UI.showResult = function (result) {
    if (!UI.game) return;
    hideTooltip();
    UI.resultVisible = true;
    const title = result.win ? '胜利' : (result.draw ? '平局' : '战败');
    UI.els.resultTitle.textContent = title;
    UI.els.resultTitle.className = 'result-title ' + (result.win ? 'win' : result.draw ? 'draw' : 'lose');
    UI.els.resultKicker.textContent = `第 ${result.stageLabel} 回合 · ${result.pve ? '野怪' : '玩家对战'}`;
    const oppName = result.pve ? result.pveName : (result.opponent ? result.opponent.name : '对手');
    UI.els.resultSub.textContent = result.win
      ? `你击败了 ${oppName}${result.playerSurvivors ? '，场上还剩 ' + result.playerSurvivors + ' 名棋子' : ''}`
      : result.draw
        ? '双方鏖战至时间耗尽'
        : `${oppName} 的阵容更胜一筹${result.enemySurvivors ? '，对方还剩 ' + result.enemySurvivors + ' 名棋子' : ''}`;
    UI.els.resDamageDealt.textContent = result.damageToOpponent || 0;
    UI.els.resDamageTaken.textContent = result.damageToPlayer || 0;
    UI.els.resHp.textContent = result.playerHp != null ? result.playerHp : UI.game.state.hp;

    const inc = result.income || {};
    UI.els.resIncomeTotal.textContent = '+' + (inc.total || 0);
    const rows = [
      ['基础收入', inc.base || 0],
      ['存款利息', inc.interest || 0],
      ['连胜/连败', inc.streak || 0],
      ['胜利奖励', inc.win || 0],
      ['野怪奖励', inc.pve || 0]
    ].filter(x => x[1] > 0);
    UI.els.resIncomeRows.innerHTML = rows.map(r =>
      `<div class="income-row"><span>${r[0]}</span><b>+${r[1]}</b></div>`
    ).join('');

    UI.els.resItems.innerHTML = (result.items && result.items.length)
      ? result.items.map(name => {
        const item = D.ALL_ITEMS.find(i => i.name === name);
        return `<span class="res-item${item && item.component ? ' component' : ''}" style="--item-color:${item ? item.color : '#64748b'}">${name}${item && item.component ? ' · 材料' : ''}</span>`;
      }).join('')
      : '';

    const notes = [];
    if (result.levelAfter > result.levelBefore) notes.push(`<b>升级！</b> 等级提升至 ${result.levelAfter} 级，上阵位 +1`);
    if (result.autoSoldItems > 0) notes.push(`装备席已满，${result.autoSoldItems} 件掉落装备已转换为金币`);
    if (result.eliminated && result.eliminated.length) {
      notes.push(result.eliminated.map(e => e.name === '你' ? `<b>你被淘汰（第 ${e.place} 名）</b>` : `${e.name} 被淘汰（第 ${e.place} 名）`).join(' · '));
    }
    if (result.gameOver && result.placement) notes.push(`本局最终排名：<b>第 ${result.placement} 名</b>`);
    if (!notes.length) {
      notes.push(UI.game.state.streak >= 2
        ? `${UI.game.state.streakType === 'win' ? '连胜' : '连败'} ${UI.game.state.streak} 场`
        : '调整站位，准备下一回合');
    }
    UI.els.resNotes.innerHTML = notes.join('<br>');
    UI.els.resultBtn.textContent = result.gameOver ? '查看结算' : '继续';
    UI.els.resultOverlay.classList.remove('hidden');
  };

  function continueResult() {
    if (!UI.game) return;
    UI.els.resultOverlay.classList.add('hidden');
    UI.resultVisible = false;
    UI.game.continueFromResult();
    if (UI.game.state.phase === 'prep') UI.renderAll();
  }

  UI.showGameOver = function () {
    if (!UI.game) return;
    clearTimeout(UI.resultTimer);
    const st = UI.game.state;
    const place = st.placement || 8;
    UI.els.resultOverlay.classList.add('hidden');
    UI.els.gameOver.classList.remove('hidden');
    UI.els.gameOver.classList.toggle('rank1', place === 1);
    UI.resultVisible = false;
    hideTooltip();
    UI.els.goPlace.textContent = place;
    UI.els.goTitle.textContent = UI.game.getPlacementTitle(place);
    const diffName = { easy: '轻松', normal: '标准', hard: '挑战' }[UI.game.difficulty] || '标准';
    const info = UI.game.getStageInfo();
    const capNote = st.round >= 30 ? ' · 30 回合上限' : '';
    UI.els.goSub.textContent = `坚持到第 ${info.label} 回合 · ${diffName}难度${capNote}`;

    const myUnits = UI.game.getBoardUnits();
    const three = myUnits.filter(u => u.star === 3).length;
    UI.els.goStats.innerHTML = `
      <div class="go-stat"><span>最终排名</span><b>#${place}</b></div>
      <div class="go-stat"><span>最终等级</span><b>${st.level}</b></div>
      <div class="go-stat"><span>剩余金币</span><b>${st.gold}</b></div>
      <div class="go-stat"><span>战绩</span><b>${st.wins}胜 / ${st.losses}负</b></div>
      <div class="go-stat"><span>三星棋子</span><b>${three}</b></div>
      <div class="go-stat"><span>阵容战力</span><b>${UI.game.boardPower()}</b></div>
    `;

    UI.els.goBoard.innerHTML = '';
    myUnits.sort((a, b) => b.def.cost - a.def.cost || b.star - a.star).forEach(u => {
      const div = document.createElement('div');
      div.className = 'go-unit';
      div.innerHTML = `
        <div class="unit-avatar" style="--accent:${u.def.color};--cost-color:${COST_COLORS[u.def.cost] || '#94a3b8'};border-color:${COST_COLORS[u.def.cost] || '#94a3b8'}"><span>${u.def.glyph || u.def.name[0]}</span></div>
        <div class="go-unit-stars">${'★'.repeat(u.star)}</div>
        <div class="go-unit-name">${u.def.name}</div>
        <div class="go-unit-items">${u.items.map(id => `<i style="--item-color:${(D.ITEM_BY_ID[id] || {}).color || '#64748b'}"></i>`).join('')}</div>
      `;
      UI.els.goBoard.appendChild(div);
    });
    if (!myUnits.length) UI.els.goBoard.innerHTML = '<div class="scout-empty">空无一子</div>';

    UI.els.confetti.innerHTML = '';
    if (place === 1) {
      const colors = ['#f6c453', '#ffe6a3', '#5aa9ff', '#4ade80', '#c084fc', '#ff5d73'];
      for (let i = 0; i < 46; i++) {
        const p = document.createElement('i');
        p.style.left = randomBetween(0, 100) + '%';
        p.style.background = colors[i % colors.length];
        p.style.setProperty('--dur', randomBetween(2.2, 4.5) + 's');
        p.style.setProperty('--delay', randomBetween(0, 2.5) + 's');
        p.style.setProperty('--rot', randomBetween(0, 360) + 'deg');
        p.style.width = randomBetween(3, 7) + 'px';
        p.style.height = randomBetween(7, 14) + 'px';
        UI.els.confetti.appendChild(p);
      }
    }
    if (place === 1) Sound.play('chicken');
  };

  /* ============================================================
     渲染：静态面板
     ============================================================ */
  UI.renderAll = function () {
    if (!UI.game) return;
    UI.renderTop();
    UI.renderTraits();
    UI.renderShop();
    UI.renderBench();
    UI.renderItems();
    UI.renderPlayers();
    UI.renderOpponent();
    UI.renderLog();
    UI.renderPower();
    if (UI.game.state.phase === 'prep') UI.renderBoard();
    UI.renderSelected();
  };

  UI.renderTop = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    const info = UI.game.getStageInfo();
    UI.els.stageLabel.textContent = info.label;
    const oppName = st.pveWave ? st.pveWave.name : (st.opponent ? st.opponent.name : '准备中');
    UI.els.stageType.textContent = st.pveWave ? `野怪 · ${oppName}` : `对手 · ${oppName}`;
    UI.els.stageType.className = 'stage-type ' + (st.pveWave ? 'pve' : 'pvp');

    UI.els.hpVal.textContent = Math.max(0, st.hp);
    UI.els.hpFill.style.width = Math.max(0, Math.min(100, st.hp)) + '%';
    UI.els.goldVal.textContent = st.gold;
    const interest = Math.min(5, Math.floor(st.gold / 10));
    UI.els.interestHint.textContent = `利息 +${interest}`;
    UI.els.levelVal.textContent = st.level;
    const need = UI.game.xpNeed();
    UI.els.xpText.textContent = st.level >= ECON.maxLevel ? 'MAX' : `${st.xp} / ${need}`;
    UI.els.xpFill.style.width = st.level >= ECON.maxLevel ? '100%' : Math.min(100, (st.xp / Math.max(1, need)) * 100) + '%';

    aar(st.streak > 0, () => {
      UI.els.streakPill.classList.add('show');
      UI.els.streakPill.textContent = `${st.streakType === 'win' ? '连胜' : '连败'} ${st.streak}`;
      UI.els.streakPill.className = 'streak-pill show ' + (st.streakType === 'win' ? 'win' : 'loss');
    }, () => {
      UI.els.streakPill.classList.remove('show');
    });

    const odds = ECON.shopOdds[st.level] || [];
    UI.els.shopOdds.textContent = odds.map((p, i) => p > 0 ? `${i + 1}费 ${Math.round(p * 100)}%` : null).filter(Boolean).join(' · ');
    UI.els.shopLevel.textContent = st.level;

    const count = UI.game.boardCount();
    UI.els.boardCount.innerHTML = `上阵 <b>${count}</b> / ${st.level}`;
    UI.els.readyBtn.textContent = st.phase === 'prep' ? '开始战斗' : st.phase === 'combat' ? '战斗中…' : st.phase === 'result' ? '结算中…' : '对局结束';
    UI.els.readyBtn.disabled = st.phase !== 'prep';
    UI.els.scoutBtn.disabled = st.phase !== 'prep';
    const canShop = st.phase === 'prep' || st.phase === 'combat';
    UI.els.lockBtn.disabled = !canShop;
    UI.els.lockBtn.classList.toggle('active', st.shopLocked);
    UI.els.lockBtn.setAttribute('aria-pressed', st.shopLocked ? 'true' : 'false');
    const lockLabel = UI.els.lockBtn.querySelector('.lock-label');
    const lockSub = UI.els.lockBtn.querySelector('.lock-sub');
    if (lockLabel) lockLabel.textContent = st.shopLocked ? '已锁定' : '锁定商店';
    if (lockSub) lockSub.textContent = st.shopLocked ? '下回合保留' : '锁定后保留';
    UI.els.lockBtn.title = st.shopLocked ? '商店已锁定：下回合保留当前卡牌' : '锁定商店：下回合保留当前卡牌';
    UI.els.refreshBtn.disabled = !canShop || st.gold < ECON.refreshCost;
    UI.els.xpBtn.disabled = !canShop || st.gold < ECON.xpBuyCost || st.level >= ECON.maxLevel;
    UI.els.speedBtn.textContent = st.speed + '×';

    if (st.phase === 'prep') {
      UI.els.timerBox.classList.remove('combat');
    } else if (st.phase === 'combat') {
      UI.els.timerBox.classList.add('combat');
    } else {
      UI.els.timerBox.classList.remove('combat');
    }
    UI.updateTimer();
  };

  function aar(cond, yes, no) { if (cond) yes(); else no(); }

  UI.renderTraits = function () {
    if (!UI.game) return;
    const list = UI.game.getTraits();
    const visible = list.filter(t => t.count > 0);
    const active = visible.filter(t => t.tier > 0).length;
    UI.els.traitActive.textContent = `${active} 激活`;
    if (!visible.length) {
      UI.els.traitList.innerHTML = '<div class="trait-empty">上阵棋子后<br>这里会显示已激活的羁绊</div>';
      return;
    }
    visible.sort((a, b) => (b.tier - a.tier) || (b.count - a.count));
    UI.els.traitList.innerHTML = visible.map(t => {
      const def = t.def;
      const next = def.breakpoints.find(bp => bp > t.count);
      const pips = def.breakpoints.map(bp => `<i class="${t.count >= bp ? 'on' : ''}"></i>`).join('');
      const roman = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][t.tier] || '';
      return `
        <div class="trait-row ${t.tier ? 'active' : 'inactive'}" style="--tc:${def.color}"
             data-tip="trait" data-id="${t.id}" data-count="${t.count}">
          <div class="trait-icon"><span>${def.glyph}</span></div>
          <div>
            <div class="trait-name-line">
              <span class="trait-name">${def.name}</span>
              <span class="trait-count">${t.count}${next ? ' / ' + next : ''}</span>
            </div>
            <div class="trait-pips">${pips}</div>
          </div>
          ${t.tier ? `<span class="trait-tier-badge">${roman}</span>` : ''}
        </div>`;
    }).join('');
  };

  function shopOwnedInfo(id) {
    const list = [];
    UI.game.units.forEach(u => { if (u.id === id) list.push(u); });
    if (!list.length) return { count: 0, maxStar: 0, upgradeTo: 0 };
    const counts = [0, 0, 0, 0];
    list.forEach(u => { if (u.star >= 1 && u.star <= 3) counts[u.star]++; });
    const maxStar = counts[3] ? 3 : counts[2] ? 2 : counts[1] ? 1 : 0;
    const t = counts.slice();
    t[1]++;
    while (t[1] >= 3) { t[1] -= 3; t[2]++; }
    while (t[2] >= 3) { t[2] -= 3; t[3]++; }
    const after = t[3] ? 3 : t[2] ? 2 : t[1] ? 1 : 0;
    return { count: list.length, maxStar, upgradeTo: after > maxStar ? after : 0 };
  }

  UI.renderShop = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    const key = JSON.stringify(st.shop) + '|' + st.level;
    const changed = key !== UI.lastShopKey;
    UI.lastShopKey = key;
    UI.els.shopCards.innerHTML = st.shop.map((slot, i) => {
      const def = D.UNIT_BY_ID[slot.id];
      if (!def) return '';
      const traits = def.traits.map(id => `<i>${traitName(id)}</i>`).join('');
      const sold = slot.sold ? ' sold' : '';
      const poor = st.gold < def.cost ? ' poor' : '';
      const phase = (st.phase !== 'prep' && st.phase !== 'combat') ? ' locked-phase' : '';
      const owned = shopOwnedInfo(def.id);
      const showOwned = !slot.sold && owned.count > 0;
      const showUpgrade = !slot.sold && owned.upgradeTo > 0;
      const ownedClass = showOwned ? ' has-owned' : '';
      const upgradeClass = showUpgrade ? ' can-upgrade' : '';
      const ownedText = showOwned
        ? (owned.maxStar >= 3 ? '已3星' : `已有${owned.count}${owned.maxStar > 1 ? ' ' + '★'.repeat(owned.maxStar) : ''}`)
        : '';
      return `
        <div class="shop-card cost-${def.cost}${sold}${poor}${phase}${ownedClass}${upgradeClass}" data-shop-index="${i}"
             style="--cost-color:${COST_COLORS[def.cost]};--accent:${def.color}"
             data-tip="unit" data-id="${def.id}" data-star="1" data-items="">
          <span class="cost-badge">${def.cost}</span>
          ${showOwned ? `<span class="shop-owned${owned.maxStar >= 3 ? ' max' : ''}">${ownedText}</span>` : ''}
          ${showUpgrade ? `<span class="shop-upgrade">买下升${owned.upgradeTo}星</span>` : ''}
          <div class="shop-avatar"><span>${def.glyph || def.name[0]}</span></div>
          <div class="shop-info">
            <div class="shop-name">${def.name}</div>
            <div class="shop-traits">${traits}</div>
          </div>
          <div class="price">${def.cost}</div>
        </div>`;
    }).join('');
    if (changed) {
      UI.els.shopCards.classList.add('deal');
      setTimeout(() => UI.els.shopCards.classList.remove('deal'), 320);
    }
  };

  UI.renderBench = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    UI.els.benchSlots.innerHTML = '';
    if (UI.els.benchCount) {
      UI.els.benchCount.textContent = `${UI.game.bench.filter(Boolean).length}/${ECON.benchSize}`;
    }
    for (let i = 0; i < ECON.benchSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'bench-slot' + (st.phase !== 'prep' ? ' locked' : '');
      slot.dataset.bench = i;
      const u = UI.game.bench[i];
      if (u) {
        slot.classList.add('filled');
        const el = makeUnitEl(u, 'in-bench');
        el.dataset.uid = u.uid;
        if (UI.selectedUid === u.uid) el.classList.add('selected');
        slot.appendChild(el);
      }
      UI.els.benchSlots.appendChild(slot);
    }
  };

  UI.renderBoard = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    UI.els.unitLayer.innerHTML = '';
    UI.els.fxLayer.innerHTML = '';
    UI.els.board.classList.remove('battle-active');

    const boardUnits = UI.game.getBoardUnits();
    boardUnits.forEach(u => {
      const el = makeUnitEl(u, 'on-board');
      el.dataset.uid = u.uid;
      el.dataset.r = u.r; el.dataset.c = u.c;
      if (UI.selectedUid === u.uid) el.classList.add('selected');
      setUnitPos(el, u.r, u.c);
      UI.els.unitLayer.appendChild(el);
    });

    const enemyRefs = UI.game.getEnemyRefs();
    enemyRefs.forEach(ref => {
      if (ref.r == null || ref.c == null) return;
      const el = makeUnitEl({ def: ref.def, star: ref.star, items: ref.items || [] }, 'ghost');
      el.dataset.ghost = '1';
      el.dataset.owner = enemyOwnerLabel();
      el.dataset.r = ref.r; el.dataset.c = ref.c;
      setUnitPos(el, ref.r, ref.c);
      UI.els.unitLayer.appendChild(el);
    });

    UI.els.boardCount.innerHTML = `上阵 <b>${boardUnits.length}</b> / ${st.level}`;
    UI.els.readyBtn.textContent = '开始战斗';
    UI.els.readyBtn.disabled = st.phase !== 'prep';
  };

  UI.renderItems = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    const count = st.itemBench.filter(Boolean).length;
    UI.els.itemCount.textContent = `${count} / ${ECON.itemBenchSize}`;
    UI.els.itemSlots.innerHTML = '';
    st.itemBench.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'item-slot' + (id ? ' filled' : '');
      if (id) {
        const item = D.ITEM_BY_ID[id];
        const chip = document.createElement('div');
        chip.className = 'item-chip' + (item.component ? ' component' : '') + (UI.selectedItemIndex === i ? ' selected' : '');
        chip.dataset.itemIndex = i;
        chip.dataset.tip = 'item';
        chip.dataset.id = id;
        chip.style.setProperty('--item-color', item.color);
        chip.textContent = item.short;
        slot.appendChild(chip);
      }
      UI.els.itemSlots.appendChild(slot);
    });
  };

  UI.renderPlayers = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    UI.els.aliveCount.textContent = `${UI.game.getAliveCount()} 人存活`;
    const rows = [];
    const playerAlive = st.hp > 0;
    rows.push(`
      <div class="player-row me ${playerAlive ? '' : 'dead'}">
        <div class="player-ava" style="--pc:#5aa9ff">你</div>
        <div class="player-mid">
          <div class="player-name-line"><span class="player-name">你</span><span class="player-lvl">Lv.${st.level}</span></div>
          <div class="player-hpbar ${st.hp <= 30 ? 'low' : ''}"><i style="width:${Math.max(0, st.hp)}%"></i></div>
        </div>
        <div class="player-hpnum">${Math.max(0, st.hp)}</div>
      </div>`);
    st.bots.forEach(b => {
      const isOpp = st.opponent && st.opponent.id === b.id;
      const dead = !b.alive;
      rows.push(`
        <div class="player-row ${isOpp ? 'opponent' : ''} ${dead ? 'dead' : ''}">
          <div class="player-ava" style="--pc:${b.color}">${b.glyph}</div>
          <div class="player-mid">
            <div class="player-name-line">
              <span class="player-name">${b.name}${dead ? ` · 第${b.place}名` : ''}</span>
              <span class="player-lvl">${dead ? '' : 'Lv.' + b.level}</span>
            </div>
            <div class="player-hpbar ${b.hp <= 30 ? 'low' : ''}"><i style="width:${Math.max(0, b.hp)}%"></i></div>
          </div>
          <div class="player-hpnum">${dead ? '—' : Math.max(0, b.hp)}</div>
        </div>`);
    });
    UI.els.playerList.innerHTML = rows.join('');
  };

  UI.renderOpponent = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    let name, glyph, color, hpText, levelText, traitList, unitRefs, pve;
    if (st.pveWave) {
      pve = true;
      name = st.pveWave.name;
      glyph = '兽'; color = '#ff5d73';
      hpText = `${st.pveWave.units.length} 只野怪`;
      levelText = '野怪回合';
      unitRefs = UI.game.getEnemyRefs();
      traitList = [];
    } else if (st.opponent) {
      pve = false;
      const b = st.opponent;
      name = b.name; glyph = b.glyph; color = b.color;
      hpText = `${Math.max(0, b.hp)} 生命`;
      levelText = `Lv.${b.level}`;
      unitRefs = UI.game.getEnemyRefs();
      traitList = UI.game.getOpponentTraits();
    } else {
      pve = false;
      name = '暂无对手'; glyph = '?'; color = '#64748b';
      hpText = '准备中'; levelText = ''; unitRefs = []; traitList = [];
    }

    UI.els.oppoTag.textContent = pve ? '野怪' : '玩家';
    UI.els.oppoInline.querySelector('.oppo-ava').textContent = glyph;
    UI.els.oppoInline.querySelector('.oppo-ava').style.background = `linear-gradient(140deg, ${color}, ${color}99)`;
    UI.els.oppoInline.querySelector('.oppo-text b').textContent = name;
    UI.els.oppoInline.querySelector('.oppo-text small').textContent = `${levelText}${pve ? '' : ' · ' + hpText}`;
    UI.els.oppoTraits.innerHTML = pve ? '' : traitList.filter(t => t.count > 0).slice(0, 4).map(t =>
      `<span class="oppo-trait-chip ${t.tier ? 'active' : ''}">${t.def.name} ${t.count}</span>`
    ).join('');

    if (!st.opponent && !st.pveWave) {
      UI.els.oppoCard.innerHTML = '<div class="oppo-card-empty">准备中…</div>';
      return;
    }

    const mini = unitRefs.slice(0, 10).map(r => `
      <div class="oppo-mini-unit" style="--accent:${r.def.color};--cost-color:${COST_COLORS[r.def.cost] || '#94a3b8'}"
           data-tip="unit" data-id="${r.def.id}" data-star="${r.star}" data-items="${(r.items || []).join(',')}">
        ${r.def.glyph || r.def.name[0]}${r.star > 1 ? `<i>${'★'.repeat(r.star)}</i>` : ''}
      </div>`).join('');
    UI.els.oppoCard.innerHTML = `
      <div class="oppo-main">
        <div class="oppo-big-ava" style="background:linear-gradient(140deg, ${color}, ${color}99)">${glyph}</div>
        <div class="oppo-info">
          <div class="oppo-name">${name}</div>
          <div class="oppo-meta">${pve ? hpText : `${levelText} · ${hpText}`}</div>
        </div>
        <button class="mini-btn" id="scoutInlineBtn">侦察</button>
      </div>
      <div class="oppo-mini-units">${mini}</div>
      <div class="oppo-traits-row">${pve ? '<span class="oppo-tag2">击败野怪可获得装备与金币</span>' : traitList.filter(t => t.tier > 0).map(t => `<span class="oppo-tag2 on">${t.def.name} ${t.count}</span>`).join('')}</div>
    `;
    const sb = $('scoutInlineBtn');
    if (sb) sb.addEventListener('click', () => UI.openScout());
  };

  UI.renderLog = function () {
    if (!UI.game) return;
    const logs = UI.game.state.log.slice(0, 9);
    UI.els.logList.innerHTML = logs.map(l => `
      <div class="log-row ${l.kind || ''}">
        <span class="log-round">${l.round ? 'R' + l.round : '—'}</span>
        <span>${l.text}</span>
      </div>`).join('');
  };

  UI.renderSelected = function () {
    if (!UI.game) return;
    const u = UI.selectedUid ? UI.game.units.get(UI.selectedUid) : null;
    if (!u || UI.game.state.phase !== 'prep') {
      UI.els.selectedBar.classList.add('hidden');
      return;
    }
    UI.els.selectedBar.classList.remove('hidden');
    UI.els.selectedName.textContent = u.def.name;
    UI.els.selectedStar.textContent = '★'.repeat(u.star);
    const refund = u.def.cost * Math.pow(3, u.star - 1);
    UI.els.sellSelectedBtn.textContent = `出售 +${refund}`;
    const itemCount = u.items.length;
    UI.els.unequipBtn.classList.toggle('hidden', itemCount === 0);
    UI.els.unequipBtn.textContent = itemCount ? `卸装备 ${itemCount}` : '卸装备';
    UI.els.unitLayer.querySelectorAll('.unit').forEach(el => {
      el.classList.toggle('selected', el.dataset.uid === u.uid);
    });
    UI.els.benchSlots.querySelectorAll('.unit').forEach(el => {
      el.classList.toggle('selected', el.dataset.uid === u.uid);
    });
  };

  UI.updateTimer = function () {
    if (!UI.game) return;
    const st = UI.game.state;
    if (st.phase === 'prep') {
      const t = Math.max(0, st.prepTime);
      const sec = Math.ceil(t);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      UI.els.timerLabel.textContent = '准备阶段';
      UI.els.timerVal.textContent = `${mm}:${ss}`;
      UI.els.timerFill.style.width = Math.max(0, Math.min(100, (t / st.prepMax) * 100)) + '%';
      UI.els.timerBox.classList.toggle('urgent', t <= 10);
      UI.els.timerBox.classList.remove('combat');
    } else if (st.phase === 'combat') {
      UI.els.timerLabel.textContent = '战斗进行中';
      UI.els.timerVal.textContent = st.battle ? Math.floor(st.battle.time) + 's' : '—';
      UI.els.timerFill.style.width = '100%';
      UI.els.timerBox.classList.remove('urgent');
      UI.els.timerBox.classList.add('combat');
    } else if (st.phase === 'result') {
      UI.els.timerLabel.textContent = '回合结算';
      UI.els.timerVal.textContent = '— —';
      UI.els.timerFill.style.width = '0%';
      UI.els.timerBox.classList.remove('urgent', 'combat');
    } else {
      UI.els.timerLabel.textContent = '对局结束';
      UI.els.timerVal.textContent = '— —';
      UI.els.timerFill.style.width = '0%';
      UI.els.timerBox.classList.remove('urgent', 'combat');
    }
  };

  UI.renderPower = function () {
    if (!UI.game) return;
    const p = UI.game.boardPower();
    UI.els.powerVal.textContent = p;
    UI.els.powerFill.style.width = Math.min(100, p / 9) + '%';
    UI.els.powerHint.textContent = p < 120 ? '继续扩充阵容' : p < 300 ? '羁绊开始成型' : p < 600 ? '阵容渐入佳境' : '决战阵容';
  };

  /* ============================================================
     单位 / 物品 DOM
     ============================================================ */
  function makeUnitEl(u, mode) {
    const def = u.def;
    const star = u.star || 1;
    const cost = def.cost || 1;
    const items = u.items || [];
    const el = document.createElement('div');
    const team = u.team || (mode === 'ghost' ? 'enemy' : 'player');
    el.className = `unit cost-${cost} ${team} ${mode || ''}`;
    el.style.setProperty('--accent', def.color || '#94a3b8');
    el.style.setProperty('--cost-color', COST_COLORS[cost] || '#94a3b8');
    el.dataset.tip = 'unit';
    el.dataset.team = team;
    el.dataset.id = def.id;
    el.dataset.star = star;
    el.dataset.items = items.join(',');
    if (mode === 'ghost') el.dataset.ghost = '1';

    const itemHtml = items.map(id => {
      const it = D.ITEM_BY_ID[id];
      if (!it) return '';
      return `<span class="unit-item${it.component ? ' component' : ''}" style="--item-color:${it.color}" data-tip="item" data-id="${id}">${it.short[0]}</span>`;
    }).join('');

    el.innerHTML = `
      <span class="team-mark">${team === 'player' ? '我' : '敌'}</span>
      <div class="unit-stars ${star === 3 ? 'star3' : ''}">${'★'.repeat(star)}</div>
      <div class="unit-avatar"><span>${def.glyph || def.name[0]}</span></div>
      <div class="unit-hp"><i class="hp-fill"></i><i class="shield-fill"></i></div>
      <div class="unit-mana"><i class="mana-fill"></i></div>
      <div class="unit-name">${def.name}</div>
      <div class="unit-items">${itemHtml}</div>
    `;
    return el;
  }

  function updateUnitBars(u, el) {
    if (!el) return;
    const hpPct = clamp((u.hp / u.hpMax) * 100, 0, 100);
    const mpPct = u.manaMax ? clamp((u.mana / u.manaMax) * 100, 0, 100) : 0;
    const shPct = clamp((u.shield / u.hpMax) * 100, 0, 100);
    const hp = el.querySelector('.hp-fill');
    const mana = el.querySelector('.mana-fill');
    const shield = el.querySelector('.shield-fill');
    if (hp) hp.style.width = hpPct + '%';
    if (mana) mana.style.width = mpPct + '%';
    if (shield) shield.style.width = shPct + '%';
    el.classList.toggle('full-mana', u.manaMax > 0 && u.mana >= u.manaMax - 0.01);
    el.classList.toggle('stunned', u.stun > 0);
    el.classList.toggle('shielded', u.shield > 0);
    if (!u.alive) el.classList.add('dead');
  }

  function itemChipEl(id, index) {
    const item = D.ITEM_BY_ID[id];
    const el = document.createElement('div');
    el.className = 'item-chip' + (item.component ? ' component' : '');
    el.dataset.itemIndex = index;
    el.dataset.tip = 'item';
    el.dataset.id = id;
    el.style.setProperty('--item-color', item.color);
    el.textContent = item.short;
    return el;
  }

  /* ============================================================
     选择 / 装备
     ============================================================ */
  UI.selectUnit = function (uid) {
    UI.selectedUid = uid;
    if (uid) UI.selectedItemIndex = null;
    if (!uid) hideTooltip();
    UI.els.unitLayer.querySelectorAll('.unit').forEach(el => {
      el.classList.toggle('selected', !!uid && el.dataset.uid === uid);
    });
    UI.els.benchSlots.querySelectorAll('.unit').forEach(el => {
      el.classList.toggle('selected', !!uid && el.dataset.uid === uid);
    });
    UI.els.itemSlots.querySelectorAll('.item-chip').forEach(el => el.classList.remove('selected'));
    UI.renderSelected();
  };

  UI.selectItem = function (index) {
    UI.selectedItemIndex = index;
    if (index !== null) UI.selectedUid = null;
    UI.renderSelected();
    UI.els.unitLayer.querySelectorAll('.unit').forEach(el => el.classList.remove('selected'));
    UI.els.benchSlots.querySelectorAll('.unit').forEach(el => el.classList.remove('selected'));
    UI.els.itemSlots.querySelectorAll('.item-chip').forEach(el => {
      el.classList.toggle('selected', index !== null && +el.dataset.itemIndex === index);
    });
  };

  function equipSelectedItem(uid) {
    if (!UI.game || UI.selectedItemIndex === null) return;
    const r = UI.game.equipItem(UI.selectedItemIndex, uid);
    if (r.ok) {
      UI.selectItem(null);
    } else if (r.msg) {
      UI.toast(r.msg, 'error');
    }
  }

  /* ============================================================
     战斗渲染
     ============================================================ */
  UI.tick = function () {
    if (!UI.game) return;
    UI.updateTimer();
    const b = UI.game.battle;
    if (!b) return;
    if (UI.game.state.phase === 'combat' || UI.game.state.phase === 'result') {
      if (b.events && b.events.length) {
        const evs = b.events.splice(0, 140);
        evs.forEach(ev => processBattleEvent(ev, b));
      }
      b.units.forEach(u => {
        const el = UI.battleUnits[u.uid];
        if (el) updateUnitBars(u, el);
      });
    }
  };

  function processBattleEvent(ev, battle) {
    const board = UI.els.board;
    switch (ev.t) {
      case 'move': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          setUnitPos(el, ev.r, ev.c);
          if (ev.jump) {
            el.style.transition = 'none';
            void el.offsetWidth;
            el.style.transition = '';
          }
        }
        break;
      }
      case 'attack': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('attacking');
          setTimeout(() => el.classList.remove('attacking'), 190);
          if (ev.ranged) {
            spawnProjectile(ev.from, ev.to, el.classList.contains('enemy') ? '#ff7b88' : '#8fd3ff', 0.24, false);
          }
        }
        break;
      }
      case 'dmg': {
        const cell = ev.cell || cellOfUid(ev.uid, battle);
        if (!cell) break;
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('hit');
          setTimeout(() => el.classList.remove('hit'), 180);
        }
        if (ev.crit) {
          addDiv('fx-burst', cell, '', '#ffb35c', 320);
        }
        if (ev.value > 0) {
          spawnNumber(cell, '-' + ev.value, ev.crit ? 'crit' : (ev.kind === 'magic' ? 'magic' : ev.kind === 'true' ? 'true' : ''));
        } else if (ev.shield > 0) {
          spawnNumber(cell, '格挡 ' + ev.shield, 'shielded');
        }
        break;
      }
      case 'heal': {
        const cell = ev.cell || cellOfUid(ev.uid, battle);
        if (cell) spawnNumber(cell, '+' + ev.value, 'heal');
        break;
      }
      case 'shield': {
        const cell = ev.cell || cellOfUid(ev.uid, battle);
        if (cell) {
          spawnRing(cell, 55, ev.uid ? '#8fd3ff' : '#8fd3ff', 1);
          const el = UI.battleUnits[ev.uid];
          if (el) { el.classList.add('shielded'); }
        }
        break;
      }
      case 'shieldHit': break;
      case 'cast': {
        const cell = ev.cell;
        if (cell) {
          spawnCast(cell, ev.name, ev.color || '#f6c453');
          const el = UI.battleUnits[ev.uid];
          if (el) {
            el.classList.add('casting');
            setTimeout(() => el.classList.remove('casting'), 500);
          }
          shakeBoard();
        }
        break;
      }
      case 'death': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('dead');
          setTimeout(() => { if (el.parentNode) el.remove(); }, 650);
        }
        break;
      }
      case 'stun': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('stunned');
          const dur = Math.max(300, (ev.value || 1) * 1000);
          setTimeout(() => el.classList.remove('stunned'), dur);
        }
        break;
      }
      case 'cleanse': {
        const el = UI.battleUnits[ev.uid];
        if (el) el.classList.remove('stunned');
        break;
      }
      case 'beam':
        spawnBeam(ev.from, ev.to, ev.color || '#8fd3ff');
        break;
      case 'ricochet':
        spawnProjectile(ev.from, ev.to, '#ffe6a3', 0.18, true);
        break;
      case 'extra': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('attacking');
          setTimeout(() => el.classList.remove('attacking'), 160);
        }
        break;
      }
      case 'fx':
        processFx(ev, battle);
        break;
      case 'buff':
      case 'future': {
        const el = UI.battleUnits[ev.uid];
        if (el) {
          el.classList.add('casting');
          setTimeout(() => el.classList.remove('casting'), 220);
        }
        break;
      }
      default: break;
    }
  }

  function processFx(ev, battle) {
    const color = ev.color || '#f6c453';
    switch (ev.kind) {
      case 'spin':
        if (ev.cell) {
          addDiv('fx-spin', ev.cell, '', color, 110);
        }
        break;
      case 'shield':
        if (ev.cell) spawnRing(ev.cell, 62, '#8fd3ff', 1.2);
        break;
      case 'shieldAll':
        spawnBoardPulse('#8fd3ff');
        break;
      case 'heal':
        if (ev.cell) spawnRing(ev.cell, 54, '#7ef0b0', 1);
        break;
      case 'healAll':
        spawnBoardPulse('#7ef0b0');
        break;
      case 'fire':
        if (ev.cell) {
          spawnRing(ev.cell, 95, '#fb923c', 1);
          addDiv('fx-burst', ev.cell, '', '#fb923c', 400);
        }
        break;
      case 'burst':
        if (ev.cell) addDiv('fx-burst', ev.cell, '', color, 500);
        break;
      case 'bloom':
        if (ev.cell) spawnRing(ev.cell, 84, '#4ade80', 1.2);
        break;
      case 'slam':
        if (ev.cell) {
          addDiv('fx-burst', ev.cell, '', color, 500);
          shakeBoard();
        }
        break;
      case 'blackhole':
        if (ev.cell) {
          spawnRing(ev.cell, 150, '#818cf8', 2);
          spawnRing(ev.cell, 80, '#c084fc', 1.2);
        }
        break;
      case 'rage':
        if (ev.cell) spawnRing(ev.cell, 72, '#f59e0b', 1.4);
        break;
      case 'wave':
        if (ev.cell) spawnRing(ev.cell, 130, color, 1.4);
        break;
      case 'kick':
      case 'slash':
        if (ev.cell) addDiv('fx-slash', ev.cell, '', color, 380);
        break;
      case 'arrow':
      case 'shot':
        if (ev.from && ev.to) spawnProjectile(ev.from, ev.to, color, 0.25, true);
        break;
      case 'orb':
        if (ev.from && ev.to) spawnProjectile(ev.from, ev.to, color, 0.32, false, true);
        break;
      case 'beam':
        break;
      default:
        if (ev.cell) spawnRing(ev.cell, 60, color, 1);
        break;
    }
  }

  function cellOfUid(uid, battle) {
    if (!battle) return null;
    const u = battle.units.find(x => x.uid === uid);
    return u ? { r: u.r, c: u.c } : null;
  }

  function addDiv(cls, cell, extra, color, ttl) {
    const el = document.createElement('div');
    el.className = cls;
    const p = cellPct(cell.r, cell.c);
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.style.setProperty('--fx-color', color || '#f6c453');
    if (extra) el.innerHTML = extra;
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, ttl || 600);
    return el;
  }

  function spawnRing(cell, size, color, delay) {
    const el = document.createElement('div');
    el.className = 'fx-ring';
    const p = cellPct(cell.r, cell.c);
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.style.setProperty('--size', size + 'px');
    el.style.setProperty('--fx-color', color);
    el.style.width = '8px'; el.style.height = '8px';
    if (delay) el.style.animationDelay = delay + 's';
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
  }

  function spawnBoardPulse(color) {
    const el = document.createElement('div');
    el.className = 'fx-board-flash';
    el.style.setProperty('--fx-color', color);
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 750);
  }

  function spawnProjectile(from, to, color, dur, arrow, big) {
    if (!from || !to) return;
    const a = cellPct(from.r, from.c), b = cellPct(to.r, to.c);
    const el = document.createElement('div');
    el.className = 'fx-projectile' + (arrow ? ' arrow' : '') + (big ? ' big' : '');
    el.style.left = a.x + '%';
    el.style.top = a.y + '%';
    el.style.setProperty('--x0', a.x + '%');
    el.style.setProperty('--y0', a.y + '%');
    el.style.setProperty('--x1', b.x + '%');
    el.style.setProperty('--y1', b.y + '%');
    el.style.setProperty('--fx-color', color);
    el.style.setProperty('--dur', (dur || 0.25) + 's');
    if (arrow) {
      const rect = UI.els.board.getBoundingClientRect();
      const angle = Math.atan2((b.y - a.y) * rect.height / 100, (b.x - a.x) * rect.width / 100);
      el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    }
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, (dur || 0.25) * 1000 + 100);
  }

  function spawnBeam(from, to, color) {
    if (!from || !to) return;
    const rect = UI.els.board.getBoundingClientRect();
    const a = cellPx(UI.els.board, from.r, from.c);
    const b = cellPx(UI.els.board, to.r, to.c);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const el = document.createElement('div');
    el.className = 'fx-beam';
    el.style.left = a.x + 'px';
    el.style.top = a.y + 'px';
    el.style.width = len + 'px';
    el.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    el.style.setProperty('--fx-color', color);
    el.style.animation = 'none';
    el.style.opacity = '1';
    el.style.transition = 'opacity .22s ease .12s';
    UI.els.fxLayer.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 450);
  }

  function spawnCast(cell, name, color) {
    const p = cellPct(cell.r, cell.c);
    const el = document.createElement('div');
    el.className = 'cast-name';
    el.textContent = name;
    el.style.left = p.x + '%';
    el.style.top = (p.y - 5.2) + '%';
    el.style.marginLeft = randomBetween(-16, 16) + 'px';
    el.style.setProperty('--fx-color', color);
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1050);
  }

  function spawnNumber(cell, text, cls) {
    if (!cell) return;
    if (UI.els.fxLayer.querySelectorAll('.dmg-num, .heal-num').length > 55) return;
    const p = cellPct(cell.r, cell.c);
    const el = document.createElement('div');
    el.className = (cls === 'heal' ? 'heal-num' : 'dmg-num ' + (cls || ''));
    el.textContent = text;
    el.style.left = p.x + '%';
    el.style.top = (p.y - 3.6) + '%';
    el.style.marginLeft = randomBetween(-10, 10) + 'px';
    UI.els.fxLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 900);
  }

  function shakeBoard() {
    const b = UI.els.board;
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    setTimeout(() => b.classList.remove('shake'), 280);
  }

  UI.flashHp = function () {
    const el = UI.els.hpVal;
    el.style.color = '#ff5d73';
    el.style.transform = 'scale(1.25)';
    el.style.transition = 'none';
    setTimeout(() => {
      el.style.transition = 'transform .3s, color .3s';
      el.style.transform = 'scale(1)';
      el.style.color = '';
    }, 120);
  };

  UI.showBanner = function (text, kind) {
    const el = UI.els.battleBanner;
    clearTimeout(UI.bannerTimer);
    el.classList.remove('hidden');
    el.innerHTML = `<span>${text}</span>`;
    el.style.color = kind === 'red' ? '#ff8b96' : 'var(--gold-2)';
    el.style.textShadow = kind === 'red'
      ? '0 0 30px rgba(255,93,115,.5), 0 3px 10px rgba(0,0,0,.8)'
      : '0 0 30px rgba(246,196,83,.55), 0 3px 10px rgba(0,0,0,.8)';
    // 重启动画
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    UI.bannerTimer = setTimeout(() => el.classList.add('hidden'), 950);
  };

  /* ============================================================
     提示框
     ============================================================ */
  function pinUnitTooltip(el) {
    if (!el) return;
    UI.tooltipKey = '';
    UI.tooltipPinned = true;
    showTooltipFor(el);
    UI.els.tooltip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const h = UI.els.tooltip.offsetHeight;
    const bar = UI.els.selectedBar;
    let x = r.right + 10;
    let y;
    if (!bar.classList.contains('hidden')) {
      // 选中棋子时把弹窗抬到操作栏上方，保证“卸装备/出售”仍然可见可点
      const br = bar.getBoundingClientRect();
      y = br.top - h - 26;
    } else {
      y = r.top > window.innerHeight * 0.5 ? r.top - h - 26 : r.bottom + 8;
    }
    positionTooltip(x, y);
  }

  function hideTooltip() {
    UI.tooltipTarget = null;
    UI.tooltipKey = '';
    UI.tooltipPinned = false;
    UI.els.tooltip.classList.add('hidden');
  }
  UI.hideTooltip = hideTooltip;

  function positionTooltip(x, y) {
    const el = UI.els.tooltip;
    el.classList.remove('hidden');
    const rect = el.getBoundingClientRect();
    let left = x + 16;
    let top = y + 16;
    if (left + rect.width > window.innerWidth - 10) left = x - rect.width - 14;
    if (top + rect.height > window.innerHeight - 10) top = y - rect.height - 14;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, top) + 'px';
  }

  function showTooltipFor(target) {
    const type = target.dataset.tip;
    const html = type === 'unit' ? unitTooltip(target) : type === 'item' ? itemTooltip(target.dataset.id) : type === 'trait' ? traitTooltip(target.dataset.id, +target.dataset.count) : '';
    UI.els.tooltip.innerHTML = html;
  }

  function unitTooltip(target) {
    const def = unitDef(target.dataset.id);
    if (!def) return '';
    const star = clamp(+target.dataset.star || 1, 1, 3);
    const items = (target.dataset.items || '').split(',').filter(Boolean);
    const hp = Math.round(def.hp * STAR_HP[star - 1]);
    const ad = Math.round(def.ad * STAR_AD[star - 1]);
    const cost = def.cost || 1;
    const isMonster = !!D.MONSTER_BY_ID[def.id];
    const isEnemy = target.dataset.team === 'enemy' || target.classList.contains('enemy');
    const owner = isEnemy && !isMonster ? (target.dataset.owner || '敌方') : '';
    const role = def.role || '';
    const roleKind = def.roleKind || 'physical';
    const roleStyle = def.style || '';
    const traits = (def.traits || []).map(t => `<span class="tip-trait">${traitName(t)}</span>`).join('');
    let spellText = '';
    try { spellText = def.spell.text(def.spell.vals, star - 1); } catch (e) { spellText = ''; }
    const itemHtml = items.map(id => {
      const it = D.ITEM_BY_ID[id];
      if (!it) return '';
      return `<span class="tip-item${it.component ? ' component' : ''}">${it.name}${it.component ? ' · 材料' : ''}</span>`;
    }).join('');
    return `
      <div class="tip-head">
        <div class="tip-ava" style="--accent:${def.color};--cost-color:${COST_COLORS[cost] || '#94a3b8'}">${def.glyph || def.name[0]}</div>
        <div class="tip-head-text">
          <div class="tip-name">${def.name} <em>${'★'.repeat(star)}</em></div>
          <div class="tip-title">${def.title || (isMonster ? '野怪' : '')}${owner ? ` · <span class="tip-owner enemy">${owner}</span>` : ''}</div>
        </div>
        <div class="tip-cost">${isMonster ? '野怪' : def.cost + ' 费'}</div>
      </div>
      ${role ? `<div class="tip-role-line"><span class="tip-role ${roleKind}">${role}</span>${roleStyle ? `<span class="tip-role-style">${roleStyle}</span>` : ''}</div>` : ''}
      <div class="tip-traits">${traits}</div>
      <div class="tip-stats">
        <div class="tip-stat"><span>生命</span><b>${fmt(hp)}</b></div>
        <div class="tip-stat"><span>攻击</span><b>${ad}</b></div>
        <div class="tip-stat"><span>攻速</span><b>${def.as.toFixed(2)}</b></div>
        <div class="tip-stat"><span>护甲</span><b>${def.armor}</b></div>
        <div class="tip-stat"><span>魔抗</span><b>${def.mr}</b></div>
        <div class="tip-stat"><span>射程</span><b>${def.range}</b></div>
      </div>
      <div class="tip-spell">
        <div class="tip-spell-head">${def.spell.name}<span>${def.mana} 法力</span></div>
        <p>${spellText}</p>
      </div>
      ${items.length ? `<div class="tip-items">${itemHtml}</div>` : ''}
      <div class="tip-hint">${isMonster ? '野怪不会计入羁绊' : '3 个相同棋子可升星 · 3 个装备格'}</div>
    `;
  }

  function itemTooltip(id) {
    const item = D.ITEM_BY_ID[id];
    if (!item) return '';
    const isComp = !!item.component;
    const formula = !isComp && item.components
      ? item.components.map(cid => (D.ITEM_BY_ID[cid] || {}).name || cid).join(' + ')
      : '';
    const sell = item.sell || (isComp ? 1 : 2);
    return `
      <div class="tip-head">
        <div class="tip-ava" style="--accent:${item.color};--cost-color:${item.color};border-color:${item.color}">${item.short[0]}</div>
        <div class="tip-head-text">
          <div class="tip-name">${item.name}</div>
          <div class="tip-title">${isComp ? '基础材料' : '成品器物'}</div>
        </div>
        <div class="tip-cost">${sell} 金</div>
      </div>
      <p class="tip-desc">${item.desc}</p>
      ${formula ? `<div class="tip-formula">合成路线：${formula}</div>` : ''}
      <div class="tip-hint">${isComp ? '拖到棋子身上；若棋子已有基础材料会自动合成' : '拖到棋子身上装备'} · 拖到商店出售 +${sell} 金</div>
    `;
  }

  function traitTooltip(id, count) {
    const def = D.TRAITS[id];
    if (!def) return '';
    let tier = 0;
    def.breakpoints.forEach((bp, i) => { if (count >= bp) tier = i + 1; });
    return `
      <div class="tip-head">
        <div class="tip-ava" style="--accent:${def.color};--cost-color:${def.color};border-color:${def.color}">${def.glyph}</div>
        <div class="tip-head-text">
          <div class="tip-name">${def.name}</div>
          <div class="tip-title">羁绊 · 当前 ${count} 名</div>
        </div>
      </div>
      <p class="tip-desc">${def.desc}</p>
      <ul class="tip-tier-list">
        ${def.breakpoints.map((bp, i) => `
          <li class="${count >= bp ? 'on' : ''}"><b>${bp}</b><span>${def.tiers[i]}</span></li>
        `).join('')}
      </ul>
      <div class="tip-hint">上阵对应羁绊的棋子达到数量即可激活</div>
    `;
  }

  /* ============================================================
     拖拽
     ============================================================ */
  function bindDragEvents() {
    document.addEventListener('pointerdown', e => {
      if (!UI.game || UI.game.state.phase !== 'prep') return;
      if (e.button !== undefined && e.button !== 0) return;
      const unitEl = e.target.closest('.unit[data-uid]');
      const itemEl = e.target.closest('.item-chip[data-item-index]');
      if (!unitEl && !itemEl) return;
      UI.drag = {
        kind: unitEl ? 'unit' : 'item',
        uid: unitEl ? unitEl.dataset.uid : null,
        itemIndex: itemEl ? +itemEl.dataset.itemIndex : null,
        sourceEl: unitEl || itemEl,
        startX: e.clientX, startY: e.clientY,
        active: false, pointerId: e.pointerId
      };
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointermove', e => {
      if (!UI.drag) return;
      const d = UI.drag;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
        startDragVisual(e);
      }
      if (d.active) {
        e.preventDefault();
        moveDragGhost(e);
        updateDropHover(e);
      }
    }, { passive: false });

    window.addEventListener('blur', () => { if (UI.drag) cleanupDrag(); });

    document.addEventListener('pointerup', e => {
      if (!UI.drag) return;
      const d = UI.drag;
      if (d.active) {
        finishDrop(e);
      } else {
        handleTap(d);
      }
      cleanupDrag();
    });

    document.addEventListener('pointercancel', () => { if (UI.drag) { cleanupDrag(); } });
  }

  function startDragVisual(e) {
    const d = UI.drag;
    d.active = true;
    UI.els.board.classList.add('dragging');
    d.sourceEl.classList.add('dragging');
    const ghost = UI.els.dragGhost;
    ghost.innerHTML = '';
    if (d.kind === 'unit') {
      const u = UI.game.units.get(d.uid);
      if (!u) return;
      const el = makeUnitEl(u, 'in-bench');
      el.style.width = '58px';
      el.style.height = '58px';
      ghost.appendChild(el);
    } else {
      const chip = itemChipEl(UI.game.state.itemBench[d.itemIndex], d.itemIndex);
      ghost.appendChild(chip);
    }
    ghost.classList.remove('hidden');
    moveDragGhost(e);
    hideTooltip();
  }

  function moveDragGhost(e) {
    const ghost = UI.els.dragGhost;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
  }

  function clearDropHover() {
    UI.els.board.querySelectorAll('.hex-cell').forEach(el => el.classList.remove('drop-hover', 'drop-ok', 'invalid'));
    UI.els.benchSlots.querySelectorAll('.bench-slot').forEach(el => el.classList.remove('drop-hover'));
    UI.els.unitLayer.querySelectorAll('.unit').forEach(el => el.classList.remove('drop-target'));
    UI.els.shopPanel.classList.remove('sell-over');
  }

  function updateDropHover(e) {
    clearDropHover();
    const d = UI.drag;
    if (!d || !d.active) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under) return;
    const cell = under.closest('.hex-cell');
    const bench = under.closest('[data-bench]');
    const unit = under.closest('.unit');
    const shop = under.closest('#shopPanel');
    if (cell) {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (r < 4) {
        cell.classList.add('invalid');
      } else if (d.kind === 'unit') {
        cell.classList.add('drop-hover');
      } else {
        const u = UI.game.unitAt(r, c);
        if (u) {
          cell.classList.add('drop-hover');
          const el = UI.els.unitLayer.querySelector(`.unit[data-uid="${u.uid}"]`);
          if (el) el.classList.add('drop-target');
        }
      }
    } else if (bench && d.kind === 'unit') {
      bench.classList.add('drop-hover');
    } else if (unit && d.kind === 'item') {
      unit.classList.add('drop-target');
    } else if (shop) {
      UI.els.shopPanel.classList.add('sell-over');
    }
  }

  function finishDrop(e) {
    const d = UI.drag;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cell = under && under.closest('.hex-cell');
    const bench = under && under.closest('[data-bench]');
    const unitEl = under && under.closest('.unit[data-uid]');
    const shop = under && under.closest('#shopPanel');

    if (shop) {
      if (d.kind === 'unit') {
        const u = UI.game.units.get(d.uid);
        if (u) {
          const r = UI.game.sellUnit(d.uid);
          if (r.ok) UI.toast(`出售 ${u.def.name}，+${r.refund} 金`, 'success');
          UI.selectUnit(null);
        }
      } else {
        const r = UI.game.sellItem(d.itemIndex);
        if (r.ok) UI.toast(`出售 ${r.name}，+${r.value} 金`, 'success');
        UI.selectItem(null);
      }
      return;
    }

    if (d.kind === 'item') {
      let uid = null;
      if (unitEl) uid = unitEl.dataset.uid;
      else if (cell) {
        const u = UI.game.unitAt(+cell.dataset.r, +cell.dataset.c);
        if (u) uid = u.uid;
      }
      if (uid) {
        const r = UI.game.equipItem(d.itemIndex, uid);
        if (!r.ok && r.msg) UI.toast(r.msg, 'error');
        else { UI.selectItem(null); UI.selectUnit(uid); }
      }
      return;
    }

    if (bench) {
      const r = UI.game.moveToBench(d.uid, +bench.dataset.bench);
      if (!r.ok && r.msg) UI.toast(r.msg, 'error');
      return;
    }

    if (cell) {
      const r = UI.game.moveUnit(d.uid, +cell.dataset.r, +cell.dataset.c);
      if (!r.ok && r.msg) UI.toast(r.msg, 'error');
      return;
    }

    if (unitEl) {
      const r = +unitEl.dataset.r, c = +unitEl.dataset.c;
      if (!Number.isNaN(r) && !Number.isNaN(c)) {
        const res = UI.game.moveUnit(d.uid, r, c);
        if (!res.ok && res.msg) UI.toast(res.msg, 'error');
      }
    }
  }

  function cleanupDrag() {
    if (!UI.drag) return;
    const wasActive = UI.drag.active;
    if (UI.drag.sourceEl) UI.drag.sourceEl.classList.remove('dragging');
    UI.els.board.classList.remove('dragging');
    UI.drag = null;
    if (wasActive) {
      UI.suppressClick = true;
      setTimeout(() => { UI.suppressClick = false; }, 80);
    }
    UI.els.dragGhost.classList.add('hidden');
    UI.els.dragGhost.innerHTML = '';
    clearDropHover();
  }

  function handleTap(d) {
    if (d.kind === 'item') {
      if (UI.selectedUid) {
        const uid = UI.selectedUid;
        const r = UI.game.equipItem(d.itemIndex, uid);
        if (r.ok) { UI.selectItem(null); UI.selectUnit(uid); }
        else if (r.msg) UI.toast(r.msg, 'error');
      } else {
        UI.selectItem(UI.selectedItemIndex === d.itemIndex ? null : d.itemIndex);
      }
      return;
    }
    if (UI.selectedItemIndex !== null) {
      equipSelectedItem(d.uid);
      return;
    }
    UI.selectUnit(d.uid);
    if (d.sourceEl) pinUnitTooltip(d.sourceEl);
  }

  /* ============================================================
     弹窗 / 侦察
     ============================================================ */
  UI.openModal = function (name) {
    UI.els.helpModal.classList.toggle('hidden', name !== 'help');
    UI.els.scoutModal.classList.toggle('hidden', name !== 'scout');
    hideTooltip();
  };

  UI.closeModals = function () {
    UI.els.helpModal.classList.add('hidden');
    UI.els.scoutModal.classList.add('hidden');
  };

  UI.isPaused = function () {
    return !UI.els.helpModal.classList.contains('hidden') || !UI.els.scoutModal.classList.contains('hidden');
  };

  UI.openScout = function () {
    if (!UI.game) return;
    if (UI.game.state.phase !== 'prep') return;
    const st = UI.game.state;
    const refs = UI.game.getEnemyRefs();
    if (!refs.length) { UI.toast('暂无可侦察的对手', 'error'); return; }
    const pve = !!st.pveWave;
    const name = pve ? st.pveWave.name : (st.opponent ? st.opponent.name : '对手');
    const glyph = pve ? '兽' : (st.opponent ? st.opponent.glyph : '?');
    const color = pve ? '#ff5d73' : (st.opponent ? st.opponent.color : '#64748b');
    const hp = pve ? `${refs.length} 只野怪` : `${Math.max(0, st.opponent.hp)} 生命`;
    const lvl = pve ? '野怪回合' : `Lv.${st.opponent.level}`;
    const traits = UI.game.getTraits(refs.map(r => ({ def: r.def })));
    const power = UI.game.botPower(refs);
    UI.els.scoutHead.innerHTML = `
      <div class="scout-ava" style="--sc:${color}">${glyph}</div>
      <div class="scout-title">
        <h2>${name}</h2>
        <p>${lvl} · ${hp} · ${pve ? '击败后获得装备' : '本轮对手'}</p>
      </div>
      <div class="scout-power"><span>阵容战力</span><b>${power}</b></div>
    `;
    const traitHtml = traits.length ? traits.map(t => `
      <span class="scout-trait ${t.tier ? 'on' : ''}">${t.def.name} ${t.count}${t.tier ? ' · 激活' : ''}</span>
    `).join('') : '<span class="scout-trait">无羁绊</span>';
    const unitHtml = refs.slice().sort((a, b) => b.def.cost - a.def.cost || b.star - a.star).map(r => `
      <div class="scout-unit" style="--accent:${r.def.color};--cost-color:${COST_COLORS[r.def.cost] || '#94a3b8'}">
        <div class="scout-unit-ava">${r.def.glyph || r.def.name[0]}</div>
        <div class="scout-unit-info">
          <div class="scout-unit-name">${r.def.name} <em>${'★'.repeat(r.star)}</em></div>
          <div class="scout-unit-items">${(r.items || []).map(id => `<i>${itemName(id)}</i>`).join('') || '<i style="opacity:.4">无装备</i>'}</div>
        </div>
      </div>
    `).join('');
    UI.els.scoutBody.innerHTML = `
      <div class="scout-traits">${traitHtml}</div>
      <div class="scout-units">${unitHtml}</div>
      <div class="tip-hint" style="margin-top:14px">提示：对手阵容与站位仅在本回合有效，下一回合会重新调整。</div>
    `;
    UI.openModal('scout');
    Sound.play('click');
  };

  /* ============================================================
     杂项
     ============================================================ */
  UI.toast = function (text, kind) {
    if (!text) return;
    const box = UI.els.toasts;
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 2500);
  };

  function startLoop() {
    let last = performance.now();
    function frame(ts) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      if (UI.game && !UI.isPaused()) {
        UI.game.update(dt);
        UI.tick(dt);
      }
    }
    requestAnimationFrame(frame);
  }
})();
