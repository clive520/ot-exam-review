# 📚 國考衝刺複習（職能治療師）

把考選部職能治療師國考考古題 PDF 轉成結構化題庫，提供考生 Web 複習工具。
架構可擴充：同一套管線可套用到其他國考（物理治療師、呼吸治療師…）。

## 🌐 網站功能

- 科目選擇（多選）、隨機出題 / 依序練習 / 錯題重練
- 作答即時核對，顯示答案內容與官方更正備註
- 圖片題顯示（含 PDF 切片合併還原）
- 錯題本、各科弱點統計
- 支援「Ｃ、Ｄ都給分」等多選答案
- Google 登入後作答紀錄雲端同步（Firebase，換裝置不遺失）

## 🗂 資料

| 路徑 | 說明 |
|---|---|
| `data/questions.json` | 題庫（**2,880 題**，110–115 年度 36 科，由 SQLite 匯出） |
| `data/meta.json` | 考試類型與科目清單 |
| `csv/` | 6 科最終 CSV（人工可讀、可追溯） |
| `images/` | 圖片題（`<科目>/<題號>.png`） |

## ⚙️ 管線腳本（scripts/）

1. `01_extract_text.js` PDF → 文字
2. `02_build_csv.js` 文字 → 基礎 CSV（題目+選項+答案鍵）
3. `03_clean_csv.js` 機械清洗 + 術語修正（每科 term_fixes.json）
4. `04_extract_images.js` 頁面渲染 + 圖形偵測
5. `05_merge_images.js` 圖片欄位合併進 CSV
6. `06_merge_figures.js` 相鄰切片合併還原
7. `07_import_db.js` CSV → SQLite（questions.db）
8. `08_export_json.js` SQLite → Web 用的 JSON + 圖片

## 🔥 Firebase 設定（雲端同步）

1. [console.firebase.google.com](https://console.firebase.google.com) 建立專案
2. Authentication → 啟用 **Google 登入**
3. Firestore → 建立資料庫
4. 把 Web 應用程式的設定填入 `firebase-config.js`
5. 將網站網域加入 Authentication → Authorized domains
6. 把 `firestore.rules` 內容貼到 Firestore → Rules

## 📦 部署（GitHub Pages）

1. 建立 GitHub repo（公開），推上這個資料夾的內容
2. Settings → Pages → 選 branch 的根目錄 → 儲存
3. 完成後網址即為 `https://<帳號>.github.io/<repo名>/`

## 📝 資料來源

- 考選部全球資訊網公開之考古題與標準答案（政府公開資料）
- 110–115 年專門職業及技術人員高等考試職能治療師（6 年度 × 6 科 × 80 題，含官方更正答案）
