// ============================================================
// 03_clean_csv.js — 清洗 CSV 文字: 機械規則 + 術語修正設定檔
// 用法: node 03_clean_csv.js <in.csv> <out_cleaned.csv> <out_changelog.csv> [term_fixes.json]
//   第 4 參數(選用): 該科目的術語修正設定檔, JSON 陣列格式:
//     [ [原文, 修正後, 類型, 說明], ... ]
//   省略時只套用機械規則。
// 產出: 清洗後 CSV(同欄位) + 修正紀錄 CSV(題號,欄位,原文,修正後,類型,說明)
// ============================================================
const fs = require('fs');

// ---- 載入術語修正設定(依科目), 預設為空 ----
let TERM_FIXES = [];
const termFile = process.argv[5];
if (termFile) {
  try {
    TERM_FIXES = JSON.parse(fs.readFileSync(termFile, 'utf8'));
    console.log('已載入術語修正設定: ' + termFile + ' (' + TERM_FIXES.length + ' 條)');
  } catch (e) {
    console.error('⚠ 無法讀取術語設定檔 ' + termFile + ': ' + e.message);
    process.exit(1);
  }
}

function cleanCell(s, no, field, changes) {
  let t = s;
  const before = s;
  for (const [from, to, type, note] of TERM_FIXES) {
    if (t.includes(from)) t = t.split(from).join(to);
  }
  // 上下標: PDF 提取常見的拆字問題
  t = t.replace(/HCO\s*3\s*-\s*/g, 'HCO₃⁻');
  t = t.replace(/NH\s*4\s*\+\s*/g, 'NH₄⁺');
  t = t.replace(/H\s*\+\s*/g, 'H⁺');
  // 通用上標/下標: Ca 2+ → Ca²⁺、T 3 → T₃、10 1 → 10¹、2 nd → 2nd
  const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };
  const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
  t = t.replace(/([A-Za-z])(\d)\s*([+-])(?![A-Za-z0-9])/g, (m, a, d, s) => a + (supMap[d] || d) + (supMap[s] || s));
  t = t.replace(/([A-Za-z])\s+(\d)(?![\d.])/g, (m, a, d) => a + (subMap[d] || d));
  t = t.replace(/(\d)\s+(\d)(?![\d.,])/g, (m, a, d) => a + (supMap[d] || d));
  t = t.replace(/(\d)\s+(st|nd|rd|th)\b/gi, '$1$2');
  t = t.replace(/([⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉])\s+([-–—])/g, '$1$2');
  // CJK 相容異體字正規化 (PDF 提取常見 U+F900-FAFF 殘留)
  const compatMap = {
    '不':'不','良':'良','量':'量','列':'列','行':'行','神':'神','度':'度','力':'力','略':'略',
    '咽':'咽','拉':'拉','離':'離','輪':'輪','異':'異','練':'練','來':'來','立':'立','精':'精',
    '留':'留','見':'見','刺':'刺','勞':'勞','說':'說','便':'便','料':'料','更':'更','都':'都',
    '令':'令','益':'益','福':'福','來':'來','理':'理','行':'行','領':'領','類':'類','年':'年',
    '易':'易','識':'識','參':'參','來':'來','不':'不','令':'令','見':'見',
    '律':'律','六':'六','讀':'讀','量':'量','領':'領','類':'類',
    '療':'療','暈':'暈','輪':'輪','離':'離','拉':'拉','說':'說','便':'便',
  };
  for (const [from, to] of Object.entries(compatMap)) {
    if (t.includes(from)) t = t.split(from).join(to);
  }
  // L型統一
  t = t.replace(/L-\s*型/g, 'L型');
  t = t.replace(/L\s*型/g, 'L型');
  // 括號內單詞尾隨空格:（lens ）→（lens）
  t = t.replace(/（\s*([A-Za-z0-9，,.+~^·'\-]+?)\s*）/g, '（$1）');
  // 字母/數字與中文間空格:維生素 D → 維生素D、R 波 → R波
  t = t.replace(/([A-Za-z0-9])\s+([\u4e00-\u9fff])/g, '$1$2');
  t = t.replace(/([\u4e00-\u9fff])\s+([A-Za-z0-9])(?![A-Za-z])/g, '$1$2');
  // 字母/數字與全形標點:ATP ？ → ATP？、： mL → ：mL
  t = t.replace(/([A-Za-z0-9])\s+([\uFF01-\uFF5E\u3001\u3002])/g, '$1$2');
  t = t.replace(/([\uFF01-\uFF5E\u3001\u3002])\s+([A-Za-z0-9])/g, '$1$2');
  // 圈號前補分號:前驅物 ② → 前驅物；②
  t = t.replace(/([\u4e00-\u9fff])\s+([\u2460-\u2473])/g, '$1；$2');
  // 中文與中文之間的多餘空格(提取缺陷):看不 見 → 看不見
  t = t.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');
  // 中文後接全形標點前的空格:最適當 ？ → 最適當？
  t = t.replace(/([\u4e00-\u9fff])\s+([\uFF01-\uFF5E\u3001\u3002])/g, '$1$2');
  // 中文後接半形左括號 → 全形:早期療育( → 早期療育（
  t = t.replace(/([\u4e00-\u9fff])\(/g, '$1（');
  // 圈號後多餘空格:③ Person → ③Person、⑤ 正中孔 → ⑤正中孔
  t = t.replace(/([\u2460-\u2473])\s+/g, '$1');
  // 全形英文字母/數字 → 半形:Ｍajor → Major、ＡＢＣ → ABC
  const fullHalf = { 'Ａ':'A','Ｂ':'B','Ｃ':'C','Ｄ':'D','Ｅ':'E','Ｆ':'F','Ｇ':'G','Ｈ':'H','Ｉ':'I','Ｊ':'J','Ｋ':'K','Ｌ':'L','Ｍ':'M','Ｎ':'N','Ｏ':'O','Ｐ':'P','Ｑ':'Q','Ｒ':'R','Ｓ':'S','Ｔ':'T','Ｕ':'U','Ｖ':'V','Ｗ':'W','Ｘ':'X','Ｙ':'Y','Ｚ':'Z','０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9' };
  for (const [from, to] of Object.entries(fullHalf)) {
    if (t.includes(from)) t = t.split(from).join(to);
  }
  // 連字號被空格拆開:DSM- 5 → DSM-5、self- concept → self-concept、skill -building → skill-building
  t = t.replace(/([A-Za-z0-9])-\s+(?=[A-Za-z0-9])/g, '$1-');
  t = t.replace(/([A-Za-z0-9])\s+-(?=[A-Za-z0-9])/g, '$1-');
  // 異體斜線:20∕50 → 20/50
  t = t.replace(/(\d)∕(?=\d)/g, '$1/');
  // 多餘空白
  t = t.replace(/ {2,}/g, ' ').trim();

  if (t !== before) {
    changes.push({ no, field, before, after: t, type: '已修正', note: '機械清洗(見規則表)' });
  }
  return t;
}

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
  const [inCsv, outCsv, outChg] = process.argv.slice(2);
  if (!inCsv || !outCsv || !outChg) {
    console.error('用法: node 03_clean_csv.js <in.csv> <out_cleaned.csv> <out_changelog.csv> [term_fixes.json]');
    process.exit(1);
  }
  const raw = fs.readFileSync(inCsv, 'utf8').replace(/^\uFEFF/, '');
  const rows = raw.split(/\r?\n/).filter(l => l.trim() !== '').map(parseRow);
  const header = rows[0];
  const dataIdx = {};
  header.forEach((h, i) => dataIdx[h] = i);
  const changes = [];

  const outRows = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].slice();
    r[dataIdx['題目']] = cleanCell(r[dataIdx['題目']], r[dataIdx['題號']], '題目', changes);
    for (const k of ['選項A', '選項B', '選項C', '選項D']) {
      r[dataIdx[k]] = cleanCell(r[dataIdx[k]], r[dataIdx['題號']], k, changes);
    }
    if (dataIdx['答案內容'] !== undefined && dataIdx['正確答案'] !== undefined) {
      const ansStr = String(r[dataIdx['正確答案']] || '');
      const letters = ansStr.split('');
      if (letters.length === 1) {
        const optKey = '選項' + ansStr;
        r[dataIdx['答案內容']] = dataIdx[optKey] !== undefined ? r[dataIdx[optKey]] : r[dataIdx['答案內容']];
      } else {
        // 多選(如 BC、ABCD): 併列各選項的清洗後文字
        const parts = letters.map(L => {
          const k = '選項' + L;
          return dataIdx[k] !== undefined ? r[dataIdx[k]] : '';
        }).filter(Boolean);
        r[dataIdx['答案內容']] = parts.join('；');
      }
    }
    outRows.push(r);
  }
  fs.writeFileSync(outCsv, '\uFEFF' + outRows.map(r => r.map(esc).join(',')).join('\r\n'), 'utf8');

  const chgHeader = ['題號','欄位','原文','修正後','類型','說明'];
  const chgRows = [chgHeader.join(',')];
  for (const c of changes) chgRows.push([c.no, c.field, c.before, c.after, c.type, c.note].map(esc).join(','));
  fs.writeFileSync(outChg, '\uFEFF' + chgRows.join('\r\n'), 'utf8');

  console.log('清洗變更數: ' + changes.length + ' | 輸出: ' + outCsv + ' / ' + outChg);
  console.log('⚠ 提醒: 請人工檢查術語(見 SOP 第 6 步),並將「需確認」項目補進修正紀錄');
}
main().catch(e => { console.error('失敗:', e.message); process.exit(1); });
