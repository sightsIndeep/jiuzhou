/* 九州弈阵 · 本地 AI 教练 —— 不联网、不调用外部 API */
(function () {
  'use strict';

  const D = window.GF.DATA;
  const ECON = D.ECON;
  const COACH = {};

  function defOf(id) { return D.UNIT_BY_ID[id]; }
  function pct(n) { return Math.round(n * 100) + '%'; }

  function collect(game) {
    const board = game.getBoardUnits();
    const bench = game.bench.filter(Boolean);
    const all = board.concat(bench);
    const own = {};
    all.forEach(u => {
      const id = u.def.id;
      const o = own[id] || (own[id] = { count: 0, c1: 0, c2: 0, c3: 0, units: [] });
      o.count++;
      if (u.star === 3) o.c3++;
      else if (u.star === 2) o.c2++;
      else o.c1++;
      o.units.push(u);
    });
    const traits = {};
    game.getTraits(board).forEach(t => { traits[t.id] = t; });
    const frontline = board.filter(u => u.def.range <= 1).length;
    const backline = board.filter(u => u.def.range >= 2).length;
    const tanks = board.filter(u => u.def.roleKind === 'guardian' || u.def.traits.includes('guardian') || u.def.traits.includes('brawler')).length;
    const supports = board.filter(u => u.def.roleKind === 'support').length;
    return {
      board, bench, all, own, traits, frontline, backline, tanks, supports,
      benchFree: ECON.benchSize - bench.length,
      boardFull: board.length >= game.state.level
    };
  }

  function upgradeInfo(own) {
    if (!own || !own.count) return { text: '', to: 0, copies: 0 };
    if (own.c3 > 0) return { text: '已是 3 星', to: 0, copies: own.count };
    if (own.c2 >= 2 && own.c1 >= 2) return { text: '再买 1 张可冲 3 星', to: 3, copies: own.count };
    if (own.c1 >= 2) return { text: '再买 1 张可升 2 星', to: 2, copies: own.count };
    if (own.c2 >= 2) return { text: '已有两张 2 星，再凑一张可冲 3 星', to: 0, copies: own.count };
    return { text: '', to: 0, copies: own.count };
  }

  function traitHit(def, ctx) {
    let best = null;
    def.traits.forEach(id => {
      const t = D.TRAITS[id];
      if (!t) return;
      const cur = ctx.traits[id] ? ctx.traits[id].count : 0;
      const next = t.breakpoints.find(bp => cur < bp);
      if (next == null) return;
      const gap = next - cur;
      let score = 0;
      if (gap === 1) score = 32;
      else if (gap === 2) score = 13;
      else score = 5;
      if (!best || score > best.score) best = { id, name: t.name, cur, next, gap, score };
    });
    return best;
  }

  function scoreCandidate(game, def, index, ctx) {
    const st = game.state;
    const own = ctx.own[def.id];
    const up = upgradeInfo(own);
    const trait = traitHit(def, ctx);
    const reasons = [];
    let score = def.cost * 6;
    const shopCount = st.shop.filter(x => x && !x.sold && x.id === def.id).length;
    if (shopCount >= 2) {
      score += shopCount * 9;
      reasons.push(`商店里共有 ${shopCount} 张，连着拿更容易成对`);
    }
    if (shopCount >= 3 && !own) {
      score += 22;
      reasons.push('一次刷出 3 张，连拿 3 张直接合 2 星');
    }
    if (own && up.to === 0 && shopCount >= 2 && own.c1 > 0 && own.c1 + shopCount >= 3) {
      score += 42;
      reasons.push(`买下后商店还剩 ${shopCount - 1} 张，连续拿可合 2 星`);
    }

    if (own) {
      score += Math.min(24, own.count * 7);
      if (own.count === 1) reasons.push(`已有 1 张，补成对子`);
      else reasons.push(`已有 ${own.count} 张`);
    }
    if (up.to === 2) { score += 68; reasons.push('再买 1 张马上合 2 星'); }
    if (up.to === 3) { score += 95; reasons.push('再买 1 张就能冲 3 星'); }
    if (own && own.c2 >= 2 && up.to !== 3) { score += 16; reasons.push('已有两张 2 星'); }

    if (trait) {
      score += trait.score;
      if (trait.gap === 1) reasons.push(`补 1 张${trait.name}，凑到 ${trait.next} 人羁绊`);
      else if (trait.gap === 2) reasons.push(`补${trait.name}，向 ${trait.next} 人羁绊走`);
      else reasons.push(`${trait.name}可继续补强`);
    }

    if (ctx.tanks === 0 && (def.roleKind === 'guardian' || def.traits.includes('guardian') || def.traits.includes('brawler'))) {
      score += 20; reasons.push('当前阵容缺前排，这张能顶住');
    }
    if (ctx.supports === 0 && def.roleKind === 'support') {
      score += 14; reasons.push('当前没有治疗，这张能补续航');
    }
    if (ctx.backline < 2 && def.range >= 2) {
      score += 10; reasons.push('后排输出不足，这张能补伤害');
    }
    if (ctx.frontline > 5 && def.range >= 2) {
      score += 6; reasons.push('前排已经偏多，补一张后排');
    }

    const canCombine = up.to > 0;
    if (ctx.benchFree <= 0 && !canCombine) {
      score -= 45;
      reasons.push('备战席已满，先腾位置');
    }
    if (st.gold < def.cost) score -= 12;

    return {
      index, def, score, reasons, upgrade: up, trait,
      affordable: st.gold >= def.cost,
      canBuy: ctx.benchFree > 0 || canCombine
    };
  }

  function action(label, type, data) {
    return Object.assign({ type, label }, data || {});
  }

  function step(title, reason, opts) {
    return Object.assign({ title, reason }, opts || {});
  }

  function buildDirection(game, ctx) {
    if (!ctx.board.length) {
      return {
        text: '开局先凑 2 人羁绊，优先买能成对的低费棋子；不要急着刷新。',
        chips: ['先成对', '凑 2 人羁绊']
      };
    }
    const traits = game.getTraits(ctx.board).filter(t => t.count > 0)
      .sort((a, b) => (b.tier - a.tier) || (b.count - a.count));
    const top = traits.slice(0, 2).map(t => `${t.def.name} ${t.count}`);
    const carry = ctx.board.slice().sort((a, b) =>
      (b.star - a.star) || (b.def.cost - a.def.cost) || (b.items.length - a.items.length)
    )[0];
    const bits = [];
    bits.push(`阵容方向：${top.join(' / ') || '先凑羁绊'}`);
    if (carry) bits.push(`主养 ${carry.def.name}（${carry.def.role}）`);
    if (ctx.tanks === 0) bits.push('前排缺护卫/力士');
    const chips = traits.slice(0, 3).map(t => `${t.def.name} ${t.count}`);
    if (!chips.length) chips.push('先凑 2 人羁绊');
    return { text: bits.join('；') + '。', chips };
  }

  function pickCarry(ctx) {
    return ctx.board.slice().sort((a, b) =>
      (b.star - a.star) || (b.def.cost - a.def.cost) || (b.items.length - a.items.length)
    )[0];
  }

  function equipStep(game, ctx) {
    if (game.state.phase !== 'prep') return null;
    const st = game.state;
    const itemIndex = st.itemBench.findIndex(Boolean);
    if (itemIndex < 0) return null;
    const targets = ctx.board.filter(u => u.items.length < 3);
    if (!targets.length) return null;
    const target = targets.slice().sort((a, b) =>
      (b.star - a.star) || (b.def.cost - a.def.cost) || (a.items.length - b.items.length)
    )[0];
    const item = D.ITEM_BY_ID[st.itemBench[itemIndex]];
    if (!item) return null;
    return step(
      `给「${target.def.name}」装上「${item.name}」`,
      `${target.def.name} 是当前阵容里最值得养的单位；这件${item.component ? '基础材料' : '器物'}能立刻提升战力（装备格 ${target.items.length + 1}/3）。`,
      { priority: 4, action: action('装上', 'equip', { itemIndex, uid: target.uid }), kind: 'equip' }
    );
  }

  function positionStep(game, ctx) {
    if (game.state.phase !== 'prep') return null;
    const rangedFront = ctx.board.find(u => u.def.range >= 2 && u.r <= 5);
    if (rangedFront) {
      return step(
        `把「${rangedFront.def.name}」往后排挪`,
        `${rangedFront.def.name} 是远程单位，站在前排容易先被集火；拖到第 7 排左右，输出更安全。`,
        { priority: 5, action: action('选中', 'focus', { uid: rangedFront.uid }), kind: 'position' }
      );
    }
    const tankBack = ctx.board.find(u => u.def.range <= 1 && u.r >= 6);
    if (tankBack) {
      return step(
        `把「${tankBack.def.name}」往前排顶`,
        `${tankBack.def.name} 是近战前排，站太后排会让后排直接吃伤害；拖到第 4-5 排更合理。`,
        { priority: 5, action: action('选中', 'focus', { uid: tankBack.uid }), kind: 'position' }
      );
    }
    return null;
  }

  COACH.analyze = function (game) {
    if (!game || !game.state) return null;
    const st = game.state;
    const ctx = collect(game);
    const direction = buildDirection(game, ctx);
    const carry = pickCarry(ctx);
    const interest = Math.min(5, Math.floor(st.gold / 10));
    const need = game.xpNeed();
    const xpGap = Math.max(0, need - st.xp);
    const levelNow = st.level < ECON.maxLevel && st.gold >= ECON.xpBuyCost && xpGap <= ECON.xpBuyAmount;
    const boardPower = (() => { try { return game.boardPower(); } catch (e) { return 0; } })();
    const economy = `血量 ${Math.max(0, st.hp)} · 等级 ${st.level}${st.level >= ECON.maxLevel ? '（满级）' : `（${st.xp}/${need} 经验）`} · ${st.gold} 金（利息 +${interest}）· 战力 ${boardPower}`;

    if (st.gameOver || st.phase === 'over') {
      return {
        direction, economy, steps: [step('本局结束', '看看最终阵容和排名，下一局可以继续用教练。', { priority: 1, kind: 'over' })],
        summary: '本局已结束。'
      };
    }
    if (st.phase === 'result') {
      return {
        direction, economy, steps: [step('先继续结算', '战斗已经结束，点结果面板的“继续”进入下一回合；下回合教练会根据新商店重新算。', { priority: 1, kind: 'result' })],
        summary: '回合结算中。'
      };
    }

    const steps = [];
    const candidates = st.shop.map((slot, i) => slot && !slot.sold ? scoreCandidate(game, defOf(slot.id), i, ctx) : null)
      .filter(Boolean)
      .filter(c => c.def)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;

    // 买棋子
    if (best && best.score >= 26 && best.affordable && best.canBuy) {
      const up = best.upgrade;
      const reasonBits = best.reasons.slice(0, 3);
      const title = up.to
        ? `买下「${best.def.name}」冲 ${up.to} 星`
        : `买下「${best.def.name}」`;
      steps.push(step(title, reasonBits.join('；') + '。', {
        priority: up.to ? 1 : (ctx.boardFull ? 4 : 3),
        kind: 'buy',
        action: action(`买下 · ${best.def.cost} 金`, 'buy', { index: best.index }),
        meta: `第 ${best.index + 1} 张商店牌`
      }));
    }

    // 升级
    if (st.level < ECON.maxLevel && st.gold >= ECON.xpBuyCost) {
      const shouldLevel = levelNow && (ctx.boardFull || !best || best.score < 48 || st.gold >= 20);
      const fullAndCan = ctx.boardFull && st.gold >= ECON.xpBuyCost;
      if (shouldLevel || fullAndCan) {
        const reason = levelNow
          ? `再买 1 次经验就升 ${st.level + 1} 级${ctx.boardFull ? '，现在上阵位已满，正好多上 1 人' : '，高费卡概率也会提高'}。`
          : `当前已上 ${ctx.board.length}/${st.level}，先买 4 经验到 ${Math.min(need, st.xp + 4)}/${need}；升到 ${st.level + 1} 级后能多上 1 人。`;
        steps.push(step(levelNow ? `买经验，升 ${st.level + 1} 级` : `买经验，冲 ${st.level + 1} 级`, reason, {
          priority: levelNow ? 2 : (ctx.boardFull ? 2 : 4),
          kind: 'level',
          action: action('买经验 · 4 金', 'xp')
        }));
      }
    }

    // 有位置就先上阵
    if (st.phase === 'prep' && ctx.board.length < st.level && ctx.bench.length) {
      const candidate = ctx.bench.slice().sort((a, b) =>
        (b.star - a.star) || (b.def.cost - a.def.cost) || (b.items.length - a.items.length)
      )[0];
      steps.push(step(`把「${candidate.def.name}」上阵`, `现在只上了 ${ctx.board.length}/${st.level} 人，备战席的 ${candidate.def.name} 可以立刻增加战力；上阵后再根据羁绊调位置。`, {
        priority: 3,
        kind: 'place',
        action: action('上阵', 'auto', { uid: candidate.uid })
      }));
    }

    // 装备
    const eq = equipStep(game, ctx);
    if (eq) steps.push(eq);

    // 站位
    const pos = positionStep(game, ctx);
    if (pos) steps.push(pos);

    // 刷新
    let refresh = null;
    if (!steps.some(s => s.kind === 'buy') && st.gold >= ECON.refreshCost) {
      const canSpend = st.gold >= 10 || st.hp <= 35;
      if (canSpend && !levelNow) {
        refresh = step(
          '刷新商店找提升',
          st.hp <= 35
            ? '血量偏低，当前商店没有能马上补强阵容的牌；花 2 金找对子或核心，先把战力拉起来。'
            : '当前 5 张没有值得买的对子/羁绊牌；花 2 金找能升星或补羁绊的棋子，但别把经济刷空。',
          { priority: 6, kind: 'refresh', action: action('刷新 · 2 金', 'refresh') }
        );
        steps.push(refresh);
      }
    }

    // 存钱
    if (!steps.some(s => ['buy', 'level', 'refresh'].includes(s.kind)) || (steps.length === 1 && steps[0].kind === 'position')) {
      const saveReason = best && !best.affordable
        ? `差 ${best.def.cost - st.gold} 金就能买「${best.def.name}」；先存钱，不要刷新。`
        : st.gold < 50
          ? `现在 ${st.gold} 金，利息 +${interest}；先存到 50 金吃满利息，别为了小提升把经济刷空。`
          : '已经吃满 50 金利息；除非掉血或出现关键对子，否则先不刷新，把金币留给升级和核心牌。';
      steps.push(step(st.gold < 50 ? '先存钱吃利息' : '保持经济，别乱刷', saveReason, {
        priority: 7, kind: 'save'
      }));
    }

    // 战斗中提示
    if (st.phase === 'combat' && !steps.length) {
      steps.push(step('战斗中先看结果', '战斗进行中，站位已锁定；下回合准备阶段再按教练建议调阵容。', { priority: 8, kind: 'combat' }));
    }

    steps.sort((a, b) => a.priority - b.priority);
    const primary = steps[0];
    let summary;
    if (primary && primary.kind === 'buy') summary = `下一步：${primary.title}。`;
    else if (primary && primary.kind === 'level') summary = `下一步：${primary.title}。`;
    else if (primary && primary.kind === 'refresh') summary = `下一步：小刷一下，找能立刻提升的牌。`;
    else if (primary && primary.kind === 'equip') summary = `下一步：先把装备用掉。`;
    else if (primary && primary.kind === 'position') summary = `下一步：先调站位，别让后排站前排。`;
    else summary = '下一步：稳住经济，先不花冤枉钱。';

    const buyStep = steps.find(s => s.action && s.action.type === 'buy');
    const pickIndex = buyStep ? buyStep.action.index : -1;
    return {
      direction, economy, steps, primary, summary, pickIndex,
      carry: carry ? {
        name: carry.def.name, role: carry.def.role, style: carry.def.style,
        items: carry.items.map(id => (D.ITEM_BY_ID[id] || {}).name || id)
      } : null
    };
  };

  window.GF.COACH = COACH;
})();
