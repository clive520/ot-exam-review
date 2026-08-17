/* ============================================================
 * Firebase 設定（Phase 5b）
 * 步驟：
 *   1. 到 https://console.firebase.google.com 建立專案（Blaze 方案）
 *   2. Authentication → 啟用 Google 登入
 *   3. Firestore → 建立資料庫（production 模式）
 *   4. 專案設定 → 一般 → 你的應用程式 → Web 應用程式
 *      複製 firebaseConfig，貼到下面 FIREBASE_CONFIG
 *   5. 部署到 GitHub Pages 後，把網域加入
 *      Authentication → Settings → Authorized domains
 *   6. 把 firestore.rules 的內容貼到 Firestore → Rules
 * 完成後 App 自動出現「Google 登入」按鈕，作答紀錄雲端同步。
 * ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "請填入",
  authDomain: "請填入",
  projectId: "請填入",
  storageBucket: "請填入",
  messagingSenderId: "請填入",
  appId: "請填入",
};
