// ============================================================
// 04_extract_images.js — 頁面截圖 + 圖形區塊偵測 + 裁切 + 題號對應
// 用法: node 04_extract_images.js <input.pdf> <out_dir> [scale]
//   scale: 渲染倍率,預設 2(1 倍 = 72dpi)
// 產出:
//   <out_dir>/pages/pageNN.png    整頁截圖
//   <out_dir>/images/Q<no>_圖.png 該題圖片裁切(圖形區塊偵測)
//   <out_dir>/image_map.json      題號 ↔ 圖片檔名對應(供 05 合併)
// 前置: npm install --prefix tools pdfjs-dist@1.10.100 @napi-rs/canvas@0.1.65
// ============================================================
const fs = require('fs');
const path = require('path');
// 優先使用 pdf_render 的新版 pdfjs-dist 4.x (legacy build, 修復舊版渲染崩潰)
const RENDER_TOOLS = process.env.PDF_RENDER_TOOLS ||
  path.join(__dirname, '..', '..', 'pdf_render');
const PDFJS = require(path.join(RENDER_TOOLS, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
const { createCanvas } = require(path.join(RENDER_TOOLS, 'node_modules', '@napi-rs', 'canvas'));

class NapiCanvasFactory {
  create(w, h) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext('2d') }; }
  reset(ctx, w, h) { ctx.canvas.width = w; ctx.canvas.height = h; }
  destroy(ctx) {}
}

// 圖形區塊偵測: 稠密暗像素帶
function detectBands(w, h, data, denseRatio = 0.18, minH = 15, gap = 3) {
  const rowDark = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let cnt = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) cnt++;
    }
    rowDark[y] = cnt;
  }
  const dense = [];
  for (let y = 0; y < h; y++) if (rowDark[y] > w * denseRatio) dense.push(y);
  const bands = [];
  if (dense.length) {
    let start = dense[0], prev = dense[0];
    for (let i = 1; i <= dense.length; i++) {
      const y = dense[i];
      if (i === dense.length || y - prev > gap) {
        if (prev - start >= minH) bands.push([start, prev]);
        start = y;
      }
      prev = y;
    }
  }
  return bands;
}

async function main() {
  const [pdfPath, outDir, scaleArg] = process.argv.slice(2);
  if (!pdfPath || !outDir) {
    console.error('用法: node 04_extract_images.js <input.pdf> <out_dir> [scale]');
    process.exit(1);
  }
  const SCALE = scaleArg ? parseFloat(scaleArg) : 2;
  const pageDir = path.join(outDir, 'pages');
  const imgDir = path.join(outDir, 'images');
  fs.mkdirSync(pageDir, { recursive: true });
  fs.mkdirSync(imgDir, { recursive: true });

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await PDFJS.getDocument({ data, useWorker: false }).promise;
  console.log('頁數:', pdf.numPages, '| 倍率:', SCALE);

  const figures = [];
  const pages = [];
  let prevPageLastNo = null; // 上一頁最後題號(供跨頁圖片對應)

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: SCALE });
    const pw = Math.ceil(viewport.width), ph = Math.ceil(viewport.height);

    // 1) 整頁渲染
    const canvas = createCanvas(pw, ph);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport, canvasFactory: new NapiCanvasFactory() }).promise;
    const pageFile = path.join(pageDir, 'page' + String(p).padStart(2, '0') + '.png');
    fs.writeFileSync(pageFile, canvas.toBuffer('image/png'));
    pages.push({ page: p, file: 'pages/page' + String(p).padStart(2, '0') + '.png' });

    // 2) 題號行位置(轉成渲染像素座標: y 軸向下)
    const tc = await page.getTextContent();
    const qLines = [];
    let lastNo = 0;
    let first = true; // 每頁題號序列重新開始: 頁面第一個題號無條件接受
    for (const it of tc.items) {
      const s = (it.str || '').trim();
      const m = s.match(/^(\d{1,3})\./);
      // 之後的題號必須連續遞增,避免選項文字「4.5歲」誤判為題號
      if (m) {
        const n = parseInt(m[1], 10);
        if (first || n === lastNo + 1) {
          qLines.push({ no: n, py: Math.round(ph - it.transform[5] * SCALE) });
          lastNo = n;
        }
        first = false;
      }
    }
    qLines.sort((a, b) => a.py - b.py);

    // 3) 圖形區塊偵測
    const data32 = ctx.getImageData(0, 0, pw, ph).data;
    const bands = detectBands(pw, ph, data32);

    // 4) 區塊 → 題號(找區塊上方的最近題號行; 頁首區塊用上一頁最後題號) → 裁切
    let figIdx = 0;
    for (const [by0, by1] of bands) {
      let owner = null;
      for (const q of qLines) {
        if (q.py < by0) owner = q; else break;
      }
      if (!owner && prevPageLastNo !== null) owner = { no: prevPageLastNo };
      // 區塊內暗像素的 X 範圍
      let minX = pw, maxX = -1;
      for (let y = by0; y <= by1; y++) {
        for (let x = 0; x < pw; x++) {
          const i = (y * pw + x) * 4;
          if (data32[i] < 235 || data32[i + 1] < 235 || data32[i + 2] < 235) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }
      if (maxX < 0) continue;
      const M = 12;
      const cx0 = Math.max(0, minX - M), cy0 = Math.max(0, by0 - M);
      const cx1 = Math.min(pw, maxX + M), cy1 = Math.min(ph, by1 + M);
      const cw = cx1 - cx0, ch = cy1 - cy0;
      if (cw < 30 || ch < 30) continue; // 太小的區塊忽略(可能是粗線)
      if (ch < 16 * SCALE) continue; // 太矮=文字行,非圖片(高度 < 16pt)
      if (cw / ch > 5) continue; // 過寬過扁=文字行/分隔線,非圖片

      const crop = createCanvas(cw, ch);
      const cctx = crop.getContext('2d');
      cctx.drawImage(canvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
      // 檔名唯一性: 同題多圖時加 _2、_3
      const base = owner ? 'Q' + String(owner.no).padStart(2, '0') + '_圖' : 'P' + String(p).padStart(2, '0') + '_圖';
      let name = base + '.png';
      let seq = 1;
      while (fs.existsSync(path.join(imgDir, name))) {
        seq++;
        name = base + '_' + seq + '.png';
      }
      const out = path.join(imgDir, name);
      fs.writeFileSync(out, crop.toBuffer('image/png'));
      figures.push({ page: p, qno: owner ? owner.no : null, file: 'images/' + name, size: cw + 'x' + ch, region: [cx0, cy0, cx1, cy1] });
      console.log('  第' + p + '頁: 圖形區塊 y[' + by0 + '-' + by1 + '] -> ' + name + ' (' + cw + 'x' + ch + ')' + (owner ? ' (第' + owner.no + '題)' : ' (未對應題號)'));
      figIdx++;
    }
    console.log('第' + p + '頁完成 (圖形區塊: ' + bands.length + ')');
    if (qLines.length) prevPageLastNo = qLines[qLines.length - 1].no;
  }

  fs.writeFileSync(path.join(outDir, 'image_map.json'),
    JSON.stringify({ source: path.basename(pdfPath), scale: SCALE, pages, figures }, null, 2), 'utf8');
  console.log('完成! 圖片數: ' + figures.length + ' | 對應檔: ' + path.join(outDir, 'image_map.json'));
}
main().catch(e => { console.error('失敗:', e && e.stack || e.message); process.exit(1); });
