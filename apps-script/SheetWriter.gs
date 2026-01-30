/**
 * Gundam TCG Crawler - 試算表讀寫邏輯
 * 批次寫入卡片資料、刪除重複、讀取資料
 */

/**
 * 取得試算表（standalone 腳本需設定 Config.SPREADSHEET_ID）
 * @returns {Spreadsheet}
 */
function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  if (Config.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(Config.SPREADSHEET_ID);
  }
  throw new Error('無法取得試算表。若為 standalone 腳本，請在 Config.gs 設定 SPREADSHEET_ID（從試算表網址 /d/XXXXXXXXXX/ 取得）');
}

/**
 * 將卡片陣列批次寫入試算表
 * 會先刪除同一 Set + CardNo 的舊資料，再批次寫入
 * @param {Array<Object>} cards - 卡片物件陣列
 * @returns {number} 實際寫入的筆數
 */
function writeCardsToSheet(cards) {
  if (!cards || cards.length === 0) {
    return 0;
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(Config.SHEET_NAME);

  if (!sheet) {
    throw new Error('找不到工作表 "' + Config.SHEET_NAME + '"，請先建立並設定欄位標題。');
  }

  // 確保第一列為標題
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(Config.COLUMNS);
    lastRow = 1;
  }

  // 取得現有資料，找出要刪除的列（同一 Set + CardNo）
  // getRange(row, column, numRows, numColumns)：從第 2 列起取 (lastRow-1) 列
  var existingData = [];
  if (lastRow >= 2) {
    var numDataRows = lastRow - 1; // 扣除標題列
    var dataRange = sheet.getRange(2, 1, numDataRows, Config.COLUMNS.length);
    existingData = dataRange.getValues();
  }

  var setColIdx = Config.COLUMNS.indexOf('Set');
  var cardNoColIdx = Config.COLUMNS.indexOf('CardNo');

  if (setColIdx === -1 || cardNoColIdx === -1) {
    throw new Error('Config.COLUMNS 中缺少 Set 或 CardNo');
  }

  var rowsToDelete = [];
  var newCardKeys = {};
  for (var i = 0; i < cards.length; i++) {
    newCardKeys[cards[i].Set + '|' + cards[i].CardNo] = true;
  }

  for (var r = existingData.length - 1; r >= 0; r--) {
    var key = existingData[r][setColIdx] + '|' + existingData[r][cardNoColIdx];
    if (newCardKeys[key]) {
      rowsToDelete.push(r + 2); // 轉為 1-based 且含標題列
    }
  }

  // 從下往上刪除，避免列號錯位
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var d = 0; d < rowsToDelete.length; d++) {
    sheet.deleteRow(rowsToDelete[d]);
  }

  // 將卡片轉為二維陣列，依 Config.COLUMNS 順序
  var rows = [];
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c];
    var row = [];
    for (var col = 0; col < Config.COLUMNS.length; col++) {
      var colName = Config.COLUMNS[col];
      row.push(card[colName] !== undefined ? String(card[colName]) : '');
    }
    rows.push(row);
  }

  // 批次寫入
  // getRange(row, column, numRows, numColumns)：第三參數是「列數」不是「結束列號」
  if (rows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, Config.COLUMNS.length).setValues(rows);
  }

  return rows.length;
}

/**
 * 從試算表讀取卡片資料
 * @param {string} setCode - 篩選彈數，空字串則不篩選
 * @param {number} limit - 筆數上限
 * @param {string} cardType - 篩選卡牌類型（如 UNIT），空字串則不篩選
 * @param {string|number} cost - 篩選 COST，空則不篩選
 * @returns {Array<Object>} 卡片物件陣列
 */
function readCardsFromSheet(setCode, limit, cardType, cost) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(Config.SHEET_NAME);

  if (!sheet) {
    return [];
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var colCount = Math.max(Config.COLUMNS.length, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow, colCount).getValues();

  var setColIdx = headers.indexOf('Set');
  var cardTypeColIdx = headers.indexOf('CardType');
  var costColIdx = headers.indexOf('Cost');
  if (setColIdx === -1) setColIdx = 0;

  var cards = [];
  for (var i = 0; i < data.length && cards.length < limit; i++) {
    if (setCode && String(data[i][setColIdx] || '') !== setCode) continue;
    if (cardType && cardTypeColIdx >= 0) {
      var ct = String(data[i][cardTypeColIdx] || '').toUpperCase();
      if (ct !== String(cardType).toUpperCase()) continue;
    }
    if (cost !== undefined && cost !== '' && costColIdx >= 0) {
      var c = parseInt(data[i][costColIdx], 10);
      var costVal = typeof cost === 'number' ? cost : parseInt(cost, 10);
      if (c !== costVal) continue;
    }

    var card = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      card[headers[j]] = val !== undefined && val !== null ? String(val) : '';
    }
    cards.push(card);
  }

  return cards;
}

/**
 * 讀取加權分數工作表，回傳 { CardNo: adjustment } 對照表
 * 工作表格式：第 1 列標題（CardNo, Adjustment），第 2 列起為資料
 * @returns {Object} { 'GD01-001': -1, ... }
 */
function readWeightedAdjustments() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(Config.WEIGHTED_ADJUSTMENTS_SHEET);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  var headers = sheet.getRange(1, 1, 1, 2).getValues()[0];
  var cardNoIdx = headers.indexOf('CardNo');
  var adjIdx = headers.indexOf('Adjustment');
  if (cardNoIdx < 0 || adjIdx < 0) return {};

  var data = sheet.getRange(2, 1, lastRow, 2).getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var cardNo = String(data[i][cardNoIdx] || '').trim();
    var adj = parseFloat(data[i][adjIdx]);
    if (cardNo && !isNaN(adj)) map[cardNo] = adj;
  }
  return map;
}

/**
 * 新增或更新加權分數
 * 若工作表不存在則建立，若 CardNo 已存在則更新，否則新增
 * @param {string} cardNo - 卡號（如 GD01-001）
 * @param {number} adjustment - 加權分數
 * @returns {boolean} 是否成功
 */
function updateWeightedAdjustment(cardNo, adjustment) {
  cardNo = String(cardNo || '').trim();
  var adj = parseFloat(adjustment);
  if (!cardNo) return false;

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(Config.WEIGHTED_ADJUSTMENTS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(Config.WEIGHTED_ADJUSTMENTS_SHEET);
    sheet.appendRow(['CardNo', 'Adjustment']);
  }

  var lastRow = sheet.getLastRow();
  var cardNoCol = 1;
  var adjCol = 2;

  if (lastRow < 2) {
    sheet.appendRow([cardNo, isNaN(adj) ? 0 : adj]);
    return true;
  }

  var data = sheet.getRange(2, 1, lastRow, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === cardNo) {
      sheet.getRange(i + 2, adjCol).setValue(isNaN(adj) ? 0 : adj);
      return true;
    }
  }

  sheet.appendRow([cardNo, isNaN(adj) ? 0 : adj]);
  return true;
}

/**
 * 將加權分數合併至卡片陣列
 * @param {Array<Object>} cards - 卡片陣列
 * @returns {Array<Object>} 含 WeightedAdjustment 的卡片陣列
 */
function mergeWeightedAdjustmentsIntoCards(cards) {
  if (!cards || cards.length === 0) return cards;
  var map = readWeightedAdjustments();
  for (var i = 0; i < cards.length; i++) {
    var cardNo = (cards[i].CardNo || '').trim();
    cards[i].WeightedAdjustment = cardNo && map[cardNo] !== undefined ? map[cardNo] : 0;
  }
  return cards;
}

/**
 * 多條件查詢卡片（供前端網頁查詢 Google Sheet）
 * 先以較大筆數讀取符合 setCode/cardType/cost 的資料，完成 level/color 等篩選後，再取前 limit 筆回傳
 * @param {Object} params - 查詢條件（可選）
 *   - setCode: 彈數（如 GD01）
 *   - cardType: 卡牌類型（如 UNIT）
 *   - cost: COST 數值
 *   - level: 等級
 *   - color: 顏色
 *   - rarity: 稀有度
 *   - apHpTotal: AP+HP 總和（如 6、7）
 *   - ap: AP 數值
 *   - hp: HP 數值
 *   - limit: 筆數上限（預設 1000）
 * @returns {Object} { data, count }
 */
function queryCards(params) {
  params = params || {};
  var limit = parseInt(params.limit, 10) || 1000;
  var hasPostFilters = (
    (params.level !== undefined && params.level !== '') ||
    (params.color !== undefined && params.color !== '') ||
    (params.rarity !== undefined && params.rarity !== '') ||
    (params.ap !== undefined && params.ap !== '') ||
    (params.hp !== undefined && params.hp !== '') ||
    (params.apHpTotal !== undefined && params.apHpTotal !== '')
  );
  // 若有 level/color/rarity/ap/hp/apHpTotal 篩選，先讀取較多資料再篩選，避免只取前 limit 筆導致篩選失效
  var readLimit = hasPostFilters ? 10000 : limit;

  var cards = readCardsFromSheet(
    params.setCode || '',
    readLimit,
    params.cardType || '',
    params.cost !== undefined && params.cost !== '' ? params.cost : undefined
  );

  // 篩選：level, color, rarity, apHpTotal, ap, hp（Level 比對時 trim 並統一為字串）
  var filtered = [];
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    if (params.level !== undefined && params.level !== '') {
      var cardLv = String(card.Level || '').trim();
      var paramLv = String(params.level).trim();
      if (cardLv !== paramLv) continue;
    }
    if (params.color !== undefined && params.color !== '' && String(card.Color || '').trim().toUpperCase() !== String(params.color).trim().toUpperCase()) continue;
    if (params.rarity !== undefined && params.rarity !== '' && String(card.Rarity || '').trim().toUpperCase() !== String(params.rarity).trim().toUpperCase()) continue;
    if (params.ap !== undefined && params.ap !== '' && parseInt(card.AP, 10) !== parseInt(params.ap, 10)) continue;
    if (params.hp !== undefined && params.hp !== '' && parseInt(card.HP, 10) !== parseInt(params.hp, 10)) continue;
    if (params.apHpTotal !== undefined && params.apHpTotal !== '') {
      var ap = parseInt(card.AP, 10);
      var hp = parseInt(card.HP, 10);
      var total = (!isNaN(ap) ? ap : 0) + (!isNaN(hp) ? hp : 0);
      if (total !== parseInt(params.apHpTotal, 10)) continue;
    }
    filtered.push(card);
  }

  // 取前 limit 筆回傳，合併加權分數
  var result = filtered.length > limit ? filtered.slice(0, limit) : filtered;
  mergeWeightedAdjustmentsIntoCards(result);
  return { data: result, count: result.length };
}
