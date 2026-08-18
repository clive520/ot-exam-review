// ============================================================
// 07_import_db.js — 將各科最終 CSV 匯入 SQLite 題庫
// 用法: node 07_import_db.js <db_config.json> <output.db>
// 設定檔格式:
// {
//   "examType": { "code": "OT", "name": "職能治療師" },
//   "year": 115,
//   "subjects": [
//     { "code": "0105", "name": "解剖學與生理學", "csv": "115/解剖學與生理學_題目與答案_最終.csv" },
//     ...
//   ]
// }
// 匯入規則:
//   - 題號,題目,選項A~D,正確答案(可含多選 'CD'),答案內容,圖片檔案
//   - 未來若有更正答案, 可另存 answer_original / correction_note
// ============================================================
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

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

async function main() {
  const [cfgPath, dbPath] = process.argv.slice(2);
  if (!cfgPath || !dbPath) { console.error('用法: node 07_import_db.js <db_config.json> <output.db>'); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));

  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE exam_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type_id INTEGER NOT NULL REFERENCES exam_types(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      year INTEGER NOT NULL,
      session TEXT NOT NULL DEFAULT '',
      UNIQUE (exam_type_id, year, session, code)
    );
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      qno INTEGER NOT NULL,
      stem TEXT NOT NULL,
      opt_a TEXT, opt_b TEXT, opt_c TEXT, opt_d TEXT,
      answer_original TEXT NOT NULL,
      answer_final TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      correction_note TEXT,
      image_files TEXT,
      UNIQUE (subject_id, qno)
    );
    CREATE INDEX idx_q_subject ON questions(subject_id);
  `);

  const insExam = db.prepare('INSERT INTO exam_types (code, name) VALUES (?, ?)');
  const insSubj = db.prepare('INSERT INTO subjects (exam_type_id, code, name, year, session) VALUES (?, ?, ?, ?, ?)');
  const insQ = db.prepare('INSERT INTO questions (subject_id, qno, stem, opt_a, opt_b, opt_c, opt_d, answer_original, answer_final, answer_text, correction_note, image_files) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // 支援單一(舊格式)與多國考(新格式)設定
  const examTypeCfgs = cfg.examTypes || [{ ...cfg.examType, subjects: cfg.subjects }];
  const examTypeIds = new Map();
  for (const et of examTypeCfgs) {
    const info = insExam.run(et.code, et.name);
    examTypeIds.set(et.code, Number(info.lastInsertRowid));
  }
  let totalQ = 0;
  let totalSubj = 0;

  for (const et of examTypeCfgs) {
  const examTypeId = examTypeIds.get(et.code);
  for (const subj of et.subjects) {
    const csvPath = path.resolve(subj.csv);
    if (!fs.existsSync(csvPath)) { console.error('找不到 CSV: ' + csvPath); process.exit(1); }
    const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
    const rows = raw.split(/\r?\n/).filter(l => l.trim() !== '').map(parseRow);
    const header = rows[0];
    const idx = {};
    header.forEach((h, i) => idx[h] = i);
    const subjYear = subj.year !== undefined ? subj.year : (et.year !== undefined ? et.year : 0);
  const subjSession = subj.session !== undefined ? subj.session : '';
  const subjInfo = insSubj.run(examTypeId, subj.code, subj.name, subjYear, subjSession);
    const subjectId = Number(subjInfo.lastInsertRowid);
    let count = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const qno = parseInt(r[idx['題號']], 10);
      const stem = r[idx['題目']];
      const optA = idx['選項A'] !== undefined ? r[idx['選項A']] : null;
      const optB = idx['選項B'] !== undefined ? r[idx['選項B']] : null;
      const optC = idx['選項C'] !== undefined ? r[idx['選項C']] : null;
      const optD = idx['選項D'] !== undefined ? r[idx['選項D']] : null;
      const ans = (r[idx['正確答案']] || '').toUpperCase();
      const ansText = idx['答案內容'] !== undefined ? r[idx['答案內容']] : '';
      const orig = idx['原始答案'] !== undefined && r[idx['原始答案']] ? (r[idx['原始答案']] || '').toUpperCase() : ans;
      const note = idx['更正備註'] !== undefined && r[idx['更正備註']] ? r[idx['更正備註']] : null;
      const img = idx['圖片檔案'] !== undefined ? r[idx['圖片檔案']] : '';
      const imgFiles = (img && img !== '無') ? img : null;
      insQ.run(subjectId, qno, stem, optA, optB, optC, optD, orig, ans, ansText, note, imgFiles);
      count++;
    }
    console.log(subj.code + ' ' + subj.name + ': 匯入 ' + count + ' 題');
    totalQ += count;
    totalSubj++;
  }
  }

  db.close();
  console.log('完成! 考試類型: ' + examTypeCfgs.length + ' | 科目: ' + totalSubj + ' | 題數: ' + totalQ + ' | 資料庫: ' + dbPath);
}
main().catch(e => { console.error('失敗:', e && e.stack || e.message); process.exit(1); });
