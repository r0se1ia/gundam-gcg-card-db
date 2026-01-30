/**
 * Gundam TCG Crawler - 試算表與爬蟲設定
 */

var Config = {
  /** 試算表 ID（standalone 腳本必填，從試算表網址取得：/d/XXXXXXXXXX/） */
  SPREADSHEET_ID: '',

  /** 工作表名稱 */
  SHEET_NAME: 'Cards',

  /** 加權分數工作表（負面效果扣分） */
  WEIGHTED_ADJUSTMENTS_SHEET: 'WeightedAdjustments',

  /** 卡片詳細頁基礎 URL */
  BASE_URL: 'https://www.gundam-gcg.com/zh-tw/cards/detail.php',

  /** 每次請求間隔（毫秒），避免對官方伺服器造成壓力 */
  FETCH_DELAY_MS: 1500,

  /** LastUpdated 時區（如 Asia/Taipei） */
  TIMEZONE: 'Asia/Taipei',

  /** LastUpdated 顯示格式（如 yyyy-MM-dd HH:mm:ss） */
  DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',

  /** Cards 工作表欄位標題（順序必須與試算表第一列一致） */
  COLUMNS: [
    'Set',
    'CardNo',
    'Rarity',
    'Name',
    'Level',
    'Cost',
    'Color',
    'CardType',
    'EffectText',
    'Terrain',
    'Traits',
    'Resonance',
    'AP',
    'HP',
    'SourceWork',
    'Acquisition',
    'ImageUrl',
    'Url',
    'LastUpdated'
  ]
};
