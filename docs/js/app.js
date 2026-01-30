/**
 * Gundam GCG 卡片查詢 - 主邏輯
 */

(function() {
  'use strict';

  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

  function getQueryParams() {
    var form = document.getElementById('filterForm');
    if (!form) return {};
    var fd = new FormData(form);
    var params = {};
    fd.forEach(function(v, k) {
      if (v !== '') params[k] = v;
    });
    return params;
  }

  /** 前端備援篩選：確保顯示結果符合表單條件（當後端篩選不完整時） */
  function filterCardsClientSide(cards, params) {
    if (!Array.isArray(cards) || cards.length === 0) return cards;
    params = params || getQueryParams();
    var filtered = cards.filter(function(card) {
      if (params.setCode && String(card.Set || '').trim() !== String(params.setCode).trim()) return false;
      if (params.cardType && String(card.CardType || '').trim().toUpperCase() !== String(params.cardType).trim().toUpperCase()) return false;
      if (params.cost !== undefined && params.cost !== '' && parseInt(card.Cost, 10) !== parseInt(params.cost, 10)) return false;
      if (params.level !== undefined && params.level !== '' && String(card.Level || '').trim() !== String(params.level).trim()) return false;
      if (params.color && String(card.Color || '').trim().toUpperCase() !== String(params.color).trim().toUpperCase()) return false;
      if (params.rarity && String(card.Rarity || '').trim().toUpperCase() !== String(params.rarity).trim().toUpperCase()) return false;
      if (params.ap !== undefined && params.ap !== '' && parseInt(card.AP, 10) !== parseInt(params.ap, 10)) return false;
      if (params.hp !== undefined && params.hp !== '' && parseInt(card.HP, 10) !== parseInt(params.hp, 10)) return false;
      if (params.apHpTotal !== undefined && params.apHpTotal !== '') {
        var ap = parseInt(card.AP, 10);
        var hp = parseInt(card.HP, 10);
        var total = (!isNaN(ap) ? ap : 0) + (!isNaN(hp) ? hp : 0);
        if (total !== parseInt(params.apHpTotal, 10)) return false;
      }
      if (params.minScore !== undefined && params.minScore !== '') {
        var scoreResult = typeof calculateScore === 'function' ? calculateScore(card) : null;
        if (!scoreResult || !scoreResult.applicable) return false;
        var adj = getWeightedAdjustment(card);
        var finalScore = scoreResult.total + adj;
        var minScore = parseInt(params.minScore, 10);
        if (!isNaN(minScore) && finalScore < minScore) return false;
      }
      return true;
    });
    if (params.minScore !== undefined && params.minScore !== '') {
      filtered.sort(function(a, b) {
        var sa = typeof calculateScore === 'function' ? calculateScore(a) : null;
        var sb = typeof calculateScore === 'function' ? calculateScore(b) : null;
        var adjA = getWeightedAdjustment(a);
        var adjB = getWeightedAdjustment(b);
        var ta = (sa && sa.applicable) ? sa.total + adjA : -999;
        var tb = (sb && sb.applicable) ? sb.total + adjB : -999;
        return tb - ta;
      });
    }
    return filtered;
  }

  function buildQueryUrl(useQueryAction) {
    var params = useQueryAction ? getQueryParams() : {};
    params.action = 'query';
    params.limit = params.limit || '1000';
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return API_BASE + '?' + qs;
  }

  function showStatus(msg, type) {
    var el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status ' + (type || 'ok');
    el.style.display = 'block';
  }

  function hideStatus() {
    var el = document.getElementById('statusMsg');
    if (el) el.style.display = 'none';
  }

  function getWeightedAdjustment(card) {
    var adj = card.WeightedAdjustment;
    if (adj === undefined || adj === null) return 0;
    var n = parseFloat(adj);
    return isNaN(n) ? 0 : n;
  }

  function renderScoreHtml(scoreResult, card) {
    if (!scoreResult || !scoreResult.applicable) {
      return '<div class="score-na">（非 UNIT 或 Cost 不在 1–8，不評分）</div>';
    }
    var items = scoreResult.items || [];
    var total = scoreResult.total;
    var adjustment = card ? getWeightedAdjustment(card) : 0;
    if (adjustment !== 0) {
      items = items.concat([{ name: '加權', score: adjustment }]);
      total += adjustment;
    }
    var parts = items.map(function(item) {
      var cls = item.score > 0 ? 'positive' : (item.score < 0 ? 'negative' : 'zero');
      var sign = item.score >= 0 ? '+' : '';
      return '<span class="' + cls + '">' + item.name + '：' + sign + item.score + '</span>';
    }).join('');
    var cardNo = (card && card.CardNo) ? String(card.CardNo).replace(/"/g, '&quot;') : '';
    var adjVal = adjustment !== 0 ? adjustment : '';
    var editForm = cardNo
      ? '<div class="score-edit"><label>加權：</label><input type="number" step="0.5" class="weighted-input" data-card-no="' + cardNo + '" value="' + adjVal + '" placeholder="0"><button type="button" class="btn-save-weighted">儲存</button></div>'
      : '';
    return '<div class="score-total">總分：' + total + '</div>' +
      '<div class="score-items">' + parts + '</div>' +
      editForm;
  }

  function getImageFallbackUrl(card) {
    var cardNo = (card.CardNo || '').trim();
    return cardNo ? 'https://www.gundam-gcg.com/jp/images/cards/card/' + cardNo.replace(/"/g, '') + '.webp' : '';
  }

  function renderCard(card) {
    var imgUrl = (card.ImageUrl || '').trim() || getImageFallbackUrl(card);
    var fallbackUrl = getImageFallbackUrl(card);
    var dataFallback = (fallbackUrl && imgUrl !== fallbackUrl) ? ' data-fallback="' + fallbackUrl.replace(/"/g, '&quot;') + '"' : '';
    var imgHtml = imgUrl
      ? '<img class="card-image" src="' + imgUrl.replace(/"/g, '&quot;') + '" alt="" loading="lazy" referrerpolicy="no-referrer"' + dataFallback + ' onerror="var f=this.dataset.fallback;if(f){this.dataset.fallback=\'\';this.src=f}else{this.outerHTML=\'<div class=card-image-placeholder>無圖片</div>\'}">'
      : '<div class="card-image-placeholder">無圖片</div>';

    var meta = [card.Set || '', card.CardNo || '', card.Rarity || '', card.CardType || ''].filter(Boolean).join(' / ');
    var stats = '';
    if (card.AP !== undefined && card.AP !== '' && card.HP !== undefined && card.HP !== '') {
      stats = 'Cost ' + (card.Cost || '-') + ' | AP ' + card.AP + ' / HP ' + card.HP + (card.Level ? ' | Lv.' + card.Level : '');
    } else {
      stats = 'Cost ' + (card.Cost || '-') + (card.Level ? ' | Lv.' + card.Level : '');
    }

    var scoreResult = typeof calculateScore === 'function' ? calculateScore(card) : null;
    var scoreHtml = '<div class="score-section-title">評分</div>' + renderScoreHtml(scoreResult, card);

    var effectText = (card.EffectText || '').trim();
    var effectCount = typeof countEffects === 'function' ? countEffects(card.EffectText) : 0;
    if (effectText && effectText !== '-') {
      effectText = effectText
        .replace(/【/g, '\n【')
        .replace(/。/g, '。\n')
        .trim()
        .replace(/\n+/g, '\n');
      effectText = effectText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }
    var effectLabel = effectCount > 0 ? '效果（' + effectCount + ' 條）' : '效果';
    var effectHtml = effectText
      ? '<div class="card-detail-section"><div class="card-detail-label">' + effectLabel + '</div><div class="card-detail-text">' + effectText + '</div></div>'
      : '';

    var resonance = (card.Resonance || '').trim();
    var resonanceHtml = resonance
      ? '<div class="card-detail-section"><div class="card-detail-label">共鳴</div><div class="card-detail-text">' + resonance.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div></div>'
      : '';

    var traits = (card.Traits || '').trim();
    var traitsHtml = traits
      ? '<div class="card-detail-section"><div class="card-detail-label">機體特徵</div><div class="card-detail-text">' + traits.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div></div>'
      : '';

    var url = (card.Url || '').trim();
    var linkHtml = url ? '<a class="card-link" href="' + url.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">查看官方詳情</a>' : '';

    return '<div class="card-item">' +
      '<div class="card-image-wrap">' + imgHtml + '</div>' +
      '<div class="card-content">' +
        '<div class="card-body">' +
          '<div class="card-name">' + (card.Name || '未知').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
          '<div class="card-meta">' + meta.replace(/</g, '&lt;') + '</div>' +
          '<div class="card-stats">' + stats.replace(/</g, '&lt;') + '</div>' +
        '</div>' +
        '<div class="card-detail">' +
          resonanceHtml +
          traitsHtml +
          effectHtml +
          linkHtml +
        '</div>' +
      '</div>' +
      '<div class="card-score-panel">' + scoreHtml + '</div>' +
    '</div>';
  }

  function renderCards(data) {
    var container = document.getElementById('cardsContainer');
    var countEl = document.getElementById('cardsCount');
    if (!container) return;

    var cards = Array.isArray(data) ? data : [];
    if (countEl) countEl.textContent = '共 ' + cards.length + ' 張';

    if (cards.length === 0) {
      container.innerHTML = '<div class="loading">查無符合條件的卡片</div>';
      return;
    }

    container.innerHTML = cards.map(renderCard).join('');
  }

  function onContainerClick(e) {
    var btn = e.target;
    if (!btn || !btn.classList || !btn.classList.contains('btn-save-weighted')) return;
    var form = btn.closest('.score-edit');
    if (!form) return;
    var input = form.querySelector('.weighted-input');
    if (!input) return;
    var cardNo = input.dataset.cardNo;
    var adjustment = input.value.trim();
    if (!cardNo) return;
    saveWeightedAdjustment(cardNo, adjustment, btn);
  }

  function saveWeightedAdjustment(cardNo, adjustment, btnEl) {
    if (!API_BASE) {
      showStatus('請設定 config.js 中的 API_BASE_URL', 'error');
      return;
    }
    var origText = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '儲存中...';
    var url = API_BASE + '?action=setWeightedAdjustment&cardNo=' + encodeURIComponent(cardNo) + '&adjustment=' + encodeURIComponent(adjustment);
    fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { status: 'error' }; }
        if (data.status === 'ok') {
          showStatus('已儲存加權分數。', 'ok');
          doSearch();
        } else {
          showStatus('儲存失敗：' + (data.message || '未知錯誤') + '（若為 standalone 腳本，請在 Config.gs 設定 SPREADSHEET_ID）', 'error');
        }
      })
      .catch(function(err) {
        showStatus('儲存失敗：' + (err.message || '請檢查網路'), 'error');
      })
      .finally(function() {
        btnEl.disabled = false;
        btnEl.textContent = origText;
      });
  }

  function setLoading(loading) {
    var btn = document.getElementById('searchBtn');
    var container = document.getElementById('cardsContainer');
    if (btn) btn.disabled = loading;
    if (container && loading) {
      container.innerHTML = '<div class="loading">載入中...</div>';
    }
  }

  function doSearch() {
    if (!API_BASE) {
      showStatus('請設定 config.js 中的 API_BASE_URL', 'error');
      return;
    }
    hideStatus();
    setLoading(true);
    var url = buildQueryUrl(true);
    fetch(url)
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { status: 'error', message: '無法解析回應' }; }
        if (data.status === 'ok') {
          var cards = data.data || [];
          var params = getQueryParams();
          cards = filterCardsClientSide(cards, params);
          renderCards(cards);
          showStatus('共 ' + cards.length + ' 張符合條件。', 'ok');
        } else {
          renderCards([]);
          showStatus('錯誤：' + (data.message || '未知錯誤'), 'error');
        }
      })
      .catch(function(err) {
        renderCards([]);
        showStatus('請求失敗：' + (err.message || '請檢查網路'), 'error');
      })
      .finally(function() { setLoading(false); });
  }

  function init() {
    var searchBtn = document.getElementById('searchBtn');
    var resetBtn = document.getElementById('resetBtn');
    var container = document.getElementById('cardsContainer');
    if (searchBtn) {
      searchBtn.addEventListener('click', function() { doSearch(); });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        var form = document.getElementById('filterForm');
        if (form) form.reset();
      });
    }
    if (container) {
      container.addEventListener('click', onContainerClick);
    }
    doSearch(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
