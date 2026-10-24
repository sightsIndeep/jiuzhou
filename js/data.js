/* 九州弈阵 · 单机版 —— 棋子 / 羁绊 / 装备 / 怪物 数据 */
(function () {
  'use strict';

  const TRAITS = {
    blademaster: {
      name: '剑客', glyph: '剑', color: '#f6a94a',
      breakpoints: [2, 4, 6],
      desc: '剑客的攻击有几率追加一次攻击。',
      tiers: [
        '25% 几率追加一次攻击',
        '40% 几率追加一次攻击',
        '60% 几率追加一次攻击'
      ],
      apply(team, tier) {
        if (!tier) return;
        const v = [0, 0.25, 0.4, 0.6][tier];
        team.filter(u => u.traits.includes('blademaster')).forEach(u => {
          u.extraAttackChance = (u.extraAttackChance || 0) + v;
        });
      }
    },
    mage: {
      name: '方士', glyph: '方', color: '#a78bfa',
      breakpoints: [2, 4],
      desc: '方士获得法术强度，技能伤害更高。',
      tiers: ['方士获得 +30 法术强度', '方士获得 +70 法术强度'],
      apply(team, tier) {
        if (!tier) return;
        const v = [0, 30, 70][tier];
        team.filter(u => u.traits.includes('mage')).forEach(u => { u.ap += v; });
      }
    },
    assassin: {
      name: '刺客', glyph: '刺', color: '#fb7185',
      breakpoints: [2, 4],
      desc: '刺客开场跃至敌方后排，并获得暴击加成。',
      tiers: ['+25% 暴击率，+20% 暴击伤害', '+50% 暴击率，+40% 暴击伤害'],
      apply(team, tier) {
        if (!tier) return;
        const c = [0, 0.25, 0.5][tier], d = [0, 0.2, 0.4][tier];
        team.filter(u => u.traits.includes('assassin')).forEach(u => {
          u.critChance += c; u.critDmg += d; u.assassinJump = true;
        });
      }
    },
    brawler: {
      name: '力士', glyph: '力', color: '#f97316',
      breakpoints: [2, 4, 6],
      desc: '力士获得额外最大生命值。',
      tiers: ['+250 最大生命', '+500 最大生命', '+900 最大生命'],
      apply(team, tier) {
        if (!tier) return;
        const v = [0, 250, 500, 900][tier];
        team.filter(u => u.traits.includes('brawler')).forEach(u => {
          u.hpMax += v; u.hp += v;
        });
      }
    },
    guardian: {
      name: '护卫', glyph: '护', color: '#38bdf8',
      breakpoints: [2, 4, 6],
      desc: '护卫获得护甲，并为全队提供护甲。',
      tiers: ['护卫 +35 护甲，全队 +10 护甲', '护卫 +70 护甲，全队 +20 护甲', '护卫 +120 护甲，全队 +35 护甲'],
      apply(team, tier) {
        if (!tier) return;
        const self = [0, 35, 70, 120][tier], all = [0, 10, 20, 35][tier];
        team.forEach(u => { u.armor += all; });
        team.filter(u => u.traits.includes('guardian')).forEach(u => { u.armor += self; });
      }
    },
    marksman: {
      name: '弓手', glyph: '弓', color: '#34d399',
      breakpoints: [2, 4],
      desc: '弓手的攻击会弹射到周围额外敌人。',
      tiers: ['攻击弹射 1 名敌人，造成 50% 伤害', '攻击弹射 2 名敌人，造成 70% 伤害'],
      apply(team, tier) {
        if (!tier) return;
        team.filter(u => u.traits.includes('marksman')).forEach(u => {
          u.ricochet = [0, 1, 2][tier];
          u.ricochetPct = [0, 0.5, 0.7][tier];
        });
      }
    },
    mystic: {
      name: '玄术', glyph: '玄', color: '#22d3ee',
      breakpoints: [2, 4],
      desc: '为全队提供魔法抗性。',
      tiers: ['全队 +30 魔抗', '全队 +70 魔抗'],
      apply(team, tier) {
        if (!tier) return;
        const v = [0, 30, 70][tier];
        team.forEach(u => { u.mr += v; });
      }
    },
    starguardian: {
      name: '星象', glyph: '象', color: '#f0abfc',
      breakpoints: [3, 6],
      desc: '星象施放技能后，为其他星象回复法力。',
      tiers: ['施法后，所有星象回复 15 法力', '施法后，所有星象回复 30 法力'],
      apply(team, tier) {
        if (!tier) return;
        const v = [0, 15, 30][tier];
        team.filter(u => u.traits.includes('starguardian')).forEach(u => { u.sgMana = v; });
      }
    },
    dragon: {
      name: '龙脉', glyph: '龙', color: '#fbbf24',
      breakpoints: [2],
      desc: '龙脉获得攻击力与法术强度。',
      tiers: ['龙脉 +35% 攻击力，+35 法术强度'],
      apply(team, tier) {
        if (!tier) return;
        team.filter(u => u.traits.includes('dragon')).forEach(u => {
          u.ad = Math.round(u.ad * 1.35); u.ap += 35;
        });
      }
    },
    future: {
      name: '机关', glyph: '机', color: '#818cf8',
      breakpoints: [2, 4],
      desc: '每 5 秒为全队叠加攻击速度。',
      tiers: ['每 5 秒全队 +12% 攻速，最多 5 层', '每 5 秒全队 +25% 攻速，最多 5 层'],
      apply(team, tier) {
        if (!tier) return;
        team.forEach(u => { u.futureTier = tier; });
      }
    }
  };

  const UNITS = [
    /* ---------------- 1 费 ---------------- */
    {
      id: 'fan_kuai', name: '樊哙', title: '舞阳侯', glyph: '樊', cost: 1,
      traits: ['brawler', 'guardian'], range: 1, hp: 700, ad: 55, as: 0.6,
      armor: 45, mr: 30, mana: 80, startMana: 0, color: '#5b8def',
      spell: {
        name: '横盾扫阵', icon: '盾',
        text: (v, s) => `横盾扫阵，对周围敌人造成 ${v.dmg[s]} 物理伤害，并获得 ${v.shield[s]} 护盾，持续 4 秒。`,
        vals: { dmg: [150, 225, 360], shield: [200, 300, 450] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.aoe(u, b.cellOf(u), 1, u.ad * 0.8 + v.dmg[s], 'physical');
          b.shield(u, v.shield[s], 4);
          b.fx('spin', { cell: b.cellOf(u), color: u.color });
        }
      }
    },
    {
      id: 'yang_youji', name: '养由基', title: '百步穿杨', glyph: '养', cost: 1,
      traits: ['marksman', 'starguardian'], range: 3, hp: 550, ad: 55, as: 0.7,
      armor: 20, mr: 20, mana: 70, startMana: 0, color: '#7dd3fc',
      spell: {
        name: '百步穿杨', icon: '箭',
        text: (v, s) => `向最多 3 名敌人射出箭矢，每支造成 ${v.dmg[s]} + 110% 攻击力物理伤害。`,
        vals: { dmg: [60, 90, 145] },
        cast(b, u, v) {
          const s = u.star - 1;
          for (let i = 0; i < 3; i++) {
            const list = b.enemies(u);
            if (!list.length) break;
            const t = b.random(list);
            b.physical(u, t, u.ad * 1.1 + v.dmg[s]);
            b.fx('arrow', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
          }
        }
      }
    },
    {
      id: 'mozi', name: '墨子', title: '墨家巨子', glyph: '墨', cost: 1,
      traits: ['mage', 'starguardian'], range: 3, hp: 550, ad: 45, as: 0.6,
      armor: 20, mr: 20, mana: 70, startMana: 0, color: '#facc15',
      spell: {
        name: '兼爱非攻', icon: '光',
        text: (v, s) => `释放一道机关光束，对路径上所有敌人造成 ${v.dmg[s]} 魔法伤害。`,
        vals: { dmg: [230, 345, 560] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.beam(u, t, v.dmg[s] * b.ap(u), 'magic');
          b.fx('beam', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
        }
      }
    },
    {
      id: 'zhuan_zhu', name: '专诸', title: '鱼肠刺客', glyph: '专', cost: 1,
      traits: ['assassin', 'blademaster'], range: 1, hp: 600, ad: 60, as: 0.75,
      armor: 30, mr: 30, mana: 60, startMana: 0, color: '#f43f5e',
      spell: {
        name: '鱼肠刺', icon: '匕',
        text: (v, s) => `突进至生命最低的敌人身旁，造成 180% 攻击力 + ${v.dmg[s]} 魔法伤害，并获得 30% 攻速，持续 5 秒。`,
        vals: { dmg: [70, 105, 170] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.lowestHp(b.enemies(u));
          if (!t) return;
          b.blinkNear(u, t);
          b.physical(u, t, u.ad * 1.8);
          b.magic(u, t, v.dmg[s] * b.ap(u));
          b.fx('slash', { cell: b.cellOf(t), color: u.color });
          b.buff(u, { asPct: 0.3 }, 5);
        }
      }
    },
    {
      id: 'meng_ben', name: '孟贲', title: '虎贲之士', glyph: '孟', cost: 1,
      traits: ['guardian', 'brawler'], range: 1, hp: 750, ad: 45, as: 0.55,
      armor: 55, mr: 40, mana: 80, startMana: 0, color: '#60a5fa',
      spell: {
        name: '虎贲之盾', icon: '盾',
        text: (v, s) => `获得 ${v.shield[s]} 护盾，持续 5 秒，并眩晕相邻敌人 1 秒。`,
        vals: { shield: [320, 480, 720] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.shield(u, v.shield[s], 5);
          b.fx('shield', { cell: b.cellOf(u), color: u.color });
          b.enemies(u).forEach(t => {
            if (b.dist(u, t) <= 1) b.stun(t, 1);
          });
        }
      }
    },
    {
      id: 'bian_que', name: '扁鹊', title: '神医', glyph: '扁', cost: 1,
      traits: ['mystic', 'starguardian'], range: 3, hp: 500, ad: 40, as: 0.6,
      armor: 20, mr: 35, mana: 60, startMana: 0, color: '#c084fc',
      spell: {
        name: '回春术', icon: '愈',
        text: (v, s) => `治疗生命最低的友军 ${v.heal[s]} 生命，并为其周围友军恢复 50% 该数值。`,
        vals: { heal: [230, 345, 540] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.lowestHp(b.allies(u));
          if (!t) return;
          b.heal(u, t, v.heal[s] * b.healAmp(u));
          b.fx('heal', { cell: b.cellOf(t) });
          b.allies(u).forEach(a => {
            if (a !== t && b.dist(t, a) <= 1) b.heal(u, a, v.heal[s] * 0.5 * b.healAmp(u));
          });
        }
      }
    },
    {
      id: 'zhang_heng', name: '张衡', title: '木圣', glyph: '张', cost: 1,
      traits: ['marksman', 'future'], range: 3, hp: 550, ad: 55, as: 0.75,
      armor: 20, mr: 20, mana: 60, startMana: 0, color: '#fbbf24',
      spell: {
        name: '地动仪', icon: '仪',
        text: (v, s) => `发射一道地动波，对路径上的敌人造成 120% 攻击力 + ${v.dmg[s]} 魔法伤害。`,
        vals: { dmg: [170, 255, 410] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.beam(u, t, u.ad * 1.2 + v.dmg[s] * b.ap(u), 'magic');
          b.fx('beam', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
        }
      }
    },

    /* ---------------- 2 费 ---------------- */
    {
      id: 'li_bai', name: '李白', title: '青莲剑仙', glyph: '关', cost: 2,
      traits: ['blademaster', 'brawler'], range: 1, hp: 800, ad: 65, as: 0.8,
      armor: 35, mr: 30, mana: 60, startMana: 0, color: '#38bdf8',
      spell: {
        name: '青莲剑歌', icon: '风',
        text: (v, s) => `突进至目标身旁，造成 190% 攻击力 + ${v.dmg[s]} 物理伤害，并溅射周围敌人，获得 ${v.shield[s]} 护盾。`,
        vals: { dmg: [60, 90, 145], shield: [130, 195, 310] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.blinkNear(u, t);
          b.physical(u, t, u.ad * 1.9 + v.dmg[s]);
          b.aoe(u, b.cellOf(t), 1, u.ad * 0.6, 'physical', t);
          b.shield(u, v.shield[s], 3);
          b.fx('slash', { cell: b.cellOf(t), color: u.color });
        }
      }
    },
    {
      id: 'fu_hao', name: '妇好', title: '商朝女将', glyph: '妇', cost: 2,
      traits: ['mage', 'guardian'], range: 2, hp: 700, ad: 45, as: 0.6,
      armor: 30, mr: 30, mana: 80, startMana: 0, color: '#fb923c',
      spell: {
        name: '玄鸟之火', icon: '玄',
        text: (v, s) => `在目标处召来玄鸟之火，对周围敌人造成 ${v.dmg[s]} 魔法伤害并灼烧 3 秒，自身获得 ${v.shield[s]} 护盾。`,
        vals: { dmg: [220, 330, 530], shield: [160, 240, 380], burn: [90, 135, 220] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          const c = b.cellOf(t);
          b.aoe(u, c, 1, v.dmg[s] * b.ap(u), 'magic');
          b.burnArea(u, c, 1, v.burn[s] * b.ap(u), 3);
          b.shield(u, v.shield[s], 4);
          b.fx('fire', { cell: c, color: '#fb923c' });
        }
      }
    },
    {
      id: 'huang_yueying', name: '黄月英', title: '巧思夫人', glyph: '黄', cost: 2,
      traits: ['marksman', 'future'], range: 3, hp: 600, ad: 62, as: 0.75,
      armor: 20, mr: 20, mana: 70, startMana: 0, color: '#f472b6',
      spell: {
        name: '连弩齐发', icon: '弩',
        text: (v, s) => `发射连弩火箭，对目标周围敌人造成 160% 攻击力 + ${v.dmg[s]} 物理伤害，并获得 45% 攻速，持续 5 秒。`,
        vals: { dmg: [70, 105, 165] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.aoe(u, b.cellOf(t), 1, u.ad * 1.6 + v.dmg[s], 'physical');
          b.buff(u, { asPct: 0.45 }, 5);
          b.fx('fire', { cell: b.cellOf(t), color: u.color });
        }
      }
    },
    {
      id: 'yue_yun', name: '岳云', title: '铁椎少将', glyph: '岳', cost: 2,
      traits: ['brawler', 'future'], range: 1, hp: 850, ad: 60, as: 0.65,
      armor: 40, mr: 30, mana: 70, startMana: 0, color: '#f87171',
      spell: {
        name: '双椎破阵', icon: '椎',
        text: (v, s) => `冲撞最远的敌人，造成 220% 攻击力 + ${v.dmg[s]} 物理伤害并击飞 1.5 秒。`,
        vals: { dmg: [80, 120, 195] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.farthest(b.enemies(u), u);
          if (!t) return;
          b.blinkNear(u, t);
          b.stun(t, 1.5);
          b.physical(u, t, u.ad * 2.2 + v.dmg[s]);
          b.fx('burst', { cell: b.cellOf(t), color: u.color });
        }
      }
    },
    {
      id: 'mu_guaying', name: '穆桂英', title: '天门元帅', glyph: '穆', cost: 2,
      traits: ['guardian', 'mystic'], range: 1, hp: 850, ad: 50, as: 0.55,
      armor: 55, mr: 45, mana: 80, startMana: 0, color: '#fcd34d',
      spell: {
        name: '天门阵', icon: '阳',
        text: (v, s) => `展开天门阵，获得 ${v.shield[s]} 护盾与 30 双抗，持续 5 秒，并眩晕相邻敌人 1.5 秒。`,
        vals: { shield: [330, 495, 780] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.shield(u, v.shield[s], 5);
          b.buff(u, { armor: 30, mr: 30 }, 5);
          b.fx('shield', { cell: b.cellOf(u), color: u.color });
          b.enemies(u).forEach(t => { if (b.dist(u, t) <= 1) b.stun(t, 1.5); });
        }
      }
    },
    {
      id: 'yao_li', name: '要离', title: '断臂刺客', glyph: '要', cost: 2,
      traits: ['assassin', 'mystic'], range: 1, hp: 650, ad: 60, as: 0.7,
      armor: 25, mr: 35, mana: 70, startMana: 0, color: '#2dd4bf',
      spell: {
        name: '断臂刺', icon: '刺',
        text: (v, s) => `突进至生命最低的敌人，造成 250% 攻击力物理伤害；若目标生命低于 30%，改为造成其 30% 最大生命的真实伤害。`,
        vals: {},
        cast(b, u) {
          const t = b.lowestHp(b.enemies(u));
          if (!t) return;
          b.blinkNear(u, t);
          b.fx('slash', { cell: b.cellOf(t), color: u.color });
          if (t.hp / t.hpMax < 0.3) {
            b.trueDamage(u, t, t.hpMax * 0.3);
          } else {
            b.physical(u, t, u.ad * 2.5);
          }
        }
      }
    },

    /* ---------------- 3 费 ---------------- */
    {
      id: 'chang_e', name: '嫦娥', title: '月宫仙子', glyph: '狸', cost: 3,
      traits: ['mage', 'starguardian'], range: 3, hp: 750, ad: 50, as: 0.65,
      armor: 25, mr: 30, mana: 70, startMana: 0, color: '#e879f9',
      spell: {
        name: '月华流照', icon: '月',
        text: (v, s) => `掷出月华宝珠，对路径上的敌人造成 ${v.dmg[s]} 魔法伤害。`,
        vals: { dmg: [280, 420, 680] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.beam(u, t, v.dmg[s] * b.ap(u), 'magic');
          b.fx('orb', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
        }
      }
    },
    {
      id: 'diao_chan', name: '貂蝉', title: '闭月', glyph: '貂', cost: 3,
      traits: ['assassin', 'blademaster'], range: 1, hp: 800, ad: 65, as: 0.7,
      armor: 30, mr: 30, mana: 80, startMana: 0, color: '#ef4444',
      spell: {
        name: '连环舞', icon: '莲',
        text: (v, s) => `旋舞连环，对周围敌人造成 ${v.dmg[s]} 魔法伤害，并施加 50% 重伤，持续 5 秒。`,
        vals: { dmg: [240, 360, 580] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.aoe(u, b.cellOf(u), 2, v.dmg[s] * b.ap(u), 'magic');
          b.enemies(u).forEach(t => { if (b.dist(u, t) <= 2) b.grievous(t, 5); });
          b.fx('spin', { cell: b.cellOf(u), color: u.color });
        }
      }
    },
    {
      id: 'hua_mulan', name: '花木兰', title: '巾帼将军', glyph: '花', cost: 3,
      traits: ['guardian', 'mystic'], range: 2, hp: 900, ad: 55, as: 0.6,
      armor: 45, mr: 40, mana: 80, startMana: 0, color: '#4ade80',
      spell: {
        name: '巾帼战阵', icon: '阵',
        text: (v, s) => `展开巾帼战阵，对周围敌人造成 ${v.dmg[s]} 魔法伤害并禁锢 1.5 秒。`,
        vals: { dmg: [210, 315, 510] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.aoe(u, b.cellOf(u), 1, v.dmg[s] * b.ap(u), 'magic');
          b.enemies(u).forEach(t => { if (b.dist(u, t) <= 1) b.stun(t, 1.5); });
          b.fx('bloom', { cell: b.cellOf(u), color: u.color });
        }
      }
    },
    {
      id: 'li_guang', name: '李广', title: '飞将军', glyph: '李', cost: 3,
      traits: ['marksman', 'future'], range: 4, hp: 700, ad: 85, as: 0.55,
      armor: 20, mr: 20, mana: 80, startMana: 0, color: '#e2e8f0',
      spell: {
        name: '射石没羽', icon: '幕',
        text: (v, s) => `张弓连射 4 箭，每箭造成 140% 攻击力 + ${v.dmg[s]} 物理伤害，第 4 箭必定暴击。`,
        vals: { dmg: [45, 70, 115] },
        cast(b, u, v) {
          const s = u.star - 1;
          for (let i = 0; i < 4; i++) {
            b.after(i * 0.12, () => {
              const list = b.enemies(u).sort((a, c) => a.hp - c.hp);
              if (!list.length) return;
              const t = list[i % Math.min(2, list.length)] || list[0];
              b.physical(u, t, u.ad * 1.4 + v.dmg[s], { forceCrit: i === 3 });
              b.fx('shot', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
            });
          }
        }
      }
    },
    {
      id: 'lian_po', name: '廉颇', title: '信平君', glyph: '廉', cost: 3,
      traits: ['blademaster', 'guardian'], range: 1, hp: 900, ad: 60, as: 0.65,
      armor: 50, mr: 40, mana: 70, startMana: 0, color: '#94a3b8',
      spell: {
        name: '负荆固守', icon: '魂',
        text: (v, s) => `为所有友军提供 ${v.shield[s]} 护盾，持续 4 秒；自身获得双倍护盾。`,
        vals: { shield: [190, 285, 460] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.allies(u).forEach(a => b.shield(a, v.shield[s] * (a === u ? 2 : 1), 4));
          b.fx('shieldAll', { color: u.color });
        }
      }
    },
    {
      id: 'dian_wei', name: '典韦', title: '古之恶来', glyph: '典', cost: 3,
      traits: ['brawler', 'blademaster'], range: 1, hp: 950, ad: 70, as: 0.75,
      armor: 35, mr: 30, mana: 60, startMana: 0, color: '#f59e0b',
      spell: {
        name: '双戟破军', icon: '狂',
        text: (v, s) => `进入狂战，获得 60% 攻速、30% 生命偷取并免疫控制，持续 6 秒。`,
        vals: {},
        cast(b, u) {
          b.cleanse(u);
          b.buff(u, { asPct: 0.6, lifesteal: 0.3, ccImmune: true }, 6);
          b.fx('rage', { cell: b.cellOf(u), color: u.color });
        }
      }
    },

    /* ---------------- 4 费 ---------------- */
    {
      id: 'nie_zheng', name: '聂政', title: '白虹贯日', glyph: '丽', cost: 4,
      traits: ['assassin', 'blademaster'], range: 1, hp: 900, ad: 80, as: 0.8,
      armor: 35, mr: 35, mana: 50, startMana: 0, color: '#f43f5e',
      spell: {
        name: '白虹刺', icon: '剑',
        text: (v, s) => `连续刺杀 5 次，每次对生命最低的敌人造成 ${v.dmg[s]} 魔法伤害。`,
        vals: { dmg: [110, 165, 285] },
        cast(b, u, v) {
          const s = u.star - 1;
          for (let i = 0; i < 5; i++) {
            b.after(i * 0.09, () => {
              const t = b.lowestHp(b.enemies(u));
              if (!t) return;
              b.magic(u, t, v.dmg[s] * b.ap(u));
              b.fx('slash', { cell: b.cellOf(t), color: u.color });
            });
          }
        }
      }
    },
    {
      id: 'zhuge_liang', name: '诸葛亮', title: '卧龙', glyph: '龙', cost: 4,
      traits: ['mage', 'dragon'], range: 3, hp: 900, ad: 60, as: 0.6,
      armor: 30, mr: 30, mana: 90, startMana: 0, color: '#818cf8',
      spell: {
        name: '八阵图', icon: '渊',
        text: (v, s) => `布下八阵图，对目标周围敌人造成 ${v.dmg[s]} 魔法伤害并眩晕 1 秒。`,
        vals: { dmg: [360, 540, 950] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          const c = b.cellOf(t);
          b.aoe(u, c, 2, v.dmg[s] * b.ap(u), 'magic');
          b.enemies(u).forEach(e => { if (b.cell(c, b.cellOf(e)) <= 2) b.stun(e, 1); });
          b.fx('blackhole', { cell: c, color: u.color });
        }
      }
    },
    {
      id: 'xiang_yu', name: '项羽', title: '西楚霸王', glyph: '项', cost: 4,
      traits: ['brawler', 'dragon'], range: 1, hp: 1150, ad: 80, as: 0.65,
      armor: 45, mr: 40, mana: 80, startMana: 0, color: '#fb7185',
      spell: {
        name: '破釜沉舟', icon: '鼎',
        text: (v, s) => `擒抱目标砸向地面，对周围敌人造成 250% 攻击力 + ${v.dmg[s]} 物理伤害并眩晕 1.2 秒，回复自身 20% 最大生命。`,
        vals: { dmg: [110, 165, 280] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.blinkNear(u, t);
          const c = b.cellOf(t);
          b.aoe(u, c, 1, u.ad * 2.5 + v.dmg[s], 'physical');
          b.enemies(u).forEach(e => { if (b.cell(c, b.cellOf(e)) <= 1) b.stun(e, 1.2); });
          b.heal(u, u, u.hpMax * 0.2);
          b.fx('slam', { cell: c, color: u.color });
        }
      }
    },
    {
      id: 'hou_yi', name: '后羿', title: '射日英雄', glyph: '后', cost: 4,
      traits: ['blademaster', 'marksman'], range: 3, hp: 850, ad: 70, as: 0.8,
      armor: 25, mr: 25, mana: 60, startMana: 0, color: '#fde68a',
      spell: {
        name: '九日坠', icon: '翼',
        text: (v, s) => `释放 3 道落日箭，每道对目标周围敌人造成 ${v.dmg[s]} 魔法伤害；每次施法永久获得 10% 攻速。`,
        vals: { dmg: [100, 150, 260] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          const c = b.cellOf(t);
          for (let i = 0; i < 3; i++) {
            b.after(i * 0.18, () => {
              b.aoe(u, c, 2, v.dmg[s] * b.ap(u), 'magic');
              b.fx('wave', { cell: c, color: u.color });
            });
          }
          b.buff(u, { asPct: 0.1 }, 999);
        }
      }
    },
    {
      id: 'sun_bin', name: '孙膑', title: '兵家军师', glyph: '孙', cost: 4,
      traits: ['guardian', 'mystic'], range: 2, hp: 1000, ad: 55, as: 0.55,
      armor: 55, mr: 55, mana: 100, startMana: 0, color: '#a78bfa',
      spell: {
        name: '围魏救赵', icon: '策',
        text: (v, s) => `为所有友军提供 ${v.shield[s]} 护盾与 20 双抗，持续 4 秒。`,
        vals: { shield: [420, 630, 1100] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.allies(u).forEach(a => {
            b.shield(a, v.shield[s], 4);
            b.buff(a, { armor: 20, mr: 20 }, 4);
          });
          b.fx('shieldAll', { color: u.color });
        }
      }
    },

    /* ---------------- 5 费 ---------------- */
    {
      id: 'guan_yu', name: '关羽', title: '武圣', glyph: '李', cost: 5,
      traits: ['brawler', 'mystic'], range: 1, hp: 1250, ad: 95, as: 0.75,
      armor: 55, mr: 50, mana: 60, startMana: 0, color: '#f59e0b',
      spell: {
        name: '青龙偃月', icon: '刀',
        text: (v, s) => `挥出青龙偃月，踢飞目标，造成 220% 攻击力 + ${v.dmg[s]} 物理伤害并眩晕 2 秒；若目标生命低于 25%，直接斩杀。`,
        vals: { dmg: [150, 225, 380] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.nearestTarget(u);
          if (!t) return;
          b.fx('kick', { cell: b.cellOf(t), color: u.color });
          b.stun(t, 2);
          if (t.hp / t.hpMax < 0.25) {
            b.trueDamage(u, t, t.hpMax);
          } else {
            b.physical(u, t, u.ad * 2.2 + v.dmg[s]);
          }
        }
      }
    },
    {
      id: 'jiang_ziya', name: '姜子牙', title: '太公望', glyph: '姜', cost: 5,
      traits: ['mage', 'starguardian'], range: 3, hp: 950, ad: 60, as: 0.65,
      armor: 30, mr: 35, mana: 80, startMana: 0, color: '#a855f7',
      spell: {
        name: '封神令', icon: '令',
        text: (v, s) => `召来 6 道封神令，每道造成 ${v.dmg[s]} 魔法伤害，优先攻击生命最低的敌人。`,
        vals: { dmg: [125, 190, 340] },
        cast(b, u, v) {
          const s = u.star - 1;
          for (let i = 0; i < 6; i++) {
            b.after(i * 0.08, () => {
              const t = b.lowestHp(b.enemies(u));
              if (!t) return;
              b.magic(u, t, v.dmg[s] * b.ap(u));
              b.fx('orb', { from: b.cellOf(u), to: b.cellOf(t), color: u.color });
            });
          }
        }
      }
    },
    {
      id: 'han_xin', name: '韩信', title: '兵仙', glyph: '韩', cost: 5,
      traits: ['blademaster', 'assassin'], range: 1, hp: 1050, ad: 90, as: 0.85,
      armor: 40, mr: 40, mana: 70, startMana: 0, color: '#c084fc',
      spell: {
        name: '十面埋伏', icon: '策',
        text: (v, s) => `突进至最远敌人，对周围敌人造成 180% 攻击力 + ${v.dmg[s]} 物理伤害，并斩杀生命低于 20% 的敌人。`,
        vals: { dmg: [120, 180, 320] },
        cast(b, u, v) {
          const s = u.star - 1;
          const t = b.farthest(b.enemies(u), u);
          if (!t) return;
          b.blinkNear(u, t);
          const c = b.cellOf(t);
          b.aoe(u, c, 2, u.ad * 1.8 + v.dmg[s], 'physical');
          b.enemies(u).forEach(e => {
            if (b.cell(c, b.cellOf(e)) <= 2 && e.hp / e.hpMax < 0.2) b.trueDamage(u, e, e.hpMax);
          });
          b.fx('slash', { cell: c, color: u.color });
        }
      }
    },
    {
      id: 'cai_wenji', name: '蔡文姬', title: '琴心才女', glyph: '蔡', cost: 5,
      traits: ['mystic', 'starguardian'], range: 3, hp: 900, ad: 50, as: 0.65,
      armor: 30, mr: 45, mana: 70, startMana: 0, color: '#67e8f9',
      spell: {
        name: '胡笳十八拍', icon: '琴',
        text: (v, s) => `弹奏胡笳，治疗所有友军 ${v.heal[s]} 生命，解除控制，并使他们获得 25% 攻速，持续 5 秒。`,
        vals: { heal: [190, 285, 480] },
        cast(b, u, v) {
          const s = u.star - 1;
          b.allies(u).forEach(a => {
            b.heal(u, a, v.heal[s] * b.healAmp(u));
            b.cleanse(a);
            b.buff(a, { asPct: 0.25 }, 5);
          });
          b.fx('healAll', { color: u.color });
        }
      }
    }
  ];

  /* ---------------- 英雄定位 ---------------- */
  const UNIT_PROFILES = {
    fan_kuai:   { role: '物理战士', roleKind: 'physical', style: '横盾护主，扫阵承伤' },
    yang_youji: { role: '物理射手', roleKind: 'physical', style: '百步穿杨，后排输出' },
    mozi:       { role: '魔法法师', roleKind: 'magic',    style: '机关光束，直线爆发' },
    zhuan_zhu:  { role: '物理刺客', roleKind: 'physical', style: '鱼肠藏锋，切入后排' },
    meng_ben:   { role: '守护坦克', roleKind: 'guardian', style: '虎贲之盾，前排硬控' },
    bian_que:   { role: '治疗辅助', roleKind: 'support',  style: '望闻问切，治疗回复' },
    zhang_heng: { role: '魔法射手', roleKind: 'magic',    style: '浑天测地，法术消耗' },
    li_bai:     { role: '物理战士', roleKind: 'physical', style: '青莲剑歌，突进护身' },
    fu_hao:     { role: '魔法坦克', roleKind: 'magic',    style: '玄鸟庇佑，范围灼烧' },
    huang_yueying:{ role: '物理射手', roleKind: 'physical', style: '连弩齐发，后排爆发' },
    yue_yun:    { role: '物理战士', roleKind: 'physical', style: '双椎破阵，突进控制' },
    mu_guaying: { role: '守护坦克', roleKind: 'guardian', style: '天门战阵，前排硬控' },
    yao_li:     { role: '物理刺客', roleKind: 'physical', style: '断臂藏锋，斩杀残血' },
    chang_e:    { role: '魔法法师', roleKind: 'magic',    style: '月华流照，直线爆发' },
    diao_chan:  { role: '魔法刺客', roleKind: 'magic',    style: '连环舞，范围重伤' },
    hua_mulan:  { role: '魔法坦克', roleKind: 'magic',    style: '巾帼战阵，范围控制' },
    li_guang:   { role: '物理射手', roleKind: 'physical', style: '射石没羽，远程狙击' },
    lian_po:    { role: '物理坦克', roleKind: 'physical', style: '负荆固守，团队护盾' },
    dian_wei:   { role: '物理战士', roleKind: 'physical', style: '双戟破军，免控续航' },
    nie_zheng:  { role: '魔法刺客', roleKind: 'magic',    style: '白虹贯日，多段斩杀' },
    zhuge_liang:{ role: '魔法法师', roleKind: 'magic',    style: '八阵图，大范围控制' },
    xiang_yu:   { role: '物理坦克', roleKind: 'physical', style: '破釜沉舟，前排摔投' },
    hou_yi:     { role: '魔法射手', roleKind: 'magic',    style: '九日坠，持续法术输出' },
    sun_bin:    { role: '守护辅助', roleKind: 'guardian', style: '围魏救赵，团队护盾' },
    guan_yu:    { role: '物理战士', roleKind: 'physical', style: '青龙偃月，踢飞斩杀' },
    jiang_ziya: { role: '魔法法师', roleKind: 'magic',    style: '封神令，单体法术爆发' },
    han_xin:    { role: '物理刺客', roleKind: 'physical', style: '十面埋伏，切入斩杀' },
    cai_wenji:  { role: '治疗辅助', roleKind: 'support',  style: '胡笳十八拍，群体治疗' }
  };
  UNITS.forEach(u => Object.assign(u, UNIT_PROFILES[u.id] || { role: '物理战士', roleKind: 'physical', style: '' }));

  /* ---------------- 装备：8 基础材料 + 36 件器物 ---------------- */
  const COMPONENT_COLORS = {
    sword: '#f59e0b', bow: '#4ade80', rod: '#a78bfa', tear: '#38bdf8',
    belt: '#ef4444', vest: '#94a3b8', cloak: '#22d3ee', glove: '#f472b6'
  };

  const COMPONENTS = [
    {
      id: 'sword', name: '玄铁', short: '玄铁', color: COMPONENT_COLORS.sword,
      component: true, sell: 1, stats: { ad: 12 },
      desc: '+12 攻击力。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'bow', name: '柘木', short: '柘木', color: COMPONENT_COLORS.bow,
      component: true, sell: 1, stats: { asPct: 0.12 },
      desc: '+12% 攻速。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'rod', name: '朱砂', short: '朱砂', color: COMPONENT_COLORS.rod,
      component: true, sell: 1, stats: { ap: 18 },
      desc: '+18 法术强度。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'tear', name: '灵玉', short: '灵玉', color: COMPONENT_COLORS.tear,
      component: true, sell: 1, stats: { mana: 15 },
      desc: '+15 初始法力。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'belt', name: '犀皮', short: '犀皮', color: COMPONENT_COLORS.belt,
      component: true, sell: 1, stats: { hp: 180 },
      desc: '+180 最大生命。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'vest', name: '铜片', short: '铜片', color: COMPONENT_COLORS.vest,
      component: true, sell: 1, stats: { armor: 22 },
      desc: '+22 护甲。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'cloak', name: '云锦', short: '云锦', color: COMPONENT_COLORS.cloak,
      component: true, sell: 1, stats: { mr: 22 },
      desc: '+22 魔法抗性。基础材料，可与另一件基础材料合成。'
    },
    {
      id: 'glove', name: '虎符', short: '虎符', color: COMPONENT_COLORS.glove,
      component: true, sell: 1, stats: { critChance: 0.12 },
      desc: '+12% 暴击率。基础材料，可与另一件基础材料合成。'
    }
  ];

  const CORE_ITEMS = [
    {
      id: 'infinity', name: '鱼肠剑', short: '鱼肠', color: '#f59e0b', components: ['sword', 'glove'],
      stats: { ad: 25, critChance: 0.25, critDmg: 0.4 },
      desc: '+25 攻击力，+25% 暴击率，+40% 暴击伤害。'
    },
    {
      id: 'giant_slayer', name: '巨阙剑', short: '巨阙', color: '#f97316', components: ['sword', 'bow'],
      stats: { ad: 25, asPct: 0.2 },
      desc: '+25 攻击力，+20% 攻速。对最大生命高于 1200 的敌人造成 25% 额外伤害。'
    },
    {
      id: 'blue_buff', name: '随侯珠', short: '随珠', color: '#3b82f6', components: ['tear', 'tear'],
      stats: { ap: 30, mana: 30 },
      desc: '+30 法术强度，开场额外 30 法力。施法后回复 20 法力。'
    },
    {
      id: 'archangel', name: '河图洛书', short: '河图', color: '#8b5cf6', components: ['rod', 'tear'],
      stats: { ap: 30 },
      desc: '+30 法术强度。每 4 秒获得 +20 法术强度，可无限叠加。'
    },
    {
      id: 'warmog', name: '犀皮宝甲', short: '犀甲', color: '#ef4444', components: ['belt', 'belt'],
      stats: { hp: 500 },
      desc: '+500 最大生命。每秒回复 2% 最大生命。'
    },
    {
      id: 'gargoyle', name: '山文甲', short: '山文', color: '#64748b', components: ['vest', 'cloak'],
      stats: { armor: 40, mr: 40 },
      desc: '+40 护甲，+40 魔法抗性。'
    },
    {
      id: 'redemption', name: '神农鼎', short: '神农', color: '#22d3ee', components: ['belt', 'tear'],
      stats: { hp: 300 },
      desc: '+300 最大生命。每 5 秒治疗所有友军 8% 已损失生命。'
    },
    {
      id: 'ionic', name: '八卦镜', short: '八卦', color: '#a78bfa', components: ['rod', 'cloak'],
      stats: { ap: 30, mr: 30 },
      desc: '+30 法术强度，+30 魔抗。每 3 秒电击周围敌人，并削减其 30% 魔抗。'
    },
    {
      id: 'guinsoo', name: '越女剑', short: '越女', color: '#f43f5e', components: ['bow', 'rod'],
      stats: { asPct: 0.2 },
      desc: '+20% 攻速。每次普攻永久获得 6% 攻速，最多叠加 20 层。'
    },
    {
      id: 'justice', name: '尚方宝剑', short: '尚方', color: '#fbbf24', components: ['sword', 'tear'],
      stats: { ad: 25, ap: 25, dmgAmp: 0.15, healAmp: 0.15 },
      desc: '+25 攻击力，+25 法术强度，+15% 伤害与治疗效果。'
    },
    {
      id: 'dragon_claw', name: '昆仑镜', short: '昆仑', color: '#10b981', components: ['cloak', 'cloak'],
      stats: { mr: 50 },
      desc: '+50 魔法抗性，受到的魔法伤害降低 25%。'
    },
    {
      id: 'thornmail', name: '鱼鳞甲', short: '鱼鳞', color: '#84cc16', components: ['vest', 'vest'],
      stats: { armor: 45 },
      desc: '+45 护甲。受到普攻时反弹 20% 物理伤害。'
    },
    {
      id: 'titan', name: '霸王枪', short: '霸王', color: '#0ea5e9', components: ['bow', 'vest'],
      stats: { armor: 20, asPct: 0.2 },
      desc: '+20 护甲，+20% 攻速。每次攻击获得 +1 攻击力与法术强度，最多 30 层。'
    },
    {
      id: 'jeweled', name: '和氏璧', short: '和璧', color: '#e879f9', components: ['rod', 'glove'],
      stats: { ap: 30, critChance: 0.15 },
      desc: '+30 法术强度，+15% 暴击率。技能可以暴击。'
    },
    {
      id: 'sunfire', name: '赤焰战袍', short: '赤焰', color: '#fb923c', components: ['belt', 'vest'],
      stats: { hp: 300, armor: 25 },
      desc: '+300 最大生命，+25 护甲。每秒灼烧周围敌人，并施加 30% 重伤。'
    }
  ];

  const COMPONENT_BY_ID = {};
  COMPONENTS.forEach(c => { COMPONENT_BY_ID[c.id] = c; });

  const EXTRA_ITEM_DEFS = [
    ['deathblade', '干将', '干将', 'sword', 'sword'],
    ['gunblade', '莫邪', '莫邪', 'sword', 'rod'],
    ['sterak', '湛卢', '湛卢', 'sword', 'belt'],
    ['guardian_angel', '龙渊', '龙渊', 'sword', 'vest'],
    ['quicksilver', '泰阿', '泰阿', 'sword', 'cloak'],
    ['rapid_firecannon', '后羿弓', '后羿', 'bow', 'bow'],
    ['shojin', '养由基弓', '养弓', 'bow', 'tear'],
    ['titanic_hydra', '大黄弩', '黄弩', 'bow', 'belt'],
    ['runaan', '连弩', '连弩', 'bow', 'cloak'],
    ['last_whisper', '震天弓', '震天', 'bow', 'glove'],
    ['rabadon', '太公兵法', '太公', 'rod', 'rod'],
    ['morello', '孙子兵法', '孙子', 'rod', 'belt'],
    ['locket', '八阵图', '八阵', 'rod', 'vest'],
    ['frozen_heart', '奇门遁甲', '奇门', 'tear', 'vest'],
    ['shroud', '照妖镜', '照妖', 'tear', 'cloak'],
    ['edge_of_night', '青铜鼎', '青铜', 'tear', 'glove'],
    ['spirit_visage', '编钟', '编钟', 'belt', 'cloak'],
    ['trap_claw', '赤兔', '赤兔', 'belt', 'glove'],
    ['randuin', '的卢', '的卢', 'vest', 'glove'],
    ['wardens_mail', '乌骓', '乌骓', 'cloak', 'glove'],
    ['thieves_gloves', '绝影', '绝影', 'glove', 'glove']
  ];

  const STAT_LABELS = {
    ad: '攻击力', ap: '法术强度', hp: '最大生命', armor: '护甲', mr: '魔法抗性',
    asPct: '攻速', critChance: '暴击率', critDmg: '暴击伤害', mana: '初始法力',
    dmgAmp: '伤害', healAmp: '治疗效果'
  };
  function statText(stats) {
    return Object.keys(stats).map(k => {
      const v = stats[k];
      const pct = ['asPct', 'critChance', 'critDmg', 'dmgAmp', 'healAmp'].includes(k);
      return `+${pct ? Math.round(v * 100) + '%' : v} ${STAT_LABELS[k] || k}`;
    }).join('，');
  }
  function combinedStats(a, b) {
    const sa = COMPONENT_BY_ID[a].stats, sb = COMPONENT_BY_ID[b].stats;
    const out = {};
    Object.keys(sa).concat(Object.keys(sb)).forEach(k => {
      if (out[k] !== undefined) return;
      const sum = (sa[k] || 0) + (sb[k] || 0);
      out[k] = ['asPct', 'critChance', 'critDmg', 'dmgAmp', 'healAmp'].includes(k)
        ? Math.round(sum * 1.6 * 100) / 100
        : Math.round(sum * 1.6);
    });
    return out;
  }

  const EXTRA_ITEMS = EXTRA_ITEM_DEFS.map(([id, name, short, a, b]) => {
    const stats = combinedStats(a, b);
    return {
      id, name, short, components: [a, b], color: COMPONENT_COLORS[a],
      stats, desc: `合成器物：${statText(stats)}。`
    };
  });

  const ITEMS = CORE_ITEMS.concat(EXTRA_ITEMS);
  ITEMS.forEach(i => { i.sell = 2; i.component = false; });

  const ALL_ITEMS = COMPONENTS.concat(ITEMS);
  const ITEM_BY_ID = {};
  ALL_ITEMS.forEach(i => { ITEM_BY_ID[i.id] = i; });

  const COMBINE = {};
  function combineKey(a, b) { return [a, b].sort().join('+'); }
  ITEMS.forEach(item => {
    const [a, b] = item.components;
    COMBINE[combineKey(a, b)] = item.id;
  });

  function combineItems(a, b) {
    return COMBINE[combineKey(a, b)] || null;
  }

  /* ---------------- PvE 怪物 ---------------- */
  const MONSTERS = {
    wolf: {
      id: 'wolf', name: '荒原狼', glyph: '狼', cost: 1, traits: [], range: 1,
      hp: 430, ad: 32, as: 0.6, armor: 15, mr: 15, mana: 60, color: '#94a3b8',
      spell: {
        name: '撕咬', icon: '咬',
        text: () => '撕咬目标，造成 150% 攻击力物理伤害。',
        vals: {},
        cast(b, u) {
          const t = b.nearestTarget(u);
          if (t) b.physical(u, t, u.ad * 1.5);
        }
      }
    },
    stone: {
      id: 'stone', name: '石甲兽', glyph: '甲', cost: 1, traits: [], range: 1,
      hp: 1900, ad: 58, as: 0.5, armor: 55, mr: 30, mana: 80, color: '#78716c',
      spell: {
        name: '岩崩', icon: '岩',
        text: () => '砸击地面，对周围敌人造成魔法伤害。',
        vals: { dmg: [200, 200, 200] },
        cast(b, u, v) {
          b.aoe(u, b.cellOf(u), 1, v.dmg[0], 'magic');
          b.fx('slam', { cell: b.cellOf(u), color: u.color });
        }
      }
    },
    herald: {
      id: 'herald', name: '撼地巨猿', glyph: '猿', cost: 1, traits: [], range: 1,
      hp: 3000, ad: 95, as: 0.55, armor: 50, mr: 40, mana: 80, color: '#a855f7',
      spell: {
        name: '撼地冲撞', icon: '撼',
        text: () => '冲撞最远敌人，造成大量物理伤害并眩晕。',
        vals: { dmg: [260, 260, 260] },
        cast(b, u, v) {
          const t = b.farthest(b.enemies(u), u);
          if (!t) return;
          b.blinkNear(u, t);
          b.stun(t, 1);
          b.physical(u, t, u.ad * 2 + v.dmg[0]);
          b.fx('burst', { cell: b.cellOf(t), color: u.color });
        }
      }
    },
    dragon: {
      id: 'dragon', name: '赤炎蛟', glyph: '蛟', cost: 1, traits: [], range: 2,
      hp: 6500, ad: 160, as: 0.55, armor: 70, mr: 70, mana: 80, color: '#f59e0b',
      spell: {
        name: '赤炎吐息', icon: '炎',
        text: () => '喷吐龙息，对目标周围敌人造成巨额魔法伤害。',
        vals: { dmg: [600, 600, 600] },
        cast(b, u, v) {
          const t = b.nearestTarget(u);
          if (!t) return;
          b.aoe(u, b.cellOf(t), 2, v.dmg[0], 'magic');
          b.fx('fire', { cell: b.cellOf(t), color: '#f59e0b' });
        }
      }
    },
    elder: {
      id: 'elder', name: '九幽烛龙', glyph: '烛', cost: 1, traits: [], range: 2,
      hp: 9500, ad: 210, as: 0.6, armor: 85, mr: 85, mana: 70, color: '#f97316',
      spell: {
        name: '九幽灭息', icon: '灭',
        text: () => '毁灭一切，对目标周围敌人造成巨额魔法伤害并眩晕。',
        vals: { dmg: [800, 800, 800] },
        cast(b, u, v) {
          const t = b.nearestTarget(u);
          if (!t) return;
          b.aoe(u, b.cellOf(t), 2, v.dmg[0], 'magic');
          b.enemies(u).forEach(e => { if (b.dist(t, e) <= 2) b.stun(e, 1); });
          b.fx('fire', { cell: b.cellOf(t), color: '#f97316' });
        }
      }
    }
  };

  const MONSTER_PROFILES = {
    wolf:   { role: '物理战士', roleKind: 'physical', style: '荒原撕咬' },
    stone:  { role: '物理坦克', roleKind: 'physical', style: '石甲护体' },
    herald: { role: '物理坦克', roleKind: 'physical', style: '撼地冲锋' },
    dragon: { role: '魔法坦克', roleKind: 'magic',    style: '赤炎吐息' },
    elder:  { role: '魔法坦克', roleKind: 'magic',    style: '九幽灭息' }
  };
  Object.keys(MONSTERS).forEach(k => Object.assign(MONSTERS[k], MONSTER_PROFILES[k] || {}));

  const PVE_WAVES = {
    1: {
      name: '荒原狼群', gold: 3, items: 1,
      units: [{ id: 'wolf', star: 1, r: 2, c: 2 }, { id: 'wolf', star: 1, r: 2, c: 4 }]
    },
    2: {
      name: '荒原饿狼', gold: 3, items: 1,
      units: [{ id: 'wolf', star: 1, r: 2, c: 1 }, { id: 'wolf', star: 1, r: 2, c: 3 }, { id: 'wolf', star: 1, r: 2, c: 5 }]
    },
    3: {
      name: '石甲兽巢', gold: 5, items: 2,
      units: [{ id: 'stone', star: 1, r: 2, c: 3 }, { id: 'wolf', star: 1, r: 3, c: 2 }, { id: 'wolf', star: 1, r: 3, c: 4 }]
    },
    9: {
      name: '撼地巨猿', gold: 4, items: 2,
      units: [{ id: 'herald', star: 1, r: 2, c: 3 }, { id: 'wolf', star: 1, r: 3, c: 1 }, { id: 'wolf', star: 1, r: 3, c: 5 }]
    },
    15: {
      name: '赤炎蛟来袭', gold: 5, items: 2,
      units: [{ id: 'dragon', star: 1, r: 1, c: 3 }, { id: 'wolf', star: 1, r: 3, c: 2 }, { id: 'wolf', star: 1, r: 3, c: 4 }]
    },
    21: {
      name: '双蛟会', gold: 6, items: 2,
      units: [{ id: 'dragon', star: 1, r: 1, c: 2 }, { id: 'dragon', star: 1, r: 1, c: 4 }]
    },
    27: {
      name: '九幽烛龙', gold: 8, items: 3,
      units: [{ id: 'elder', star: 1, r: 1, c: 3 }, { id: 'dragon', star: 1, r: 2, c: 1 }, { id: 'dragon', star: 1, r: 2, c: 5 }]
    }
  };

  const BOTS = [
    { name: '青衫客', glyph: '青', color: '#5eead4' },
    { name: '弈秋', glyph: '弈', color: '#fbbf24' },
    { name: '墨羽', glyph: '墨', color: '#fb923c' },
    { name: '长风', glyph: '风', color: '#818cf8' },
    { name: '听雨', glyph: '雨', color: '#f472b6' },
    { name: '逐鹿', glyph: '鹿', color: '#22d3ee' },
    { name: '山河', glyph: '山', color: '#c084fc' }
  ];

  const ECON = {
    startGold: 6,
    startLevel: 3,
    maxLevel: 10,
    xpPerRound: 3,
    xpBuyCost: 4,
    xpBuyAmount: 4,
    refreshCost: 2,
    benchSize: 9,
    itemBenchSize: 12,
    xpTable: { 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 56, 8: 80, 9: 72 },
    shopOdds: {
      2: [1, 0, 0, 0, 0],
      3: [0.75, 0.25, 0, 0, 0],
      4: [0.55, 0.3, 0.15, 0, 0],
      5: [0.45, 0.33, 0.2, 0.02, 0],
      6: [0.3, 0.4, 0.25, 0.05, 0],
      7: [0.19, 0.35, 0.35, 0.1, 0.01],
      8: [0.16, 0.25, 0.35, 0.22, 0.02],
      9: [0.09, 0.15, 0.3, 0.3, 0.16],
      10: [0.05, 0.1, 0.2, 0.35, 0.3]
    }
  };

  const UNIT_BY_ID = {};
  UNITS.forEach(u => { UNIT_BY_ID[u.id] = u; });
  const MONSTER_BY_ID = {};
  Object.keys(MONSTERS).forEach(k => { MONSTER_BY_ID[k] = MONSTERS[k]; });

  window.GF = window.GF || {};
  window.GF.DATA = {
    UNITS, UNIT_BY_ID, TRAITS, ITEMS, ITEM_BY_ID, COMPONENTS, COMPONENT_BY_ID,
    ALL_ITEMS, COMBINE, combineKey, combineItems,
    MONSTERS, MONSTER_BY_ID, PVE_WAVES, BOTS, ECON,
    COST_COLORS: { 1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24' },
    STAGE_BASE_DAMAGE: [0, 2, 3, 4, 6, 9, 12, 15],
    ROUNDS_PER_STAGE: 6
  };
})();
