// ============================================================
// 01_extract_text.js — 從 PDF 提取文字(每行加行號),供後續解析
// 用法: node 01_extract_text.js <input.pdf> <output.txt>
// 前置: npm install --prefix tools pdf-parse@1.1.1
// ============================================================
const fs = require('fs');
const path = require('path');
const TOOLS = process.env.PDF_TOOLS || path.join(__dirname, '..', 'tools');
const pdfParse = require(path.join(TOOLS, 'node_modules', 'pdf-parse', 'index.js'));

async function main() {
  const [pdfPath, outPath] = process.argv.slice(2);
  if (!pdfPath || !outPath) {
    console.error('用法: node 01_extract_text.js <input.pdf> <output.txt>');
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  const lines = data.text.split(/\r?\n/);
  fs.writeFileSync(outPath, lines.map((l, i) => (i + 1) + '\t' + l).join('\n'), 'utf8');
  console.log('OK: ' + data.numpages + ' 頁, ' + lines.length + ' 行 -> ' + outPath);
}
main().catch(e => { console.error('失敗:', e.message); process.exit(1); });
