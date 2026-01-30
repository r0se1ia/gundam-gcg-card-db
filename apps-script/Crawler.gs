/**
 * Gundam TCG Crawler - 抓取與解析卡片詳細頁
 * 使用 UrlFetchApp 抓取 gundam-gcg.com 卡片頁面，並以正則表達式解析 HTML
 */

/**
 * 爬取指定彈數與卡號範圍的卡片，並寫入試算表
 * @param {string} setCode - 彈數代碼，如 GD01
 * @param {number} startNo - 起始卡號
 * @param {number} endNo - 結束卡號
 * @returns {Object} { insertedCount, failed }
 */
function crawlAndWriteCards(setCode, startNo, endNo) {
  var cards = [];
  var failed = [];

  Logger.log('crawlAndWriteCards: setCode=' + setCode + ', startNo=' + startNo + ', endNo=' + endNo + ', total=' + (endNo - startNo + 1));

  for (var i = startNo; i <= endNo; i++) {
    var cardNo = setCode + '-' + padZero(i, 3);
    var card = fetchAndParseCard(setCode, cardNo);

    if (card) {
      cards.push(card);
    } else {
      failed.push(cardNo);
    }

    // 避免對官方伺服器造成壓力
    if (i < endNo) {
      Utilities.sleep(Config.FETCH_DELAY_MS);
    }
  }

  var insertedCount = writeCardsToSheet(cards);
  return { insertedCount: insertedCount, failed: failed };
}

/**
 * 抓取單張卡片詳細頁並解析
 * @param {string} setCode - 彈數代碼
 * @param {string} cardNo - 完整卡號，如 GD01-001
 * @returns {Object|null} 解析後的卡片物件，失敗則回傳 null
 */
function fetchAndParseCard(setCode, cardNo) {
  var url = Config.BASE_URL + '?detailSearch=' + encodeURIComponent(cardNo);

  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
      }
    });

    if (response.getResponseCode() !== 200) {
      return null;
    }

    var html = response.getContentText('UTF-8');
    return parseCardHtml(html, setCode, cardNo, url);

  } catch (e) {
    Logger.log('fetchAndParseCard error for ' + cardNo + ': ' + e);
    return null;
  }
}

/**
 * 從 dataBox 結構提取純文字：<dt class="dataTit">標籤</dt><dd class="dataTxt">內容</dd>
 * 只取 dd 內文字，移除所有 HTML 標籤
 * @param {string} html - 頁面 HTML
 * @param {string} label - 標籤文字，如 地形、特徵、共鳴
 * @returns {string} 純文字內容
 */
function extractDataBoxValue(html, label) {
  var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var regex = new RegExp('<dt[^>]*>' + escaped + '</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>', 'i');
  var match = html.match(regex);
  if (match) {
    return decodeHtmlEntities(stripHtml(match[1]).trim());
  }
  return '';
}

/**
 * 解析卡片詳細頁 HTML，抽出各欄位
 * 優先從 dataBox 結構（dt/dd）提取純文字，避免 HTML 標籤寫入試算表
 * @param {string} html - 頁面 HTML
 * @param {string} setCode - 彈數代碼
 * @param {string} cardNo - 完整卡號
 * @param {string} pageUrl - 頁面 URL
 * @returns {Object|null} 卡片物件，若無法解析則回傳 null
 */
function parseCardHtml(html, setCode, cardNo, pageUrl) {
  // 檢查是否為有效卡片頁（有卡號或名稱等關鍵內容）
  if (!html || html.length < 100) {
    return null;
  }
  // 卡號可能以不同格式出現（如 GD01-001 或 GD01&#45;001）
  var cardNoEscaped = cardNo.replace(/-/g, '&#45;');
  if (html.indexOf(cardNo) === -1 && html.indexOf(cardNoEscaped) === -1) {
    return null;
  }

  var card = {
    Set: setCode,
    CardNo: cardNo,
    Rarity: '',
    Name: '',
    Level: '',
    Cost: '',
    Color: '',
    CardType: '',
    EffectText: '',
    Terrain: '',
    Traits: '',
    Resonance: '',
    AP: '',
    HP: '',
    SourceWork: '',
    Acquisition: '',
    ImageUrl: '',
    Url: pageUrl,
    LastUpdated: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss')
  };

  // 稀有度：LR, SR, R, U, C 等
  var rarityMatch = html.match(/>\s*(LR|SR|R|U|C|SP|P)\s*</i);
  if (rarityMatch) {
    card.Rarity = stripHtml(rarityMatch[1].trim());
  }

  // 卡圖 URL：img src 中的 .webp
  var imgMatch = html.match(/src=["']([^"']*\/cards\/card\/[^"']+\.webp[^"']*)["']/i) ||
                 html.match(/images\/cards\/card\/([A-Z0-9\-]+\.webp[^"'\s]*)/i);
  if (imgMatch) {
    var imgPath = imgMatch[1].split('?')[0];
    if (imgPath.indexOf('http') === 0) {
      card.ImageUrl = imgPath;
    } else if (imgPath.indexOf('/') === 0 || imgPath.indexOf('.') === 0) {
      var normalized = imgPath.replace(/^\.\.\/\.\.\//, '/').replace(/^\//, '');
      card.ImageUrl = 'https://www.gundam-gcg.com/' + normalized;
    } else {
      card.ImageUrl = 'https://www.gundam-gcg.com/jp/images/cards/card/' + imgPath;
    }
  }
  if (!card.ImageUrl && cardNo) {
    card.ImageUrl = 'https://www.gundam-gcg.com/jp/images/cards/card/' + cardNo + '.webp';
  }

  // 卡片名稱：h1.cardName
  var nameMatch = html.match(/<h1[^>]*class="[^"]*cardName[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                  html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (nameMatch) {
    card.Name = decodeHtmlEntities(stripHtml(nameMatch[1]).trim());
  }

  // 從 dataBox 結構提取：Lv., COST, 顏色, 卡牌類型, 地形, 特徵, 共鳴, AP, HP, 來源作品, 獲取方式
  card.Level = extractDataBoxValue(html, 'Lv.') || extractDataBoxValue(html, 'Lv');
  card.Cost = extractDataBoxValue(html, 'COST');
  card.Color = extractDataBoxValue(html, '顏色');
  card.CardType = extractDataBoxValue(html, '卡牌類型');
  card.Terrain = extractDataBoxValue(html, '地形');
  card.Traits = extractDataBoxValue(html, '特徵');
  card.Resonance = extractDataBoxValue(html, '共鳴');
  card.AP = extractDataBoxValue(html, 'AP');
  card.HP = extractDataBoxValue(html, 'HP');
  card.SourceWork = extractDataBoxValue(html, '來源作品');
  card.Acquisition = extractDataBoxValue(html, '獲取方式');

  // 若 dataBox 無結果，才用舊的 regex 備援
  if (!card.Level || !card.Cost) {
    var statsMatch = html.match(/Lv\.\s*(\d+)\s*COST\s*(\d+)\s*顏色\s*(\w+)\s*卡牌類型\s*(\w+)/i);
    if (statsMatch) {
      if (!card.Level) card.Level = statsMatch[1];
      if (!card.Cost) card.Cost = statsMatch[2];
      if (!card.Color) card.Color = statsMatch[3];
      if (!card.CardType) card.CardType = statsMatch[4];
    }
  }
  if (!card.AP || !card.HP) {
    var apHpMatch = html.match(/AP\s*(\d+)\s*HP\s*(\d+)/i);
    if (apHpMatch) {
      if (!card.AP) card.AP = apHpMatch[1];
      if (!card.HP) card.HP = apHpMatch[2];
    }
  }

  // 效果文字：從 cardDataRow overview 的 div.dataTxt.isRegular 提取
  var effectMatch = html.match(/<div class="dataTxt isRegular">([\s\S]*?)<\/div>/i);
  if (effectMatch) {
    card.EffectText = decodeHtmlEntities(stripHtml(effectMatch[1]).trim());
  }
  if (!card.EffectText) {
    var fallback = html.match(/卡牌類型\s*\w+\s*([\s\S]+?)(?:地形|特徵)/i);
    if (fallback) {
      card.EffectText = decodeHtmlEntities(stripHtml(fallback[1]).trim());
    }
  }

  // 若名稱為空，嘗試從其他位置取得
  if (!card.Name) {
    var altNameMatch = html.match(/#\s*([^<\n]+)/);
    if (altNameMatch) {
      card.Name = decodeHtmlEntities(stripHtml(altNameMatch[1]).trim());
    }
  }

  return card;
}

/**
 * 將數字補零至指定位數
 * @param {number} num - 數字
 * @param {number} length - 目標長度
 * @returns {string}
 */
function padZero(num, length) {
  var s = String(num);
  while (s.length < length) {
    s = '0' + s;
  }
  return s;
}

/**
 * 移除 HTML 標籤
 * @param {string} str - 含 HTML 的字串
 * @returns {string}
 */
function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 解碼 HTML 實體
 * @param {string} str - 含 HTML 實體的字串
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
