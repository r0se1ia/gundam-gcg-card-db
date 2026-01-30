# Gundam GCG 卡片資料庫

Gundam GCG（鋼彈集換式卡牌遊戲）卡片查詢網站，資料來源為 Google Sheet，透過 Google Apps Script 提供 API。

## 專案結構

```
├── apps-script/     # Google Apps Script（爬蟲、API）
├── docs/            # 前端網站（GitHub Pages）
│   ├── index.html
│   ├── config.js    # API URL 設定
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js      # 查詢與渲染
│       └── scoring.js  # UNIT 評分邏輯
└── 卡片評分標準.md
```

## 前端網站（GitHub Pages）

### 本地預覽

1. 用瀏覽器直接開啟 `docs/index.html`，或
2. 使用本地伺服器（如 `npx serve docs`）

### 部署至 GitHub Pages

1. 進入 repo 的 **Settings** > **Pages**
2. **Source** 選 **Deploy from a branch**
3. **Branch** 選 `main`，**Folder** 選 **/docs**
4. 儲存後等待部署完成

### API 設定

若需更換 GAS 部署網址，請編輯 `docs/config.js` 中的 `API_BASE_URL`。

## 功能

- **篩選查詢**：彈數、卡牌類型、Cost、Level、顏色、稀有度、AP、HP、AP+HP 總和、最低評分
- **UNIT 評分**：依 [卡片評分標準.md](卡片評分標準.md) 計算 UNIT 卡體質評分
- **加權分數**：負面效果可於試算表 **WeightedAdjustments** 工作表人工輸入扣分
- **官方連結**：可連結至 gundam-gcg.com 卡片詳情頁

### 加權分數（負面效果扣分）

在 Google 試算表新增工作表 **WeightedAdjustments**，或於前端卡片評分區直接編輯加權分數並點擊「儲存」寫入試算表。

**若為 standalone 腳本**（非從試算表內建立）：請在 `Config.gs` 設定 `SPREADSHEET_ID`，從試算表網址取得（`https://docs.google.com/spreadsheets/d/XXXXXXXXXX/edit` 中的 `XXXXXXXXXX`）。

格式如下：

| CardNo   | Adjustment |
|----------|------------|
| GD01-001 | -1         |
| GD01-002 | -0.5       |

- **CardNo**：卡號（如 GD01-001）
- **Adjustment**：加權分數（負數=扣分，正數=加分）

## 若查詢筆數固定為 100、篩選失效

若前端傳遞 `limit=1000` 與篩選參數後，仍只回傳約 100 筆或篩選無效，可能是 GAS 端 `queryCards` 的邏輯問題。建議修改 `apps-script/SheetWriter.gs`：

- 目前：`readCardsFromSheet` 在收集到 `limit` 筆後就停止，再對這批資料做 level/color 等篩選
- 建議：先以較大筆數（如 10000）讀取符合 setCode/cardType/cost 的資料，完成 level/color 等篩選後，再對結果取前 `limit` 筆回傳
