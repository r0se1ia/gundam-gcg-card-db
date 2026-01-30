/**
 * Gundam TCG Crawler - Web API 進入點
 * doPost: 接收爬取請求，抓取卡片並寫入試算表
 * doGet: 回傳試算表中的卡片資料（JSON）
 */

/**
 * 處理 POST 請求：爬取指定彈數與卡號範圍的卡片並寫入試算表
 * 支援 JSON 或 application/x-www-form-urlencoded（表單提交）
 * @param {Object} e - 事件物件，e.postData.contents 為請求內容
 * @returns {TextOutput|HtmlOutput} JSON 或 HTML 回應
 */
function doPost(e) {
  var result = { status: 'error', insertedCount: 0, failed: [], message: '' };

  try {
    var params = parsePostParams(e);
    var setCode = params.setCode || 'GD01';
    var startNo = parseInt(params.startNo, 10) || 1;
    var endNo = parseInt(params.endNo, 10) || 120;
    var returnHtml = params.returnHtml === 'true' || params.returnHtml === true;

    if (startNo > endNo) {
      result.message = '起始卡號不可大於結束卡號';
      return returnHtml ? createCrawlHtmlResponse(result) : createJsonResponse(result);
    }

    var crawlResult = crawlAndWriteCards(setCode, startNo, endNo);
    result.status = 'ok';
    result.insertedCount = crawlResult.insertedCount;
    result.failed = crawlResult.failed;
    result.message = '完成。成功寫入 ' + crawlResult.insertedCount + ' 張，失敗 ' + crawlResult.failed.length + ' 張。';

    return returnHtml ? createCrawlHtmlResponse(result) : createJsonResponse(result);

  } catch (err) {
    result.message = err.toString();
    Logger.log('doPost error: ' + err);
    return createJsonResponse(result);
  }
}

/**
 * 解析 POST 參數：支援 JSON 或 form-urlencoded
 * 表單送出為 setCode=GD01&startNo=1&endNo=10，必須先解析 form，勿用 JSON.parse
 */
function parsePostParams(e) {
  if (!e || !e.postData) return {};
  var contents = (e.postData.contents || '').trim();
  if (!contents) return {};

  // 1. 若以 { 或 [ 開頭，才嘗試 JSON
  if (contents.charAt(0) === '{' || contents.charAt(0) === '[') {
    try { return JSON.parse(contents); } catch (x) { return {}; }
  }

  // 2. 其餘一律當 form-urlencoded 解析（含 setCode=GD01&startNo=1 等）
  var params = {};
  contents.split('&').forEach(function(pair) {
    var idx = pair.indexOf('=');
    if (idx >= 0) {
      var key = decodeURIComponent(pair.substring(0, idx).replace(/\+/g, ' '));
      var val = decodeURIComponent(pair.substring(idx + 1).replace(/\+/g, ' '));
      params[key] = val;
    }
  });
  return params;
}

/**
 * 建立爬取結果 HTML 頁面（供表單 POST 使用）
 */
function createCrawlHtmlResponse(result) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  html += '<title>爬取結果 - Gundam TCG</title>';
  html += '<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem;}';
  html += '.ok{color:#059669;}.error{color:#dc2626;}a{color:#2563eb;}</style></head><body>';
  if (result.status === 'ok') {
    html += '<h2 class="ok">爬取完成，已寫入試算表</h2>';
    html += '<p>' + result.message + '</p>';
    if (result.failed && result.failed.length > 0) {
      html += '<p>失敗卡號：' + result.failed.join(', ') + '</p>';
    }
  } else {
    html += '<h2 class="error">錯誤</h2><p>' + (result.message || '未知錯誤') + '</p>';
  }
  html += '<p><a href="javascript:window.close()">關閉視窗</a></p>';
  html += '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('爬取結果');
}

/**
 * 處理 GET 請求
 * - action=crawl：爬取卡片並寫入試算表，回傳 HTML 結果頁（供後台表單提交）
 * - 預設：回傳試算表中的卡片資料（JSON）
 * 可選參數：setCode、limit、action、startNo、endNo
 * @param {Object} e - 事件物件，e.parameter 為查詢參數
 * @returns {TextOutput|HtmlOutput}
 */
function doGet(e) {
  var params = e.parameter || {};

  // 內嵌後台：?page=admin 時回傳後台頁面（注入正確 URL，避免參數遺失）
  if (params.page === 'admin') {
    var template = HtmlService.createTemplateFromFile('Admin');
    template.gasUrl = ScriptApp.getService().getUrl();
    return template.evaluate().setTitle('Gundam TCG 爬蟲後台');
  }

  // 爬取：action=crawl 時執行爬取並回傳 HTML 或 JSON
  if (params.action === 'crawl') {
    return handleCrawlAction(params);
  }

  // 多條件查詢：action=query 時依條件篩選（供前端網頁查詢）
  if (params.action === 'query') {
    return handleQueryAction(params);
  }

  // 設定加權分數：action=setWeightedAdjustment
  if (params.action === 'setWeightedAdjustment') {
    return handleSetWeightedAdjustment(params);
  }

  // 預設：回傳試算表資料（JSON API），支援 setCode、limit
  var result = { status: 'error', data: [], message: '' };
  try {
    var setCode = params.setCode || '';
    var limit = parseInt(params.limit, 10) || 1000;
    var cards = readCardsFromSheet(setCode, limit);
    mergeWeightedAdjustmentsIntoCards(cards);
    result.status = 'ok';
    result.data = cards;
    result.message = '共 ' + cards.length + ' 筆資料';
  } catch (err) {
    result.message = err.toString();
    Logger.log('doGet error: ' + err);
  }
  return createJsonResponse(result);
}

/**
 * 處理 action=query：多條件查詢卡片（供前端網頁查詢 Google Sheet）
 * @param {Object} params - 查詢參數
 * @returns {TextOutput} JSON 回應
 */
function handleQueryAction(params) {
  var result = { status: 'error', data: [], count: 0, message: '' };
  try {
    var getVal = function(v) { return Array.isArray(v) ? v[0] : v; };
    var queryParams = {};
    if (params.setCode) queryParams.setCode = getVal(params.setCode);
    if (params.cardType) queryParams.cardType = getVal(params.cardType);
    if (params.cost !== undefined && params.cost !== '') queryParams.cost = getVal(params.cost);
    if (params.level !== undefined && params.level !== '') queryParams.level = getVal(params.level);
    if (params.color) queryParams.color = getVal(params.color);
    if (params.rarity) queryParams.rarity = getVal(params.rarity);
    if (params.apHpTotal !== undefined && params.apHpTotal !== '') queryParams.apHpTotal = getVal(params.apHpTotal);
    if (params.ap !== undefined && params.ap !== '') queryParams.ap = getVal(params.ap);
    if (params.hp !== undefined && params.hp !== '') queryParams.hp = getVal(params.hp);
    if (params.limit) queryParams.limit = getVal(params.limit);

    var q = queryCards(queryParams);
    result.status = 'ok';
    result.data = q.data;
    result.count = q.count;
    result.message = '共 ' + q.count + ' 筆符合條件';
  } catch (err) {
    result.message = err.toString();
    Logger.log('handleQueryAction error: ' + err);
  }
  return createJsonResponse(result);
}

/**
 * 處理 action=setWeightedAdjustment：新增或更新加權分數至試算表
 * @param {Object} params - cardNo, adjustment
 * @returns {TextOutput} JSON 回應
 */
function handleSetWeightedAdjustment(params) {
  var getVal = function(v) { return Array.isArray(v) ? v[0] : v; };
  var cardNo = getVal(params.cardNo) || '';
  var adjustment = getVal(params.adjustment);
  var result = { status: 'error', message: '' };
  try {
    if (!cardNo) {
      result.message = '缺少 cardNo';
      return createJsonResponse(result);
    }
    updateWeightedAdjustment(cardNo, adjustment);
    result.status = 'ok';
    result.message = '已儲存加權分數';
  } catch (err) {
    result.message = err.toString();
    result.status = 'error';
    Logger.log('handleSetWeightedAdjustment error: ' + err);
  }
  return createJsonResponse(result);
}

/**
 * 處理 action=crawl：爬取並回傳 HTML 或 JSON
 * @param {Object} params - setCode, startNo, endNo, format(可選 json)
 * @returns {HtmlOutput|TextOutput}
 */
function handleCrawlAction(params) {
  var setCode = params.setCode || 'GD01';
  var startNoVal = params.startNo;
  var endNoVal = params.endNo;
  if (Array.isArray(startNoVal)) { startNoVal = startNoVal[0]; }
  if (Array.isArray(endNoVal)) { endNoVal = endNoVal[0]; }
  var startNo = parseInt(startNoVal, 10) || 1;
  var endNo = parseInt(endNoVal, 10) || 120;
  var backUrl = params.backUrl || '';
  var wantJson = params.format === 'json' || params.format === 'JSON';

  Logger.log('handleCrawlAction params: setCode=' + setCode + ', startNo=' + startNo + ', endNo=' + endNo);

  var result = { status: 'error', insertedCount: 0, failed: [], message: '' };

  try {
    if (startNo > endNo) {
      result.message = '起始卡號不可大於結束卡號';
    } else {
      var crawlResult = crawlAndWriteCards(setCode, startNo, endNo);
      result.status = 'ok';
      result.insertedCount = crawlResult.insertedCount;
      result.failed = crawlResult.failed;
      result.message = '完成。成功寫入 ' + crawlResult.insertedCount + ' 張，失敗 ' + crawlResult.failed.length + ' 張。';
    }
  } catch (err) {
    result.message = err.toString();
    Logger.log('handleCrawlAction error: ' + err);
  }

  if (wantJson) {
    return createJsonResponse(result);
  }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  html += '<title>爬取結果 - Gundam TCG</title>';
  html += '<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem;}';
  html += '.ok{color:#059669;}.error{color:#dc2626;}a{color:#2563eb;}pre{background:#f3f4f6;padding:1rem;overflow:auto;}</style></head><body>';
  if (result.status === 'ok') {
    html += '<h2 class="ok">爬取完成</h2><p>' + result.message + '</p>';
    if (result.failed.length > 0) html += '<p>失敗卡號：<pre>' + result.failed.join(', ') + '</pre></p>';
  } else {
    html += '<p class="error">' + result.message + '</p>';
  }
  if (backUrl) {
    var safeUrl = String(backUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    html += '<p><a href="' + safeUrl + '">← 返回後台</a></p>';
  }
  html += '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('爬取結果');
}

/**
 * 建立 JSON 回應，並設定 CORS 標頭
 * @param {Object} obj - 要序列化的物件
 * @returns {TextOutput}
 */
function createJsonResponse(obj) {
  var output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
