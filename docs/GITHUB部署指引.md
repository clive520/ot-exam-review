# 🚀 GitHub 部署指引（約 10 分鐘）

> 前提：你電腦已安裝 git（已確認可用）。repo 內容已備好在 `C:\deepseek_herness\OT\repo\`。

## Step 1：在 GitHub 建立 repo（公開）

1. 打開 https://github.com/new
2. Repository name 填：`ot-exam-review`
3. 選 **Public**（免費 GitHub Pages 需要公開）
4. **不要**勾選 Add README / Add .gitignore（repo 裡已有）
5. 按 **Create repository**

## Step 2：把 repo 內容推上去

開啟 PowerShell，依序執行：

```powershell
cd C:deepseek_hernessOTepo
git init
git add .
git commit -m "職能治療師國考題庫 v1：115年度 6科 480題 + 複習App"
git branch -M main
git remote add origin https://github.com/<你的帳號>/ot-exam-review.git
git push -u origin main
```

> 第一次 push 會跳出 GitHub 登入視窗（瀏覽器），登入即可。
> 若要求 Personal Access Token：GitHub → Settings → Developer settings → Personal access tokens → 產生（勾 repo 權限）。

## Step 3：開啟 GitHub Pages

1. repo 頁面 → **Settings** → 左側 **Pages**
2. Build and deployment 的 Source 選 **Deploy from a branch**
3. Branch 選 **main**、資料夾選 **/ (root)** → **Save**
4. 等 1–2 分鐘，頁面會顯示你的網址：
   `https://<你的帳號>.github.io/ot-exam-review/`

## Step 4：驗收

- [ ] 用手機和電腦瀏覽器打開網址
- [ ] 選科目 → 開始練習 → 答題對錯正常
- [ ] 圖片題（解剖第 8 題、生理第 13 題）圖片正常顯示

## 之後每次更新題庫

```powershell
cd C:deepseek_hernessOTepo
git add .
git commit -m "更新說明"
git push
```
考生重新整理網頁即可看到新題。

## 疑難排除

| 問題 | 解法 |
|---|---|
| push 被拒 | 先 `git pull origin main --rebase` 再 push |
| Pages 顯示 404 | 確認 repo 根目錄有 index.html，Branch/資料夾選對 |
| 中文檔名異常 | 執行 `git config core.quotepath false` 只是顯示問題，不影響 |
