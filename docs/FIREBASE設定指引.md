# 🔥 Firebase 設定指引（約 15 分鐘）

> 目的：考生用 Google 帳號登入後，作答紀錄（錯題本、統計）雲端同步，
> 換手機、換電腦都有過去的紀錄。採用 Blaze（綁信用卡、用多少付多少）。

## Step 1：建立 Firebase 專案

1. 打開 https://console.firebase.google.com（用你的 Google 帳號登入）
2. 按 **建立專案** → 名稱填 `ot-exam-review` → 繼續
3. Google Analytics 可以**關閉**（不需要）→ 建立專案
4. 專案建立後，到 **專案設定 → 使用量與計費** → 升級方案 → 選 **Blaze**（綁信用卡）
   - Blaze 的免費額度與 Spark 相同（50K 讀/天、20K 寫/天），超過才收費，題庫 App 幾乎不會超過

## Step 2：啟用 Google 登入

1. 左側 **Authentication** → **開始使用**
2. **Sign-in method** → 找到 **Google** → 啟用
3. 專案支援電子郵件填你的 email → 儲存

## Step 3：建立 Firestore 資料庫

1. 左側 **Firestore Database** → **建立資料庫**
2. 模式選 **Production mode**（先關閉測試模式，安全）
3. 位置選 **asia-east1**（台灣）→ 建立

## Step 4：取得並填入 firebaseConfig

1. 齒輪 **專案設定** → **你的應用程式** → 選 **Web**（</> 圖示）
2. App 暱稱填 `ot-exam-review` → **註冊應用程式**
3. 畫面會顯示 `firebaseConfig = { apiKey: "...", authDomain: "...", ... }`
4. 複製這整段，貼回本機 `C:\deepseek_herness\OT\repo\firebase-config.js`
   取代裡面的 `window.FIREBASE_CONFIG = { ... }`（把「請填入」換成真實值）
5. 儲存後依 GitHub 指引重新 `git add . && git commit && git push`

## Step 5：設定安全規則

1. Firestore → **Rules** 頁籤
2. 刪掉預設內容，貼上 repo 裡的 `firestore.rules` 內容
3. **發佈**

## Step 6：把網站網域加入授權清單

1. Authentication → **Settings**（齒輪）→ **Authorized domains**
2. 按 **Add domain**，加入你的 Pages 網域：`<你的帳號>.github.io`
   （`localhost` 預設已有，本機測試不用加）

## Step 7：驗收

- [ ] 本機開啟 http://127.0.0.1:8899 → 右上角出現「🔑 Google 登入」
- [ ] 登入後答幾題 → 換另一個瀏覽器（或手機）開同一網址 → 登入同一帳號 → 錯題本與統計已同步
- [ ] 部署到 GitHub 後，線上網址也有登入按鈕（若無，檢查 Authorized domains 是否已加）

## 常見問題

| 問題 | 解法 |
|---|---|
| 登入按鈕沒出現 | firebase-config.js 沒填好或沒 push；按 F12 看 Console 錯誤 |
| 登入後同步失敗 | 檢查 Firestore 規則是否已發佈（Step 5） |
| 網頁無法登入 | 檢查 Authorized domains（Step 6） |
