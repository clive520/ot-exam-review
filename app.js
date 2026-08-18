/* ============================================================
 * 國考衝刺複習 App — 職能治療師（可擴充多國考）
 * 純前端：讀取 data/meta.json + data/questions.json
 * 作答紀錄：localStorage（本機）＋ Firebase（登入後雲端同步，選用）
 * ============================================================ */
'use strict';

/* ---------------- 全域狀態 ---------------- */
const LS_KEY = 'ot_review_attempts_v1';
let META = null;          // { examTypes, subjects, totalQuestions }
let QUESTIONS = [];       // 題目陣列
let attempts = loadAttempts(); // [{qid, ok, picked, ts}]
let practice = {
  subjCodes: [],
  mode: 'random',         // 'random' | 'order' | 'wrong'
  queue: [],              // 題目索引(於 QUESTIONS 的 index)
  idx: 0,
  session: { total: 0, correct: 0, wrong: [] },
  finished: false,
};
let fb = null;            // Firebase 狀態
let isAdmin = false;      // 是否為管理員
let reportTarget = null;  // 目前回報的題目物件

/* ---------------- 儲存層（localStorage） ---------------- */
function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch (e) { return []; }
}
function saveAttempts() {
  localStorage.setItem(LS_KEY, JSON.stringify(attempts));
  if (fb && fb.user) fb.pushAttempts();   // 雲端同步(防抖)
}
function latestAttempt(qid) {
  let hit = null;
  for (const a of attempts) if (a.qid === qid && (!hit || a.ts > hit.ts)) hit = a;
  return hit;
}
function subjectOf(key) { return META.subjects.find(s => s.key === key); }
function subjectByYearCode(year, code) {
  return META.subjects.find(s => s.year === year && s.code === code);
}

/* ---------------- 載入資料 ---------------- */
async function loadData() {
  const [metaRes, qRes] = await Promise.all([
    fetch('data/meta.json'), fetch('data/questions.json'),
  ]);
  META = await metaRes.json();
  QUESTIONS = await qRes.json();
  keyMeta = new Map(META.subjects.map(s => [s.key, s]));
  document.getElementById('view-home').dataset.ready = '1';
  renderHome();
}

/* ---------------- 視圖切換 ---------------- */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'home') renderHome();
  if (name === 'practice') renderPracticeShell();
  if (name === 'wrong') renderWrong();
  if (name === 'stats') renderStats();
  if (name === 'admin') renderAdmin();
  window.scrollTo(0, 0);
}
function goHome() { nav = { examCode: null, year: null, session: '' }; practice.subjCodes = []; showView('home'); }

/* ---------------- 首頁：三層導覽（國考 → 年度 → 科目） ---------------- */
let nav = { examCode: null, year: null, session: '' };
let keyMeta = new Map(); // subj key → subject 物件

function renderHome() {
  const el = document.getElementById('homeContent');
  if (!META) { el.innerHTML = '<div class="empty-tip">載入題庫中…</div>'; return; }
  if (!nav.examCode) { renderExamList(el); return; }
  if (!nav.year) { renderYearList(el); return; }
  renderSubjectList(el);
  const subjCount = META.subjects.filter(s => s.examCode === nav.examCode && s.year === nav.year && (s.session || '') === nav.session).length;
  if (subjCount === 0) { nav.year = null; nav.session = ''; renderYearList(el); }
}
function selectExam(code) { nav.examCode = code; nav.year = null; nav.session = ''; practice.subjCodes = []; renderHome(); }
function selectYear(y, session) { nav.year = y; nav.session = session || ''; practice.subjCodes = []; renderHome(); }
function sessionLabel(s) {
  if (!s) return '';
  if (s === '01') return '第一次';
  if (s === '02') return '第二次';
  return '第' + s + '次';
}

/* ---- 進度計算：完成 = 最新作答且答對 ---- */
function progressOf(filterFn) {
  const latest = new Map();
  for (const a of attempts) {
    const prev = latest.get(a.qid);
    if (!prev || a.ts > prev.ts) latest.set(a.qid, a);
  }
  let total = 0, done = 0, attempted = 0;
  for (const q of QUESTIONS) {
    if (!filterFn(q)) continue;
    total++;
    const a = latest.get(q.id);
    if (a) { attempted++; if (effectiveOk(a)) done++; }
  }
  const pct = total ? Math.round(done / total * 100) : 0;
  const rate = attempted ? Math.round(done / attempted * 100) : 0;
  return { total, done, attempted, pct, rate };
}
function barColor(pct) { return pct < 34 ? 'var(--bad)' : pct < 67 ? '#f59e0b' : 'var(--ok)'; }
function progressBarHTML(pct) {
  return '<div class="card-progress"><div style="width:' + pct + '%;background:' + barColor(pct) + '"></div></div>';
}
function progressMetaHTML(p) {
  return '<div class="nav-meta">答對 ' + p.done + ' / ' + p.total + ' 題' +
    (p.attempted ? ' · 作答 ' + p.attempted + ' 題 · 答對率 ' + p.rate + '%' : '') + '</div>';
}
function navCardHTML(title, filterFn, onclick) {
  const p = progressOf(filterFn);
  const done = p.total > 0 && p.pct >= 100;
  return '<div class="card nav-card" onclick="' + onclick + '">' +
    '<div class="nav-head"><div class="nav-card-title">' + title + '</div>' +
    (done ? '<span class="badge-ok">✅ 已完成</span>' : '<span class="nav-pct">' + p.pct + '%</span>') + '</div>' +
    progressBarHTML(p.pct) + progressMetaHTML(p) + '</div>';
}
function breadcrumbHTML(examName, year, session) {
  let h = '<div class="breadcrumb">🏠 <a href="javascript:void(0)" onclick="goHome()">國考</a>';
  if (year !== null && year !== undefined) {
    h += ' › <a href="javascript:void(0)" onclick="selectExam(\'' + nav.examCode + '\')">' + examName + '</a>';
    h += ' › <b>' + year + ' 年' + sessionLabel(session || '') + '</b>';
  } else {
    h += ' › <b>' + examName + '</b>';
  }
  return h + '</div>';
}

function renderExamList(el) {
  let html = '<div class="exam-group-title">選擇國考認證</div>';
  for (const exam of META.examTypes) {
    html += navCardHTML('🏥 ' + exam.name,
      q => (keyMeta.get(q.subj) || {}).examCode === exam.code,
      'selectExam(\'' + exam.code + '\')');
  }
  const updated = META.exportedAt ? new Date(META.exportedAt).toLocaleDateString('zh-TW') : '';
  html += '<div class="card" style="font-size:12px;color:var(--muted)">📚 題庫共 <b>' + META.totalQuestions + '</b> 題 · 資料更新：' + updated +
    ' · <a href="javascript:void(0)" onclick="showHelp()" style="color:var(--primary)">使用說明</a></div>';
  el.innerHTML = html;
}
function renderYearList(el) {
  const exam = META.examTypes.find(e => e.code === nav.examCode);
  // 依 (年度, 場次) 分組
  const groups = [];
  const seen = new Set();
  for (const s of META.subjects.filter(x => x.examCode === nav.examCode)) {
    const gkey = s.year + '|' + (s.session || '');
    if (!seen.has(gkey)) { seen.add(gkey); groups.push({ year: s.year, session: s.session || '' }); }
  }
  groups.sort((a, b) => b.year - a.year || String(a.session).localeCompare(String(b.session)));
  let html = breadcrumbHTML(exam.name, null);
  html += '<div class="exam-group-title">選擇年度</div>';
  for (const g of groups) {
    const title = '🗓 ' + g.year + ' 年' + sessionLabel(g.session);
    html += navCardHTML(title,
      q => q.year === g.year && (q.session || '') === g.session && (keyMeta.get(q.subj) || {}).examCode === nav.examCode,
      'selectYear(' + g.year + ', \'' + g.session + '\')');
  }
  el.innerHTML = html;
}
function renderSubjectList(el) {
  const exam = META.examTypes.find(e => e.code === nav.examCode);
  const subs = META.subjects.filter(s => s.examCode === nav.examCode && s.year === nav.year && (s.session || '') === nav.session)
    .sort((a, b) => a.code.localeCompare(b.code));
  let html = breadcrumbHTML(exam.name, nav.year, nav.session);
  html += '<div class="exam-group-title">' + nav.year + ' 年' + sessionLabel(nav.session) + '科目（可多選）</div><div class="subj-grid">';
  for (const s of subs) {
    const p = progressOf(q => q.subj === s.key);
    const sel = practice.subjCodes.includes(s.key) ? ' selected' : '';
    html += '<div class="subj-card' + sel + '" onclick="toggleSubject(\'' + s.key + '\')">' +
      '<div class="subj-name">' + s.name + '</div>' +
      progressBarHTML(p.pct) +
      '<div class="subj-meta">' + progressMetaHTML(p) + '</div></div>';
  }
  html += '</div>';
  const wrongCount = wrongQuestionIds().length;
  html += '<div class="card mode-box"><h3>練習模式</h3><div class="mode-row">' +
    '<div class="mode-btn' + (practice.mode === 'random' ? ' selected' : '') + '" onclick="setMode(\'random\')">🎲 隨機出題</div>' +
    '<div class="mode-btn' + (practice.mode === 'order' ? ' selected' : '') + '" onclick="setMode(\'order\')">🔢 依序練習</div>' +
    '<div class="mode-btn' + (practice.mode === 'wrong' ? ' selected' : '') + '" onclick="setMode(\'wrong\')">📕 錯題重練' +
    (wrongCount ? '（' + wrongCount + '）' : '') + '</div></div>' +
    '<button class="btn-primary" onclick="startPractice()" ' +
    (practice.subjCodes.length === 0 ? 'disabled' : '') + '>開始練習</button></div>';
  el.innerHTML = html;
}
function toggleSubject(code) {
  const i = practice.subjCodes.indexOf(code);
  if (i >= 0) practice.subjCodes.splice(i, 1);
  else practice.subjCodes.push(code);
  renderHome();
}
function setMode(m) { practice.mode = m; renderHome(); }

/* ---------------- 練習 ---------------- */
function buildQueue() {
  const qs = QUESTIONS.filter(q => practice.subjCodes.includes(q.subj));
  let list;
  if (practice.mode === 'wrong') {
    const wrongIds = new Set(wrongQuestionIds());
    list = qs.filter(q => wrongIds.has(q.id));
  } else {
    list = qs.slice();
  }
  if (practice.mode === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else {
    list.sort((a, b) => (a.subj + String(a.qno)).localeCompare(b.subj + String(b.qno)));
  }
  return list;
}
function startPractice() {
  if (practice.subjCodes.length === 0) return;
  practice.queue = buildQueue();
  practice.idx = 0;
  practice.session = { total: 0, correct: 0 };
  practice.finished = false;
  showView('practice');
  renderPracticeShell();
}
function renderPracticeShell() {
  const el = document.getElementById('practiceContent');
  if (practice.finished) { renderPracticeSummary(); return; }
  if (practice.idx >= practice.queue.length) {
    practice.finished = true;
    renderPracticeSummary();
    return;
  }
  const q = practice.queue[practice.idx];
  const done = practice.idx;
  const total = practice.queue.length;
  el.innerHTML =
    '<div class="practice-top"><span>' + q.year + ' 年 · ' + subjectOf(q.subj).name + ' 第 ' + q.qno + ' 題</span>' +
    '<span>第 ' + (done + 1) + ' / ' + total + ' 題</span></div>' +
    '<div class="card q-card"><div class="q-head">✅ ' + practice.session.correct + ' 答對 · ❌ ' +
    (done - practice.session.correct) + ' 答錯</div>' +
    '<div class="q-stem">' + esc(q.stem) + '</div>' +
    (q.img ? '<img class="q-img" src="' + q.img.split('；')[0] + '" alt="題目圖片">' : '') +
    '<ul class="opt-list">' + ['A','B','C','D'].map((L, i) =>
      '<li class="opt-item" data-opt="' + L + '" onclick="answer(\'' + L + '\')">' +
      '<span class="opt-letter">' + L + '</span><span>' + esc(q.opts[i] || '') + '</span></li>'
    ).join('') + '</ul>' +
    '<div id="resultBox"></div>' +
    '<button class="report-btn" onclick="reportQuestion(' + q.id + ')">⚠ 回報問題</button>' +
    '<div class="progress-bar"><div style="width:' + (done / total * 100) + '%"></div></div></div>';
}
function answer(letter) {
  const q = practice.queue[practice.idx];
  const correctLetters = q.ans; // 可能多選,如 'CD' → 答任一即對
  const ok = correctLetters.includes(letter);
  practice.session.total++;
  if (ok) practice.session.correct++;
  attempts.push({ qid: q.id, ok, picked: letter, ts: Date.now() });
  saveAttempts();

  const opts = ['A','B','C','D'];
  document.querySelectorAll('.opt-item').forEach(item => {
    const L = item.dataset.opt;
    item.classList.add('disabled');
    if (correctLetters.includes(L)) item.classList.add('correct');
    else if (L === letter) item.classList.add('wrong');
  });
  const rb = document.getElementById('resultBox');
  let noteHtml = '';
  if (q.note) noteHtml = '<div class="r-note">📝 更正備註：' + esc(q.note) + '</div>';
  rb.innerHTML = '<div class="result-box ' + (ok ? 'ok' : 'bad') + '">' +
    '<div class="r-title">' + (ok ? '🎉 答對了！' : '❌ 答錯了') + '</div>' +
    '<div>正確答案：<b>' + q.ans.split('').join('、') + '</b>　' + esc(q.ansText) + '</div>' +
    noteHtml + '</div>' +
    '<button class="btn-primary" style="margin-top:10px" onclick="nextQ()">' +
    (practice.idx + 1 >= practice.queue.length ? '完成本輪' : '下一題 →') + '</button>';
}
function nextQ() { practice.idx++; renderPracticeShell(); }
function renderPracticeSummary() {
  const s = practice.session;
  const el = document.getElementById('practiceContent');
  const wrongIds = wrongQuestionIds();
  el.innerHTML = '<div class="card"><h3>本輪完成 🎉</h3>' +
    '<div class="stat-grid"><div class="stat-box"><div class="num">' + s.total + '</div><div class="lbl">作答</div></div>' +
    '<div class="stat-box"><div class="num">' + s.correct + '</div><div class="lbl">答對</div></div>' +
    '<div class="stat-box"><div class="num">' + (s.total ? Math.round(s.correct / s.total * 100) : 0) + '%</div><div class="lbl">正確率</div></div></div>' +
    '<button class="btn-primary" onclick="startPractice()">再練一次</button>' +
    '<button class="btn-secondary" onclick="showView(\'home\')">返回科目選擇</button>' +
    (wrongIds.length ? '<button class="btn-secondary" onclick="setMode(\'wrong\');renderHome();showView(\'home\')">錯題重練（' + wrongIds.length + '）</button>' : '') +
    '</div>';
}

/* ---------------- 錯題本 ---------------- */
// 每題最新作答
function latestAttempts() {
  const map = new Map();
  for (const a of attempts) {
    const prev = map.get(a.qid);
    if (!prev || a.ts > prev.ts) map.set(a.qid, a);
  }
  return [...map.values()];
}
// 以「目前答案」重新判定對錯（避免舊資料/題號位移造成的過期 ok 旗標）
function effectiveOk(a) {
  const q = QUESTIONS.find(x => x.id === a.qid);
  if (!q) return false;
  return q.ans.includes(a.picked || '');
}
function wrongQuestionIds() {
  return latestAttempts().filter(a => !effectiveOk(a)).map(a => a.qid);
}
function renderWrong() {
  const el = document.getElementById('wrongContent');
  const ids = wrongQuestionIds();
  if (!ids.length) { el.innerHTML = '<div class="empty-tip">🎉 目前沒有錯題，繼續加油！</div>'; return; }
  const bySubj = {};
  for (const qid of ids) {
    const q = QUESTIONS.find(x => x.id === qid);
    if (!q) continue;
    (bySubj[q.subj] = bySubj[q.subj] || []).push(q);
  }
  let html = '<div class="card"><h3>📕 錯題本（' + ids.length + ' 題）</h3>' +
    '<button class="btn-primary" onclick="setMode(\'wrong\');startPractice()">重練全部錯題</button></div>';
  for (const code of Object.keys(bySubj).sort()) {
    const subj = subjectOf(code);
    html += '<div class="card"><h3>' + subj.name + '（' + bySubj[code].length + '）</h3>';
    for (const q of bySubj[code]) {
      const a = latestAttempt(q.id);
      html += '<div class="wrong-item" style="padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;cursor:pointer" onclick="reviewOne(' + q.id + ')"><b>第 ' + q.qno + ' 題</b><br><span class="q-preview">' + esc(q.stem.slice(0, 40)) + '…</span></div>' +
        '<span class="badge">你答 ' + a.picked + ' · 正解 ' + q.ans + '</span>' +
        '<button class="mini-btn" style="margin-left:4px" onclick="reportQuestion(' + q.id + ')">⚠</button></div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}
function reviewOne(qid) {
  const q = QUESTIONS.find(x => x.id === qid);
  if (!q) return;
  practice.subjCodes = [q.subj];
  practice.mode = 'order';
  practice.queue = [q];
  practice.idx = 0;
  practice.session = { total: 0, correct: 0 };
  practice.finished = false;
  showView('practice');
  renderPracticeShell();
}

/* ---------------- 統計 ---------------- */
function renderStats() {
  const el = document.getElementById('statsContent');
  const map = new Map();
  for (const a of attempts) {
    const prev = map.get(a.qid);
    if (!prev || a.ts > prev.ts) map.set(a.qid, a);
  }
  const latest = [...map.values()];
  const total = latest.length;
  const correct = latest.filter(a => effectiveOk(a)).length;
  const bySubj = {};
  for (const a of latest) {
    const q = QUESTIONS.find(x => x.id === a.qid);
    if (!q) continue;
    (bySubj[q.subj] = bySubj[q.subj] || []).push(a);
  }
  let html = '<div class="card"><h3>📊 我的統計</h3>' +
    '<div class="stat-grid"><div class="stat-box"><div class="num">' + total + '</div><div class="lbl">已作答</div></div>' +
    '<div class="stat-box"><div class="num">' + correct + '</div><div class="lbl">答對</div></div>' +
    '<div class="stat-box"><div class="num">' + (total ? Math.round(correct / total * 100) : 0) + '%</div><div class="lbl">正確率</div></div></div>';
  const codes = Object.keys(bySubj).sort();
  if (!codes.length) html += '<div class="empty-tip">還沒有作答紀錄，開始練習吧！</div>';
  for (const code of codes) {
    const arr = bySubj[code];
    const ok = arr.filter(a => effectiveOk(a)).length;
    const pct = Math.round(ok / arr.length * 100);
    html += '<div class="bar-row"><div class="bar-name">' + subjectOf(code).name + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="bar-pct">' + pct + '%</div></div>';
  }
  html += '<div style="display:flex;gap:8px;margin-top:10px">' +
    '<button class="btn-secondary" style="margin-top:0;flex:1" onclick="exportAttempts()">📤 匯出紀錄</button>' +
    '<button class="btn-secondary" style="margin-top:0;flex:1" onclick="document.getElementById(\'importFile\').click()">📥 匯入紀錄</button>' +
    '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importAttempts(this)">' +
    '</div>' +
    '<button class="btn-secondary" onclick="clearAttempts()">清除本機作答紀錄</button>' +
    (fb && fb.user ? '<div style="margin-top:10px;font-size:12px;color:var(--muted)">我的使用者 ID：<code id="myUid" style="word-break:break-all">' + fb.user.uid + '</code> <button class="mini-btn" onclick="navigator.clipboard.writeText(document.getElementById(\'myUid\').textContent);alert(\'已複製\')">複製</button></div>' : '') +
    '</div>';
  el.innerHTML = html;
}
function exportAttempts() {
  const blob = new Blob([JSON.stringify({ app: 'ot-exam-review', exportedAt: new Date().toISOString(), attempts }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ot-review-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importAttempts(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const arr = Array.isArray(data) ? data : (data.attempts || []);
      if (!arr.length || !arr.every(a => a && typeof a.qid === 'number' && typeof a.ok === 'boolean')) {
        throw new Error('格式不符');
      }
      const existing = new Set(attempts.map(a => a.qid + '|' + a.ts));
      let added = 0;
      for (const a of arr) {
        if (!existing.has(a.qid + '|' + a.ts)) { attempts.push({ qid: a.qid, ok: a.ok, picked: a.picked || '', ts: a.ts }); added++; }
      }
      attempts.sort((a, b) => a.ts - b.ts);
      saveAttempts();
      renderStats();
      alert('✅ 已匯入 ' + added + ' 筆紀錄（重複已略過）');
    } catch (e) {
      alert('匯入失敗：檔案格式不正確');
    }
    input.value = '';
  };
  reader.readAsText(file);
}
function clearAttempts() {
  if (!confirm('確定清除本機全部作答紀錄？')) return;
  attempts = [];
  saveAttempts();
  renderStats();
}

/* ---------------- Firebase 整合（選用，Phase 5b） ----------------
 * 啟用方式：編輯 firebase-config.js 填入專案設定。
 * 登入後：作答紀錄同步到 Firestore 的 users/{uid}/attempts
 */
async function initFirebase() {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) return;
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    fb = {
      auth: firebase.auth(),
      db: firebase.firestore(),
      user: null,
      timer: null,
      pushAttempts: () => {
        if (fb.timer) clearTimeout(fb.timer);
        fb.timer = setTimeout(syncToCloud, 800);
      },
    };
    fb.auth.onAuthStateChanged(async user => {
      fb.user = user;
      isAdmin = false;
      renderAuth();
      if (user) {
        try {
          const doc = await fb.db.collection('admins').doc(user.uid).get();
          isAdmin = doc.exists;
        } catch (e) { isAdmin = false; }
        await syncFromCloud();
      }
      renderAdminTab();
    });
    renderAuth();
  } catch (e) { console.warn('Firebase 初始化失敗', e); }
}
function renderAuth() {
  const el = document.getElementById('authArea');
  if (!fb) { el.innerHTML = ''; return; }
  if (fb.user) {
    el.innerHTML = '<span class="user">👤 ' + esc(fb.user.displayName || fb.user.email || '考生') + '</span>' +
      '<button onclick="fb.auth.signOut()">登出</button>';
  } else {
    el.innerHTML = '<button onclick="fb.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())">🔑 Google 登入</button>';
  }
}
function renderAdminTab() {
  const tab = document.getElementById('tab-admin');
  if (tab) tab.style.display = isAdmin ? '' : 'none';
}

/* ---------------- 問題回報（登入後可用） ---------------- */
function reportQuestion(qid) {
  if (!fb || !fb.user) {
    alert('回報問題需要先登入（右上角「🔑 Google 登入」）。\n\n登入後即可回報，方便我們跟你確認問題細節。');
    return;
  }
  const q = QUESTIONS.find(x => x.id === qid);
  if (!q) return;
  reportTarget = q;
  const subj = subjectOf(q.subj);
  document.getElementById('reportSubj').textContent =
    (subj ? subj.name : q.subj) + '（' + q.year + ' 年）第 ' + q.qno + ' 題';
  document.getElementById('reportStem').textContent = q.stem.slice(0, 80) + (q.stem.length > 80 ? '…' : '');
  document.getElementById('reportType').value = '其他';
  document.getElementById('reportDesc').value = '';
  document.getElementById('reportModal').classList.add('open');
}
function closeReport() {
  document.getElementById('reportModal').classList.remove('open');
  reportTarget = null;
}
async function submitReport() {
  if (!reportTarget) return;
  const type = document.getElementById('reportType').value;
  const desc = document.getElementById('reportDesc').value.trim();
  if (!desc) { alert('請填寫問題說明'); return; }
  const btn = document.getElementById('reportSubmit');
  btn.disabled = true;
  try {
    await fb.db.collection('reports').add({
      questionId: reportTarget.id,
      year: reportTarget.year,
      subjectCode: reportTarget.subj,
      qno: reportTarget.qno,
      type,
      description: desc,
      reporterUid: fb.user.uid,
      reporterName: fb.user.displayName || fb.user.email || '考生',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      handledAt: null,
      handlerNote: '',
    });
    closeReport();
    alert('✅ 回報已送出，感謝你協助改善題庫！');
  } catch (e) {
    console.error('回報失敗', e);
    alert('回報送出失敗：' + (e.message || e) + '\n\n若 Firestore 尚未建立，請先到 Firebase Console 建立資料庫。');
  }
  btn.disabled = false;
}

/* ---------------- 管理後台（僅管理員） ---------------- */
let reportsUnsub = null;
function renderAdmin() {
  const el = document.getElementById('adminContent');
  if (!fb || !fb.user) {
    el.innerHTML = '<div class="empty-tip">請先登入管理員帳號</div>';
    return;
  }
  if (!isAdmin) {
    el.innerHTML = '<div class="empty-tip">你沒有管理員權限</div>';
    return;
  }
  el.innerHTML = '<div class="empty-tip">載入回報中…</div>';
  if (reportsUnsub) reportsUnsub();
  reportsUnsub = fb.db.collection('reports')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(snap => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      const pending = items.filter(r => r.status === 'pending').length;
      let html = '<div class="card"><h3>📥 問題回報管理（待處理 ' + pending + ' / 共 ' + items.length + '）</h3></div>';
      if (!items.length) html += '<div class="empty-tip">目前沒有回報</div>';
      for (const r of items) {
        const t = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : null;
        const timeStr = t ? t.toLocaleString('zh-TW') : '';
        const statusLabel = { pending: '待處理', confirmed: '已確認', fixed: '已修正', rejected: '不處理' }[r.status] || r.status;
        const statusClass = { pending: 'badge', confirmed: 'badge', fixed: 'badge-ok', rejected: 'badge' }[r.status] || 'badge';
        html += '<div class="card admin-report" style="border-left:4px solid ' +
          (r.status === 'pending' ? 'var(--bad)' : r.status === 'fixed' ? 'var(--ok)' : 'var(--border)') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<b>[' + esc(r.type) + '] ' + (subjectByYearCode(r.year, r.subjectCode) ? subjectByYearCode(r.year, r.subjectCode).name : r.subjectCode) +
          '（' + r.year + ' 年）第 ' + r.qno + ' 題</b>' +
          '<span class="' + statusClass + '">' + statusLabel + '</span></div>' +
          '<div class="q-preview" style="font-size:12px;color:var(--muted);margin-bottom:6px">' + timeStr + ' · 回報人：' + esc(r.reporterName || '未知') + '</div>' +
          '<div style="font-size:13px;margin-bottom:8px">' + esc(r.description) + '</div>' +
          (r.handlerNote ? '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">📝 處理註記：' + esc(r.handlerNote) + '</div>' : '') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<input id="note-' + r.id + '" placeholder="處理註記(選填)" style="flex:1;min-width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px">' +
          '<button class="mini-btn" onclick="setReportStatus(\'' + r.id + '\',\'confirmed\')">✓ 確認</button>' +
          '<button class="mini-btn ok" onclick="setReportStatus(\'' + r.id + '\',\'fixed\')">🔧 已修正</button>' +
          '<button class="mini-btn bad" onclick="setReportStatus(\'' + r.id + '\',\'rejected\')">✕ 不處理</button>' +
          '</div></div>';
      }
      el.innerHTML = html;
    }, err => {
      el.innerHTML = '<div class="empty-tip">載入失敗：' + esc(err.message) + '<br>（確認 Firestore 已建立、規則已發佈、你是管理員）</div>';
    });
}
async function setReportStatus(id, status) {
  const note = document.getElementById('note-' + id);
  const noteText = note ? note.value.trim() : '';
  try {
    await fb.db.collection('reports').doc(id).update({
      status,
      handledAt: firebase.firestore.FieldValue.serverTimestamp(),
      handlerNote: noteText || firebase.firestore.FieldValue.delete(),
    });
  } catch (e) { alert('更新失敗：' + e.message); }
}

async function syncToCloud() {
  if (!fb || !fb.user) return;
  try {
    await fb.db.collection('users').doc(fb.user.uid).set({
      attempts: attempts.map(a => ({ qid: a.qid, ok: a.ok, picked: a.picked, ts: a.ts })),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('同步失敗', e); }
}
async function syncFromCloud() {
  if (!fb || !fb.user) return;
  try {
    const doc = await fb.db.collection('users').doc(fb.user.uid).get();
    if (doc.exists && doc.data().attempts) {
      const cloud = doc.data().attempts;
      const merged = new Map();
      for (const a of attempts) merged.set(a.qid + '|' + a.ts, a);
      for (const a of cloud) if (!merged.has(a.qid + '|' + a.ts)) attempts.push(a);
      attempts.sort((a, b) => a.ts - b.ts);
      saveAttempts();
      renderStats();
    }
  } catch (e) { console.warn('讀取雲端失敗', e); }
}

/* ---------------- 使用說明 ---------------- */
function showHelp() {
  const help = [
    ['🎲 隨機出題', '從選定科目隨機抽題，適合衝刺複習'],
    ['🔢 依序練習', '按題號順序練習，適合地毯式掃題'],
    ['📕 錯題重練', '只練答錯過的題目，直到答對為止'],
    ['📊 統計', '各科正確率與作答量，找出弱點科目'],
    ['🔑 Google 登入', '登入後作答紀錄雲端同步，換手機/電腦不遺失'],
    ['⚠ 回報問題', '發現題目有誤可即時回報（需登入）'],
    ['📤 匯出/📥 匯入', '未登入時可備份本機紀錄（統計頁）'],
  ];
  const list = help.map(([t, d]) => '<b>' + t + '</b>：' + d + '<br>').join('');
  const box = document.createElement('div');
  box.className = 'modal-overlay open';
  box.style.cssText = 'display:flex;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);align-items:center;justify-content:center;padding:16px';
  box.innerHTML = '<div class="modal"><h3>📖 使用說明</h3><div style="font-size:14px;line-height:2">' + list +
    '</div><div class="modal-btns"><button class="btn-primary" style="margin-top:0" onclick="this.closest(\'.modal-overlay\').remove()">知道了</button></div></div>';
  document.body.appendChild(box);
}

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------- 啟動 ---------------- */
loadData();
initFirebase();
