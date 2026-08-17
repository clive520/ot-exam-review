// ============================================================
// 06_merge_figures.js — 將同一張圖被拆成多個相鄰區塊的情況合併
// 用法: node 06_merge_figures.js <image_map.json> <out_dir>
// 邏輯: 同頁中 y 間隙 < 40px 且 X 範圍重疊的區塊視為同一張圖,
//       從已渲染的 pages/pageNN.png 裁出聯集區域, 合併成一張圖。
// 產出: 覆寫 Q<no>_圖.png 系列, 並更新 image_map.json
// ============================================================
const fs = require('fs');
const path = require('path');
const TOOLS = process.env.PDF_TOOLS || path.join(__dirname, '..', 'tools');
const { createCanvas, loadImage } = require(path.join(TOOLS, 'node_modules', '@napi-rs', 'canvas'));

async function main() {
  const [mapPath, outDir] = process.argv.slice(2);
  if (!mapPath || !outDir) { console.error('用法: node 06_merge_figures.js <image_map.json> <out_dir>'); process.exit(1); }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const pageDir = path.join(outDir, 'pages');

  // 依頁分組並排序
  const byPage = new Map();
  for (const f of map.figures || []) {
    if (!byPage.has(f.page)) byPage.set(f.page, []);
    byPage.get(f.page).push(f);
  }

  const merged = [];
  let totalBefore = (map.figures || []).length;

  for (const [page, figs] of byPage) {
    figs.sort((a, b) => a.region[1] - b.region[1]);
    let group = [figs[0]];
    const flush = async (g) => {
      if (g.length === 1) { merged.push(g[0]); return; }
      // 聯集區域
      const x0 = Math.min(...g.map(f => f.region[0]));
      const y0 = Math.min(...g.map(f => f.region[1]));
      const x1 = Math.max(...g.map(f => f.region[2]));
      const y1 = Math.max(...g.map(f => f.region[3]));
      const w = x1 - x0, h = y1 - y0;
      const pageFile = path.join(pageDir, 'page' + String(page).padStart(2, '0') + '.png');
      const img = await loadImage(pageFile);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
      const qno = g[0].qno;
      const base = qno ? 'Q' + String(qno).padStart(2, '0') + '_圖' : 'P' + String(page).padStart(2, '0') + '_圖';
      // 先刪除舊的單一區塊檔
      for (const f of g) {
        const old = path.join(outDir, 'images', path.basename(f.file));
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      let name = base + '.png', seq = 1;
      while (fs.existsSync(path.join(outDir, 'images', name))) { seq++; name = base + '_' + seq + '.png'; }
      const out = path.join(outDir, 'images', name);
      fs.writeFileSync(out, canvas.toBuffer('image/png'));
      console.log('合併第' + page + '頁 ' + g.length + ' 個區塊 (題' + (qno || '?') + ') -> ' + name + ' (' + w + 'x' + h + ')');
      merged.push({ page, qno, file: 'images/' + name, size: w + 'x' + h, region: [x0, y0, x1, y1], mergedFrom: g.map(f => f.file) });
    };
    for (let i = 1; i < figs.length; i++) {
      const prev = group[group.length - 1];
      const cur = figs[i];
      const gapY = cur.region[1] - prev.region[3];
      const overlapX = Math.min(cur.region[2], prev.region[2]) - Math.max(cur.region[0], prev.region[0]);
      const sameQ = cur.qno === prev.qno;
      if (sameQ && gapY >= 0 && gapY < 40 && overlapX > 0) { group.push(cur); }
      else { await flush(group); group = [cur]; }
    }
    await flush(group);
  }

  map.figures = merged;
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');
  console.log('完成: 合併前 ' + totalBefore + ' 個區塊 -> 合併後 ' + merged.length + ' 個');
}
main().catch(e => { console.error('失敗:', e && e.stack || e.message); process.exit(1); });
