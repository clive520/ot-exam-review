# SOP：考選部試題 PDF → CSV → SQLite → Web 題庫（v2）

> 目的：將「考選部專技高考／檢定」試題 PDF（含答案、更正答案）轉成結構化 CSV，
> 匯入 SQLite 題庫、匯出 Web 用 JSON，並部署為複習網站。
> 已實測：職能治療師 110–115 年度共 36 科 2,880 題全數通過。

---

## 1. 適用格式（考選部常見排版）

| 項目 | 格式 |
|---|---|
| 試題 PDF | 題目行「數字.」開頭（例 `8.圖中紅色箭頭...`）；選項行 `A.`~`D.`；可跨行折行 |
| 答案 PDF（ANS） | 「答案ＡＢＣＤ...」**全形字母**，每列 20 題，共 4 列 80 題 |
| 更正答案 PDF（MOD） | 同 ANS 格式，更正題以 **＃** 佔位，備註如「第77題答Ｃ、Ｄ給分」「第12題答Ｂ或Ｃ或BC者均給分」「第33題一律給分」 |
| 科目編碼 | 110–113 年用 11~66；114 年起用 0105/0801~0805（run_year.ps1 自動對應） |

> ⚠ 格式不同（題號跳號、答案鍵樣式）需先人工檢視 exam.txt 再調整解析規則。

## 2. 環境

- Node.js ≥ 22（本機 v24）
- 套件：`pdf_sop/tools`（pdf-parse@1.1.1）、`pdf_render`（**pdfjs-dist@4.10.38 legacy + @napi-rs/canvas**，渲染用，v4 修復舊版崩潰）

## 3. 腳本清單（pdf_sop/scripts/）

| 腳本 | 功能 |
|---|---|
| `01_extract_text.js` | PDF → 文字（每行加行號） |
| `02_build_csv.js` | 文字 → 基礎 CSV（**題號連續遞增才視為新題**，避免「4.5歲」誤判；80 題 = 80 答案驗證） |
| `03_clean_csv.js` | 機械清洗（全域規則）+ 術語修正（各科 term_fixes.json，第 4 參數） |
| `04_extract_images.js` | 頁面渲染（pdfjs v4）→ 圖形偵測 → 裁切 → 題號對應（含跨頁） |
| `05_merge_images.js` | image_map → CSV 加「圖片檔案」欄 |
| `06_apply_mod.js` | 套用更正答案（＃佔位、或格式、一律給分）→ 加「原始答案」「更正備註」欄 |
| `06_merge_figures.js` | 相鄰圖形區塊合併（PDF 切片還原） |
| `07_import_db.js` | 最終 CSV → SQLite（`db/questions.db`，科目唯一鍵 = 年度+代碼） |
| `08_export_json.js` | SQLite → `app/data/questions.json + meta.json` + 複製圖片 |
| `run_year.ps1` | 單一年度 6 科批次（01→02→06→03） |

## 4. 全域機械規則（03 內建，所有科目通用）

- 上下標拆字：HCO₃⁻/NH₄⁺/H⁺、`Ca 2+`→Ca²⁺、`T 3`→T₃、`10 1`→10¹、`2 nd`→2nd
- CJK 相容異體字正規化（忽略→忽略、量→量、列→列…30+ 字）
- 全形英文字母/數字→半形（Ｍajor→Major）
- 中英/中數空格、全形標點前後空格、中文間空格、括號前空格
- 連字號拆分（DSM- 5→DSM-5、self- concept→self-concept）
- 圈號空格（③ Person→③Person）、異體斜線（20∕50→20/50）、L型統一

## 5. 術語修正工作流（每科 term_fixes.json）

```json
[
  ["occupatioanl", "occupational", "錯字修正", "拼字錯誤(3處)"],
  ["儲物症", "囤積症", "譯名修正", "台灣 DSM-5 慣用:囤積症"]
]
```
- 查證流程：子代理逐科稽核（拼字/官方名稱/譯名/PDF 缺陷）→ 彙整確認清單 → 使用者確認 → 寫入設定檔 → 重跑 03。
- 所有變更記錄在「修正紀錄.csv」（題號,欄位,原文,修正後,類型,說明），可追溯、可復原。

## 6. 資料庫 Schema（SQLite）

```sql
exam_types(id, code, name)                -- 'OT' 職能治療師（可擴充其他國考）
subjects(id, exam_type_id, code, name, year, UNIQUE(exam_type_id, year, code))
questions(id, subject_id, qno, stem, opt_a..d,
          answer_original, answer_final, answer_text, correction_note, image_files)
```

## 7. 部署（GitHub Pages + Actions）

1. `app/`（index.html, app.js, style.css, data/, images/）→ repo 根目錄
2. Pages 來源設為 **GitHub Actions**（`.github/workflows/pages.yml`，upload-pages-artifact + deploy-pages）
3. push 即自動部署：https://<帳號>.github.io/<repo>/

## 8. Firebase 整合（登入同步 + 問題回報）

- 專案設定填入 `firebase-config.js`（Auth + Firestore）
- 安全規則：`firestore.rules`（users 個人資料、reports 回報、admins 管理員清單）
- App 功能：Google 登入、作答紀錄雲端同步（跨裝置）、每題回報問題、管理員後台（狀態追蹤）

## 9. 批次執行範例

```powershell
# 單年度（110-113 用 old 編碼; 114-115 用 new）
powershell -File pdf_sop/scripts/run_year.ps1 113 old
powershell -File pdf_sop/scripts/run_year.ps1 114 new

# 圖片（先確認該科有「圖中/下圖」題）
node pdf_sop/scripts/04_extract_images.js "113\113090_66_職能治療技術學（包括.pdf" "113\0805\images" 2
node pdf_sop/scripts/06_merge_figures.js "113\0805\images\image_map.json" "113\0805\images"

# 最終 CSV（05 合併圖片欄）→ 資料庫 → 匯出
node pdf_sop/scripts/05_merge_images.js "113\0805\清洗版.csv" "113\0805\images\image_map.json" "113\0805\最終.csv"
node pdf_sop/scripts/07_import_db.js "115\db_config_all.json" "db\questions.db"
node pdf_sop/scripts/08_export_json.js "db\questions.db" "app" "."
```

## 10. 已知陷阱

| 陷阱 | 解法 |
|---|---|
| 選項文字「4.5歲」開頭被誤判為題號 | 02 已改「題號須連續遞增」規則 |
| MOD 的 ＃ 佔題號位置（非標記前一題） | 06 已正確處理；備註支援「或」與「一律給分」 |
| pdf.js 1.x 渲染特定頁面崩潰 | 改用 pdf_render 的 pdfjs-dist 4.x legacy build |
| 圖片在頁首、題號在前頁 | 04 有跨頁題號對應（上頁最後題號） |
| PDF 文字層錯亂（跨題合併） | 以官方題庫（刷題王/阿摩）原文重建該題（見 114-0803 Q11-13） |
| Pages legacy 建置失敗 | 改用 GitHub Actions 部署 |
| JSON/CSV 被 PowerShell 寫入 BOM | 讀取時 `replace(/^\uFEFF/,'')`；寫檔用 UTF8Encoding($false) |
