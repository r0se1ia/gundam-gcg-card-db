/**
 * Gundam GCG UNIT 卡片評分邏輯
 * 依 卡片評分標準.md 實作
 */

(function(global) {
  'use strict';

  /** UNIT 標準體質對照表：Cost -> { hpAp, level } */
  var STANDARD_STATS = {
    1: { hpAp: 4, level: 2 },
    2: { hpAp: 6, level: 3 },
    3: { hpAp: 7, level: 4 },
    4: { hpAp: 8, level: 5 },
    5: { hpAp: 9, level: 7 },
    6: { hpAp: 10, level: 7 },
    7: { hpAp: 11, level: 8 },
    8: { hpAp: 10, level: 8 }
  };

  /**
   * 計算 UNIT 卡片評分
   * @param {Object} card - 卡片物件
   * @returns {{ applicable: boolean, total?: number, items?: Array<{ name: string, score: number }> }}
   */
  function calculateScore(card) {
    if (!card || String(card.CardType || '').toUpperCase() !== 'UNIT') {
      return { applicable: false };
    }

    var cost = parseInt(card.Cost, 10);
    if (isNaN(cost) || cost < 1 || cost > 8) {
      return { applicable: false };
    }

    var std = STANDARD_STATS[cost];
    if (!std) return { applicable: false };

    var items = [];
    var total = 0;

    // 1. hp+ap：與標準比較，每多 1 點 +1、少 1 點 -1；若 AP/HP 為空則跳過
    var ap = parseInt(card.AP, 10);
    var hp = parseInt(card.HP, 10);
    if (!isNaN(ap) && !isNaN(hp)) {
      var hpAp = ap + hp;
      var diff = hpAp - std.hpAp;
      items.push({ name: 'hp+ap', score: diff });
      total += diff;
    }

    // 2. Level：與標準比較，每少 1 點 +1（易出牌）、每多 1 點 -1；若 Level 為空則跳過
    var level = parseInt(card.Level, 10);
    if (!isNaN(level)) {
      var levelDiff = std.level - level;
      items.push({ name: 'Level', score: levelDiff });
      total += levelDiff;
    }

    // 3. 帶 link：Resonance 有值 = 0；無值 = -0.5（沒帶 link 才顯示扣分）
    var resonance = String(card.Resonance || '').trim();
    var hasLink = resonance !== '' && resonance !== '-';
    var linkScore = hasLink ? 0 : -0.5;
    if (!hasLink) items.push({ name: '帶 link', score: linkScore });
    total += linkScore;

    // 4. EffectText：效果有幾條給幾分
    var effectText = String(card.EffectText || '').trim();
    var effectCount = countEffects(effectText);
    var effectScore = effectCount;
    if (effectCount > 0) items.push({ name: '效果', score: effectScore });
    total += effectScore;

    // 5. Resonance 含特徵：有「特徵」+0.5 分
    var hasTraitText = resonance.indexOf('特徵') >= 0;
    var traitScore = hasTraitText ? 0.5 : 0;
    if (hasTraitText) items.push({ name: 'Resonance 含特徵', score: traitScore });
    total += traitScore;

    return {
      applicable: true,
      total: total,
      items: items
    };
  }

  /**
   * 判斷 EffectText 的效果數量
   * 效果開頭：1) 《效果名》如《修復1》獨立算一條  2) 【觸發時機】如【搭乘時】【配置時】
   * 【】連續（中間無語句）視為同一條，如【搭乘中·xxx】【破壞時】= 1 條
   * @param {string} effectText - 效果文字
   * @returns {number} 效果數量
   */
  function countEffects(effectText) {
    var text = String(effectText || '').trim();
    if (!text || text === '-') return 0;

    var count = 0;

    // 1. 《效果名》獨立算一條：行首《XXX》或 行首 N. 《XXX》（排除文中如「獲得《阻擋者》效果」）
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (/^《[^》]+》/.test(line) || /^\d+\.\s*《[^》]+》/.test(line)) count++;
    }

    // 2. 【觸發時機】：連續【】【】...（中間無語句）視為 1 條
    var bracketRuns = text.match(/【[^】]+】(?:\s*【[^】]+】)*/g);
    if (bracketRuns) count += bracketRuns.length;

    if (count > 0) return count;
    return text ? 1 : 0;
  }

  global.calculateScore = calculateScore;
  global.countEffects = countEffects;
})(typeof window !== 'undefined' ? window : this);
