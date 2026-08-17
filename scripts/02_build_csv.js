// ============================================================
// 02_build_csv.js — 解析考題文字 + 答案鍵文字 → 基礎 CSV
// 用法: node 02_build_csv.js <exam.txt> <answer.txt> <out.csv>
// 適用格式(考選部試題):
//   - 題目行: 以 "數字." 開頭,例 "8.圖中紅色箭頭..."
//   - 選項行: 以 "A./B./C./D." 開頭
//   - 折行: 題目/選項跨多行時自動合併(中文無空格銜接、英文保留空格)
//   - 答案鍵: "答案ＡＢＤＤ..." 全形字母,依序對應題號
// 產出 8 欄: 題號,題目,選項A,選項B,選項C,選項D,正確答案,答案內容 (UTF-8 BOM)
// ============================================================
const fs = require('fs');
const path = require('path');

function stripLineNo(text) {
  const tab = text.indexOf('\t');
  return tab >= 0 ? text.slice(tab + 1) : text;
}

const isCJK = (s) => /[\u3000-\u303F\uFF00-\uFFEF\u4E00-\u9FFF\u3400-\u4DBF]/u.test(s);
function joinPieces(pieces) {
  let out = '';
  for (const p of pieces) {
    const cur = (p || '').trim();
    if (!cur) continue;
    if (out) {
      const prevLast = out[out.length - 1];
      const curFirst = cur[0];
      const needSpace = !(isCJK(prevLast) && isCJK(curFirst)) && !(prevLast === ' ' || curFirst === ' ');
      out = needSpace ? out + ' ' + cur : out + cur;
    } else {
      out = cur;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function parseAnswers(ansTxt) {
  const answers = new Map();
  for (const line of ansTxt) {
    const t = stripLineNo(line).trim();
    if (!t.startsWith('答案')) continue;
    const seq = t.replace('答案', '').replace(/\s+/g, '');
    for (const ch of seq) {
      const idx = 'ＡＢＣＤ'.indexOf(ch);
      if (idx >= 0) answers.set(answers.size + 1, 'ABCD'[idx]);
      else if (/[ABCD]/i.test(ch)) answers.set(answers.size + 1, ch.toUpperCase());
    }
  }
  return answers;
}

function parseQuestions(examTxt) {
  const questions = [];
  let cur = null;
  for (const line of examTxt) {
    const t = stripLineNo(line).trim();
    if (!t) continue;
    const qm = t.match(/^(\d{1,3})\.(.*)$/);
    if (qm) {
      const n = parseInt(qm[1], 10);
      // 題號嚴格連續(1,2,3...80): 非連續的「數字.」視為選項折行文字
      // (例: 選項文字「4.5歲:...」開頭的 4. 不得誤判為新題)
      const isNewQ = !cur || n === cur.no + 1;
      if (isNewQ) {
        if (cur) questions.push(cur);
        cur = { no: n, qPieces: [qm[2].trim()], opts: { A: [], B: [], C: [], D: [] }, last: 'q' };
        continue;
      }
    }
    const om = t.match(/^([ABCD])\.(.*)$/);
    if (om && cur) { cur.last = om[1]; cur.opts[cur.last].push(om[2].trim()); continue; }
    if (cur) {
      if (cur.last === 'q') cur.qPieces.push(t);
      else cur.opts[cur.last].push(t);
    }
  }
  if (cur) questions.push(cur);
  for (const q of questions) {
    q.text = joinPieces(q.qPieces);
    q.A = joinPieces(q.opts.A); q.B = joinPieces(q.opts.B);
    q.C = joinPieces(q.opts.C); q.D = joinPieces(q.opts.D);
  }
  return questions;
}

function esc(v) {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  const [examTxtPath, ansTxtPath, outCsv] = process.argv.slice(2);
  if (!examTxtPath || !ansTxtPath || !outCsv) {
    console.error('用法: node 02_build_csv.js <exam.txt> <answer.txt> <out.csv>');
    process.exit(1);
  }
  const examTxt = fs.readFileSync(examTxtPath, 'utf8').split(/\r?\n/);
  const ansTxt = fs.readFileSync(ansTxtPath, 'utf8').split(/\r?\n/);
  const questions = parseQuestions(examTxt);
  const answers = parseAnswers(ansTxt);

  const maxNo = Math.max(questions.length, answers.size);
  const issues = [];
  for (let i = 1; i <= maxNo; i++) {
    const q = questions.find(x => x.no === i);
    const a = answers.get(i);
    if (!q) issues.push('第' + i + '題: 題目缺失');
    else if (!a) issues.push('第' + i + '題: 答案缺失');
    else for (const k of ['A','B','C','D']) if (!q[k]) issues.push('第' + i + '題: 選項' + k + '缺失');
  }

  const header = ['題號','題目','選項A','選項B','選項C','選項D','正確答案','答案內容'];
  const rows = [header.join(',')];
  for (let i = 1; i <= maxNo; i++) {
    const q = questions.find(x => x.no === i);
    const a = answers.get(i);
    if (!q || !a) continue;
    rows.push([i, q.text, q.A, q.B, q.C, q.D, a, q[a]].map(esc).join(','));
  }
  fs.writeFileSync(outCsv, '\uFEFF' + rows.join('\r\n'), 'utf8');

  console.log('題目數: ' + questions.length + ' | 答案數: ' + answers.size + ' | CSV 資料列: ' + (rows.length - 1));
  if (issues.length) { console.log('⚠ 問題(' + issues.length + '):'); issues.forEach(x => console.log('  ' + x)); }
  else console.log('✅ 全部對應成功,無缺失');
}
main().catch(e => { console.error('失敗:', e.message); process.exit(1); });
