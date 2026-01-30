/**
 * Gundam TCG Crawler - 測試用函數
 * 在 GAS 編輯器中選取下方任一函數，按「執行」即可測試
 *
 * 重要：請先從 Google 試算表開啟 Apps Script（擴充功能 > Apps Script），
 * 這樣 getActiveSpreadsheet() 才會指向正確的試算表。
 */

/**
 * 測試爬取 3 張卡片（GD01-001～003）
 * 驗證多筆抓取是否正常
 */
function testCrawlMultipleCards() {
  Logger.log('開始測試：爬取 GD01-001～003');
  var result = crawlAndWriteCards('GD01', 1, 3);
  Logger.log('結果：成功 ' + result.insertedCount + ' 張，失敗 ' + result.failed.length + ' 張');
  Logger.log('失敗卡號：' + result.failed.join(', '));
  return result;
}

/**
 * 快速測試：只爬取 1 張卡片（GD01-001）
 * 執行時間短，適合驗證爬蟲與寫入是否正常
 */
function testCrawlSingleCard() {
  Logger.log('開始測試：爬取 GD01-001');
  var result = crawlAndWriteCards('GD01', 1, 1);
  Logger.log('結果：' + JSON.stringify(result));
  return result;
}

/**
 * 測試讀取試算表：從試算表讀取最多 5 筆卡片
 */
function testReadSheet() {
  Logger.log('開始測試：讀取試算表');
  var cards = readCardsFromSheet('', 5);
  Logger.log('讀取到 ' + cards.length + ' 筆');
  if (cards.length > 0) {
    Logger.log('第一筆：' + JSON.stringify(cards[0]));
  }
  return cards;
}

/**
 * 測試單張卡片抓取與解析（不寫入試算表）
 * 驗證 fetchAndParseCard 是否正常
 */
function testFetchOneCard() {
  Logger.log('開始測試：抓取 GD01-001（不寫入）');
  var card = fetchAndParseCard('GD01', 'GD01-001');
  if (card) {
    Logger.log('成功：' + JSON.stringify(card, null, 2));
  } else {
    Logger.log('失敗：無法解析');
  }
  return card;
}

/**
 * 模擬 doGet：測試讀取 API 邏輯
 */
function testDoGetLogic() {
  var params = { setCode: '', limit: 10 };
  var cards = readCardsFromSheet(params.setCode || '', params.limit || 1000);
  var result = { status: 'ok', data: cards, message: '共 ' + cards.length + ' 筆資料' };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * 測試多條件查詢：CardType=UNIT、Cost=3
 */
function testQueryCards() {
  Logger.log('開始測試：多條件查詢 CardType=UNIT, Cost=3');
  var result = queryCards({ cardType: 'UNIT', cost: 3, limit: 100 });
  Logger.log('符合條件：' + result.count + ' 筆');
  return result;
}
