// ============================================================
// 08_export_json.js — 將 SQLite 題庫匯出為 Web App 用的 JSON + 圖片
// 用法: node 08_export_json.js <questions.db> <app_dir> <images_root>
//   images_root: 各年度資料夾的父目錄(其下為 <year>/<subjCode>/images/images/*.png)
// 產出:
//   <app_dir>/data/meta.json      考試類型 + 科目清單(含複合鍵 key=year-code)
//   <app_dir>/data/questions.json 全部題目(subj 欄為複合鍵, 如 "115-0105")
//   <app_dir>/images/<year>-<code>/  圖片檔
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

  // 可選第 4 參數: db_config JSON → 依 csv 路徑推導各科圖片來源目錄(支援非標準目錄結構)
  let imgDirByKey = new Map();
  const cfgPath = process.argv[5];
  if (cfgPath && fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
    const examTypeCfgs = cfg.examTypes || [{ ...cfg.examType, subjects: cfg.subjects }];
    for (const et of examTypeCfgs) {
      for (const s of et.subjects) {
        const key = s.year + (s.session ? '-' + s.session : '') + '-' + s.code;
        const csvDir = path.dirname(path.resolve(s.csv));
        imgDirByKey.set(key, path.join(csvDir, 'images', 'images'));
      }
    }
  }

  const examTypes = db.prepare('SELECT * FROM exam_types ORDER BY id').all();
  const subjects = db.prepare('SELECT s.*, e.code AS exam_code FROM subjects s JOIN exam_types e ON e.id = s.exam_type_id ORDER BY s.year, s.session, s.code').all();
  const qRows = db.prepare('SELECT q.*, s.code AS subj_code, s.year, s.session, s.name AS subj_name FROM questions q JOIN subjects s ON s.id = q.subject_id ORDER BY s.year, s.session, s.code, q.qno').all();

  fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });

  const meta = {
    examTypes: examTypes.map(e => ({ code: e.code, name: e.name })),
    subjects: subjects.map(s => ({ key: s.year + (s.session ? '-' + s.session : '') + '-' + s.code, code: s.code, name: s.name, year: s.year, session: s.session, examCode: s.exam_code })),
    exportedAt: new Date().toISOString(),
    totalQuestions: qRows.length,
  };
  fs.writeFileSync(path.join(appDir, 'data', 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  const questions = qRows.map(q => {
    const subjKey = q.year + (q.session ? '-' + q.session : '') + '-' + q.subj_code;
    let img = null;
    if (q.image_files) {
      const files = q.image_files.split('；').map(f => f.trim()).filter(Boolean);
      const mapped = files.map(f => {
        const base = path.basename(f);
        const dirOverride = imgDirByKey.get(subjKey);
        const src = dirOverride
          ? path.join(dirOverride, base)
          : path.join(imagesRoot, String(q.year), q.subj_code, 'images', 'images', base);
        const destDir = path.join(appDir, 'images', subjKey);
        fs.mkdirSync(destDir, { recursive: true });
        if (fs.existsSync(src)) {
          const dest = path.join(destDir, base);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
          return 'images/' + subjKey + '/' + base;
        }
        console.warn('⚠ 圖片缺失: ' + src);
        return null;
      }).filter(Boolean);
      img = mapped.length ? mapped.join('；') : null;
    }
    return {
      id: q.id,
      subj: subjKey,
      year: q.year,
      session: q.session || '',
      qno: q.qno,
      stem: q.stem,
      opts: [q.opt_a, q.opt_b, q.opt_c, q.opt_d],
      ans: q.answer_final,
      ansText: q.answer_text,
      note: q.correction_note || null,
      img,
    };
  });
  // 圖片選項支援: 選項全為空白但有圖片時(如 Hill's model 圖形題), 以圖片作為選項
  let optImgCount = 0;
  for (const q of questions) {
    const hasText = (q.opts || []).some(o => o && String(o).trim());
    if (!hasText && q.img) {
      const imgs = q.img.split('；').filter(Boolean);
      // 優先使用 _選項X 命名(由 _crop_opt.js 產出): 依 A-D 排序
      const optMap = { A: null, B: null, C: null, D: null };
      for (const f of imgs) {
        const m = f.match(/_選項([ABCD])\.png$/);
        if (m && optMap[m[1]] === null) optMap[m[1]] = f;
      }
      const optImgs = ['A','B','C','D'].map(L => optMap[L]).filter(Boolean);
      if (optImgs.length >= 2) {
        q.optIsImg = true;
        q.opts = optImgs;
        optImgCount++;
      } else if (imgs.length >= 2) {
        q.optIsImg = true;
        q.opts = imgs.slice(0, 4);
        optImgCount++;
      }
    }
  }
  fs.writeFileSync(path.join(appDir, 'data', 'questions.json'), JSON.stringify(questions), 'utf8');

  const imgCount = questions.filter(q => q.img).length;
  console.log('完成! 考試類型: ' + examTypes.length + ' | 科目: ' + subjects.length + ' | 題數: ' + questions.length + ' | 有圖題數: ' + imgCount);
  console.log('輸出: ' + path.join(appDir, 'data', 'meta.json') + ' / questions.json / images/');
}
main().catch(e => { console.error('失敗:', e && e.stack || e.message); process.exit(1); });
