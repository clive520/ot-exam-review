// ============================================================
// 05_merge_images.js — 將 image_map.json 的圖片檔名合併進 CSV
// 用法: node 05_merge_images.js <cleaned.csv> <image_map.json> <out.csv>
// 在 CSV 新增「圖片檔案」欄: 依題號填入檔名(多張以；分隔),無圖填「無」
// ============================================================
const fs = require('fs');

function parseRow(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function esc(v) {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  const [inCsv, mapJson, outCsv] = process.argv.slice(2);
  if (!inCsv || !mapJson || !outCsv) {
    console.error('用法: node 05_merge_images.js <cleaned.csv> <image_map.json> <out.csv>');
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(mapJson, 'utf8').replace(/^\uFEFF/, ''));
  const byQ = new Map();
  for (const f of map.figures || []) {
    if (f.qno) {
      const key = String(f.qno);
      const list = byQ.get(key) || [];
      list.push(f.file);
      byQ.set(key, list);
    }
  }
  const raw = fs.readFileSync(inCsv, 'utf8').replace(/^\uFEFF/, '');
  const rows = raw.split(/\r?\n/).filter(l => l.trim() !== '').map(parseRow);
  if (rows[0].includes('圖片檔案')) {
    console.log('CSV 已有圖片檔案欄,略過');
    return;
  }
  rows[0].push('圖片檔案');
  for (let i = 1; i < rows.length; i++) {
    const no = rows[i][0];
    rows[i].push(byQ.has(no) ? byQ.get(no).join('；') : '無');
  }
  fs.writeFileSync(outCsv, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n'), 'utf8');
  console.log('完成: ' + outCsv + ' (已加入圖片檔案欄, ' + byQ.size + ' 題有圖)');
}
main().catch(e => { console.error('失敗:', e.message); process.exit(1); });
