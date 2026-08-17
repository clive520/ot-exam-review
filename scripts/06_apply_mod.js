// ============================================================
// 06_apply_mod.js — 套用「更正答案」(MOD) 到基礎 CSV
// 用法: node 06_apply_mod.js <base.csv> <mod.txt> <out.csv>
// MOD 格式(考選部更正答案):
//   - 與 ANS 相同: 「答案ＡＢＣＤ...」全形字母, 每列 20 題
//   - 更正過的答案標「＃」(例: 答案ＡＤＢ＃Ｃ...)
//   - 備註列: 「第77題答Ｃ、Ｄ給分。」(多選/改答案說明)
// 產出: 「正確答案」改為最終答案(＃處套用 MOD 答案, 多選以 'CD' 併列),
//        重建「答案內容」; 新增兩欄: 原始答案, 更正備註
// ============================================================
const fs = require('fs');

function stripLineNo(text) { const t = text.indexOf('\t'); return t >= 0 ? text.slice(t + 1) : text; }

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

// 解析 MOD 文字 → { ans: Map<qno, final>, notes: Map<qno, note> }
function parseMod(modTxt) {
  const ans = new Map();
  const notes = new Map();
  let seq = 0;
  for (const line of modTxt) {
    const t = stripLineNo(line).trim();
    if (!t) continue;
    if (t.startsWith('答案')) {
      const seq2 = t.replace('答案', '').replace(/\s+/g, '');
      for (const ch of seq2) {
        if (ch === '＃') {
          // ＃ 佔一個題號位置: 代表「此題有更正答案,詳備註」(答案可能是多選)
          seq++;
          ans.set(seq, { letter: null, marked: true });
        } else {
          const idx = 'ＡＢＣＤ'.indexOf(ch);
          if (idx >= 0) { seq++; ans.set(seq, { letter: 'ABCD'[idx], marked: false }); }
          else if (/[ABCD]/i.test(ch)) { seq++; ans.set(seq, { letter: ch.toUpperCase(), marked: false }); }
        }
      }
    } else if (/第\d+題答|一律給分/.test(t)) {
      const affected = new Set();
      // 「第59題答Ａ、Ｂ給分」或「第12題答Ｂ或Ｃ或BC者均給分」→ 多選答案
      const reAns = /第(\d+)題答([^，。]+?)(?:者)?均?給分/g;
      let mm;
      while ((mm = reAns.exec(t)) !== null) {
        const n = parseInt(mm[1], 10);
        const letters = mm[2].replace(/[、,，\s]/g, '').split('').map(c => {
          const idx = 'ＡＢＣＤ'.indexOf(c);
          return idx >= 0 ? 'ABCD'[idx] : c.toUpperCase();
        }).filter(c => /[ABCD]/.test(c));
        const uniq = [...new Set(letters)].join('');
        if (uniq) { ans.set(n, { letter: uniq, marked: true }); affected.add(n); }
      }
      // 「第77題一律給分」→ 全部答案都給分
      const reAll = /第(\d+)題一律給分/g;
      while ((mm = reAll.exec(t)) !== null) {
        const n = parseInt(mm[1], 10);
        ans.set(n, { letter: 'ABCD', marked: true });
        affected.add(n);
      }
      for (const a of affected) notes.set(a, t);
    }
  }
  return { ans, notes };
}

async function main() {
  const [inCsv, modTxtPath, outCsv] = process.argv.slice(2);
  if (!inCsv || !modTxtPath || !outCsv) {
    console.error('用法: node 06_apply_mod.js <base.csv> <mod.txt> <out.csv>');
    process.exit(1);
  }
  const raw = fs.readFileSync(inCsv, 'utf8').replace(/^\uFEFF/, '');
  const rows = raw.split(/\r?\n/).filter(l => l.trim() !== '').map(parseRow);
  const header = rows[0].slice();
  if (!header.includes('原始答案')) header.push('原始答案');
  if (!header.includes('更正備註')) header.push('更正備註');
  const dataIdx = {};
  header.forEach((h, i) => dataIdx[h] = i);

  const modLines = fs.readFileSync(modTxtPath, 'utf8').split(/\r?\n/);
  const { ans, notes } = parseMod(modLines);

  const changed = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const no = parseInt(r[dataIdx['題號']], 10);
    const orig = r[dataIdx['正確答案']];
    const mod = ans.get(no);
    const note = notes.get(no) || '';
    if (mod && mod.letter) {
      r[dataIdx['正確答案']] = mod.letter;
      const parts = mod.letter.split('').map(L => {
        const k = '選項' + L;
        return dataIdx[k] !== undefined ? r[dataIdx[k]] : '';
      }).filter(Boolean);
      r[dataIdx['答案內容']] = parts.join('；');
      if (mod.letter !== orig) changed.push({ no, orig, final: mod.letter });
    }
    r[dataIdx['原始答案']] = orig;
    r[dataIdx['更正備註']] = note;
  }

  fs.writeFileSync(outCsv, '\uFEFF' + [header, ...rows.slice(1)].map(r => r.map(esc).join(',')).join('\r\n'), 'utf8');
  console.log('更正題數: ' + changed.length);
  for (const c of changed) console.log('  第' + c.no + '題: ' + c.orig + ' → ' + c.final);
  console.log('輸出: ' + outCsv + ' (新增欄: 原始答案, 更正備註)');
}
main().catch(e => { console.error('失敗:', e.message); process.exit(1); });
