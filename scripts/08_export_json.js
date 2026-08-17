// ============================================================
// 08_export_json.js — 將 SQLite 題庫匯出為 Web App 用的 JSON + 圖片
// 用法: node 08_export_json.js <questions.db> <app_dir> <images_root>
//   app_dir    : 輸出目錄(將建立 data/ 與 images/<subjCode>/)
//   images_root: 各科目圖片來源根目錄(其下為 <subjCode>/images/images/*.png)
// 產出:
//   <app_dir>/data/meta.json      考試類型 + 科目清單
//   <app_dir>/data/questions.json 全部題目
//   <app_dir>/images/<subjCode>/  圖片檔
// ============================================================
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

async function main() {
  const [dbPath, appDir, imagesRoot] = process.argv.slice(2);
  if (!dbPath || !appDir || !imagesRoot) {
    console.error('用法: node 08_export_json.js <questions.db> <app_dir> <images_root>');
    process.exit(1);
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const examTypes = db.prepare('SELECT * FROM exam_types ORDER BY id').all();
  const subjects = db.prepare('SELECT s.*, e.code AS exam_code FROM subjects s JOIN exam_types e ON e.id = s.exam_type_id ORDER BY s.year, s.code').all();
  const qRows = db.prepare('SELECT q.*, s.code AS subj_code, s.year, s.name AS subj_name FROM questions q JOIN subjects s ON s.id = q.subject_id ORDER BY s.code, q.qno').all();

  fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });

  const meta = {
    examTypes: examTypes.map(e => ({ code: e.code, name: e.name })),
    subjects: subjects.map(s => ({ code: s.code, name: s.name, year: s.year, examCode: s.exam_code })),
    exportedAt: new Date().toISOString(),
    totalQuestions: qRows.length,
  };
  fs.writeFileSync(path.join(appDir, 'data', 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  const questions = qRows.map(q => {
    let img = null;
    if (q.image_files) {
      const files = q.image_files.split('；').map(f => f.trim()).filter(Boolean);
      const mapped = files.map(f => {
        const base = path.basename(f);
        const src = path.join(imagesRoot, q.subj_code, 'images', 'images', base);
        const destDir = path.join(appDir, 'images', q.subj_code);
        fs.mkdirSync(destDir, { recursive: true });
        if (fs.existsSync(src)) {
          const dest = path.join(destDir, base);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
          return 'images/' + q.subj_code + '/' + base;
        }
        console.warn('⚠ 圖片缺失: ' + src);
        return null;
      }).filter(Boolean);
      img = mapped.length ? mapped.join('；') : null;
    }
    return {
      id: q.id,
      subj: q.subj_code,
      year: q.year,
      qno: q.qno,
      stem: q.stem,
      opts: [q.opt_a, q.opt_b, q.opt_c, q.opt_d],
      ans: q.answer_final,
      ansText: q.answer_text,
      note: q.correction_note || null,
      img,
    };
  });
  fs.writeFileSync(path.join(appDir, 'data', 'questions.json'), JSON.stringify(questions), 'utf8');

  const imgCount = questions.filter(q => q.img).length;
  console.log('完成! 考試類型: ' + examTypes.length + ' | 科目: ' + subjects.length + ' | 題數: ' + questions.length + ' | 有圖題數: ' + imgCount);
  console.log('輸出: ' + path.join(appDir, 'data', 'meta.json') + ' / questions.json / images/');
}
main().catch(e => { console.error('失敗:', e && e.stack || e.message); process.exit(1); });
