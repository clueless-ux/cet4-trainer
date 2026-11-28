/* ================= 四级训练工作台 · 应用 ================= */
(function () {
  'use strict';

  const DAT = window.__DESK__ || { questions: [], papers: {}, units: {}, points: [] };
  const QS = DAT.questions;            // 真题（单题训练只从这里抽）
  const MQ = DAT.mq || [];             // 自建模题（只出现在模考卷里）
  const PP = DAT.papers;               // 真题卷
  const MOCKS = DAT.mocks || {};       // 模考卷
  const UN = DAT.units;
  const PTS = DAT.points;
  const VAULT = DAT.vault || { total: 0, byDir: {} };
  const ALLQ = QS.concat(MQ);

  const QMAP = {};
  ALLQ.forEach(q => { QMAP[q.id] = q; });
  const PMAP = {};
  PTS.forEach(p => { PMAP[p.id] = p; });
  const PAPER = Object.assign({}, PP, MOCKS);

  /* 题号顺序：听力 → 选词 → 匹配 → 阅读 → 翻译 → 写作 */
  const KORDER = { L: 0, C: 1, M: 2, R: 3, T: 4, W: 5 };
  function paperQs(key) {
    const src = MOCKS[key] ? MQ : QS;
    return src.filter(q => q.p === key).sort((a, b) => (KORDER[a.k] - KORDER[b.k]) || (a.n - b.n));
  }

  const KIND = {
    L: { n: '听力', full: '听力理解', english: 'Listening', color: '#f1ad7e' },
    C: { n: '选词', full: '选词填空', english: 'Cloze', color: '#88c4d8' },
    M: { n: '匹配', full: '长篇匹配', english: 'Matching', color: '#a2ceaa' },
    R: { n: '阅读', full: '仔细阅读', english: 'Reading', color: '#c4b0ee' },
    W: { n: '写作', full: '短文写作', english: 'Writing', color: '#eda9c2' },
    T: { n: '翻译', full: '段落翻译', english: 'Translation', color: '#efcc81' },
  };

  const CAUSES = [
    ['loc', '没定位到'],
    ['word', '词不认识'],
    ['rewrite', '被改写骗了'],
    ['trap', '被干扰项骗'],
    ['time', '时间不够'],
    ['careless', '粗心'],
  ];
  const CAUSE_NAME = {};
  CAUSES.forEach(([k, v]) => { CAUSE_NAME[k] = v; });

  const TAG_DESC = {
    '无中生有': '原文没有这个说法，选项自己编的',
    '偷换概念': '关键词在，但主语或对象被换掉了',
    '绝对化': '加了 all / only / never / must 这类绝对词，原文是有限表述',
    '张冠李戴': '关键词出现在原文别处，和本题定位句无关',
    '正反混淆': '方向反了：升↔降、支持↔反对、before↔after',
    '范围/程度偏移': '数量、程度或范围与原句不一致',
  };

  /* ================= 工具 ================= */
  const $ = s => document.querySelector(s);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  /* 扫描件里常见的粘连：句号/引号后没有空格 */
  function pretty(t) {
    return String(t || '')
      .replace(/([.!?,;:])(?=[A-Za-z])/g, '$1 ')
      .replace(/(["”])(?=[A-Za-z])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + ' 秒' : Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* 库里的笔记名（双链目标） */
  function qNote(q) {
    if (!q) return '';
    if (q.k === 'W') return q.p + ' 写作';
    if (q.k === 'T') return q.p + ' 翻译';
    return q.p + '-' + pad(q.n) + ' ' + q.ty;
  }
  function pNote(pid) { const p = PMAP[pid]; return p ? pid + ' ' + p.name : pid; }
  function dPaper(key) { return String(key).replace(/_/g, '-'); }
  function matNote(q) {
    if (q.k === 'L') return dPaper(q.p) + ' 听力音频';
    if (q.k === 'C') return dPaper(q.p) + ' 选词材料';
    if (q.k === 'M') return dPaper(q.p) + ' 匹配材料';
    if (q.k === 'R') return dPaper(q.p) + ' 阅读材料' + (q.n <= 50 ? 1 : 2);
    return '';
  }
  function paperLabel(key) { return (PAPER[key] && PAPER[key].label) || key; }

  /* 这道题以前做过吗（做过才显示，不做过不标） */
  function doneRec(id) { return S.qs[id] || null; }
  function doneChip(id) {
    const r = doneRec(id);
    if (!r) return '';
    const n = r.n || 1;
    return '<span class="chip done" title="' + (r.ts ? new Date(r.ts).toLocaleString('zh-CN') : '') + '">做过 · 上次' + (r.ok ? '对' : '错') + (n > 1 ? ' · 第 ' + n + ' 次' : '') + '</span>';
  }
  function doneDot(id) {
    const r = doneRec(id);
    if (!r) return '';
    return '<i class="dot-done ' + (r.ok ? 'ok' : 'bad') + '" title="做过 · 上次' + (r.ok ? '对' : '错') + '"></i>';
  }
  /* 一套卷做过没有 */
  function paperRec(key) { return (S.papers || {})[key] || null; }

  /* ================= 存储 ================= */
  const LS = 'cet4_desk_v1';
  let S;
  function blankStore() {
    return { v: 1, qs: {}, pts: {}, runs: [], days: {}, fav: {}, write: {}, wrong: {}, words: [], papers: {}, tapDict: false, tapTip: 0, created: Date.now() };
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return blankStore();
      const s = JSON.parse(raw);
      return Object.assign(blankStore(), s);
    } catch (e) { return blankStore(); }
  }
  /* 写入失败（无痕模式 / 配额满 / WebView 禁用存储）必须让人看见，
     否则用户以为记录还在，其实关掉页面就没了。 */
  let lastSaveAt = 0, storageOK = true;
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify(S));
      lastSaveAt = Date.now(); storageOK = true;
    } catch (e) {
      storageOK = false;
      if (!save._warned) {
        save._warned = true;
        setTimeout(() => toast('⚠ 本机存储写不进去，记录只在本次打开有效'), 300);
      }
    }
  }
  function storageProbe() {
    try {
      const k = '__probe' + Date.now();
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }
  S = load();
  /* 微信内置浏览器（鸿蒙版尤其）会接管长按、不派发 pointer 事件，长按取词基本没戏。
     所以微信里默认打开「点词即译」；用户在面板里手动关掉就不再自动打开。 */
  if (isWX() && !S.tapOff) S.tapDict = true;

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }
  function copyText(txt, okMsg) {
    const done = () => toast(okMsg || '已复制');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: (mime || 'text/markdown') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast('已下载 ' + name);
  }

  /* ================= 掌握度 ================= */
  function ptStat(id) {
    return S.pts[id] || { s: 0, r: 0, hist: [] };
  }
  function mastery(id) {
    const st = ptStat(id);
    if (!st.s) return null;
    return st.r / st.s;
  }
  function weakScore(id) {
    const st = ptStat(id);
    if (!st.s) return 0.78;                 // 没练过：排在“练过但不熟”的后面
    const recent = (st.hist || []).slice(-5);
    const rAcc = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : st.r / st.s;
    return (1 - st.r / st.s) * 0.45 + (1 - rAcc) * 0.55;
  }
  function weakPoints(n) {
    return PTS.slice()
      .filter(p => p.n > 0)
      .map(p => ({ id: p.id, sc: weakScore(p.id), seen: ptStat(p.id).s }))
      .filter(x => x.seen > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, n || 3);
  }
  function overallAcc() {
    let s = 0, r = 0;
    Object.values(S.pts).forEach(st => { s += st.s; r += st.r; });
    return s ? r / s : null;
  }
  function streak() {
    let n = 0;
    const d = new Date();
    for (; ;) {
      const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const day = S.days[k];
      if (day && day.n > 0) { n++; d.setDate(d.getDate() - 1); }
      else if (n === 0 && k === today()) { d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }

  /* ================= 组卷 ================= */
  function qWeight(q) {
    const ids = (q.pt && q.pt.length) ? q.pt : [];
    let wk = 0.7;
    if (ids.length) { wk = 0; ids.forEach(id => { wk += weakScore(id); }); wk /= ids.length; }
    let w = 1 + wk * 2.6;
    const rec = S.qs[q.id];
    if (rec) w *= rec.ok ? 0.42 : 1.75;
    if (S.wrong[q.id]) w *= 1.5;
    const p = PP[q.p];
    if (p && p.y >= 2024) w *= 1.15;          // 近两年卷优先
    return w;
  }
  function weightedPick(pool, n, used) {
    const p = pool.filter(q => !used.has(q.id));
    const out = [];
    while (out.length < n && p.length) {
      let tot = 0;
      const ws = p.map(q => { const w = qWeight(q); tot += w; return w; });
      let r = Math.random() * tot, i = 0;
      for (; i < p.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      const q = p.splice(i, 1)[0];
      out.push(q); used.add(q.id);
    }
    return out;
  }

  function buildSession(mode, size, opt) {
    opt = opt || {};
    const mcq = QS.filter(q => q.k !== 'W' && q.k !== 'T');
    let picked = [];
    const used = new Set();

    /* 还没有任何考点记录时，弱项无从谈起，退回智能组卷 */
    if (mode === 'weak' && !weakPoints(3).length) mode = 'smart';

    if (mode === 'wrong') {
      const ids = Object.keys(S.wrong).sort((a, b) => (S.wrong[b].ts || 0) - (S.wrong[a].ts || 0));
      ids.slice(0, size).forEach(id => { if (QMAP[id]) { picked.push(QMAP[id]); used.add(id); } });
      if (picked.length < size) {
        const rest = mcq.filter(q => !used.has(q.id));
        picked = picked.concat(weightedPick(rest, size - picked.length, used));
      }
    } else if (mode === 'point') {
      const pid = opt.pid;
      const pool = mcq.filter(q => (q.pt || []).indexOf(pid) >= 0);
      picked = weightedPick(pool, size, used);
    } else if (mode === 'module') {
      const k = opt.kind;
      const pool = mcq.filter(q => q.k === k);
      picked = weightedPick(pool, size, used);
    } else if (mode === 'new') {
      const fresh = mcq.filter(q => !S.qs[q.id]);
      picked = weightedPick(fresh, size, used);
      if (picked.length < size) picked = picked.concat(weightedPick(mcq, size - picked.length, used));
    } else if (mode === 'weak') {
      /* 只抽当前正确率最低的三个考点 */
      const wps = weakPoints(3).map(x => x.id);
      const pool = mcq.filter(q => (q.pt || []).some(id => wps.indexOf(id) >= 0));
      picked = weightedPick(pool, size, used);
      if (picked.length < size) {
        const rest = mcq.filter(q => !used.has(q.id));
        picked = picked.concat(weightedPick(rest, size - picked.length, used));
      }
    } else {
      // smart：按模块配额，弱项优先
      const quota = size <= 10
        ? { L: 3, C: 2, M: 2, R: 3 }
        : { L: Math.round(size * 0.28), C: Math.round(size * 0.16), M: Math.round(size * 0.16), R: size - Math.round(size * 0.28) - Math.round(size * 0.16) - Math.round(size * 0.16) };
      ['L', 'C', 'M', 'R'].forEach(k => {
        const pool = mcq.filter(q => q.k === k);
        picked = picked.concat(weightedPick(pool, quota[k] || 0, used));
      });
      picked.sort((a, b) => a.k.localeCompare(b.k) || 0);
    }

    if (!picked.length) return null;
    const ids = picked.slice(0, size).map(q => q.id);
    return { mode, pid: opt.pid || '', kind: opt.kind || '', ids, i: 0, ans: {}, cause: {}, t0: Date.now(), right: 0, done: false, size: ids.length };
  }

  /* ================= 状态 ================= */
  let view = 'desk';
  let sess = null;
  let setup = { mode: 'smart', size: 10 };
  let curPid = null;
  let writeSel = null;
  let writeRep = null;
  let writeTab = 'W';
  let wrongFilter = 'all';

  function go(v) {
    view = v;
    render();
    window.scrollTo(0, 0);
  }

  /* ================= 图标 ================= */
  const IC = {
    desk: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    train: '<path d="M6 4h12l-1 9H7L6 4z"/><path d="M8 13v6M16 13v6"/><path d="M7 19h10"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18h2"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 18h-2"/><path d="M12 4v14"/>',
    wrong: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 10h7M9 14h5"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    vault: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    write: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
    words: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5z"/><path d="M8 8h8M8 12h6"/>',
    paper: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 12h6M10 16h6"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2m-6 6h6m-6 4h6"/>',
    audio: '<path d="M3 9v6h4l5 4V5L7 9zM16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  };
  function svg(p, cls) {
    return '<svg aria-hidden="true" focusable="false" class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* ================= 框架 ================= */
  const NAV = [
    ['desk', 'Overview', '工作台', 'desk'],
    ['train', 'Practice', '训练', 'train'],
    ['write', 'Writing & Translation', '写作翻译', 'write'],
    ['brain', 'Skill Map', '考点地图', 'brain'],
    ['wrong', 'Review', '错题本', 'wrong'],
    ['words', 'Vocabulary', '单词本', 'words'],
    ['stats', 'Progress', '学习数据', 'stats'],
    ['vault', 'Obsidian', '脑库', 'vault'],
  ];

  function navButton([key, english, label, icon], mobile) {
    const page = view === 'run' || view === 'paperReview' ? 'train' : view;
    const active = page === key;
    return '<button type="button" class="' + (mobile ? 'mobile-tab' : 'nav-item') + (active ? ' on' : '') + '"' +
      (active ? ' aria-current="page"' : '') + ' onclick="DESK.go(\'' + key + '\')">' +
      (mobile ? '' : svg(IC[icon])) + '<span class="nav-label"><span lang="en">' + english + '</span>' +
      '<small>' + label + '</small></span></button>';
  }

  function rail() {
    return '<aside class="rail">' +
      '<button type="button" class="brand" onclick="DESK.go(\'desk\')"><span class="logo" aria-hidden="true">E</span>' +
      '<span><b lang="en">CET-4 Studio</b><span class="brand-sub">英语四级训练台</span></span></button>' +
      '<nav class="rail-nav" aria-label="工作台导航"><div class="nav-sep" lang="en">Study</div>' +
      NAV.slice(0, 4).map(item => navButton(item, false)).join('') +
      '<div class="nav-sep" lang="en">Library</div>' + NAV.slice(4).map(item => navButton(item, false)).join('') + '</nav>' +
      '<div class="rail-foot"><span class="rail-foot-dot" aria-hidden="true"></span><span lang="en">Offline question bank</span>' +
      '<div>' + Object.keys(PP).length + ' 套真题 · ' + PTS.length + ' 个考点</div></div></aside>';
  }

  function mobileNav() {
    const items = [...NAV.slice(0, 2), NAV[NAV.length - 1], ...NAV.slice(2, -1)];
    return '<nav class="mobilenav" aria-label="工作台导航">' + items.map(item => navButton(item, true)).join('') + '</nav>';
  }

  function topbar(crumb) {
    return '<header class="topbar"><div class="crumb">' + crumb + '</div><div class="right">' +
      '<button type="button" class="btn sm utility" onclick="DESK.search()" title="查词 / 译句">' + svg(IC.search) + '<span lang="en">Dictionary</span></button>' +
      '<button type="button" class="btn sm utility" onclick="DESK.runDiag()" title="划词与存储自检"><span lang="en">Diagnostics</span></button>' +
      '</div></header>';
  }

  /* ================= 工作台 ================= */
  const STUDY_MODULES = [
    { kind: 'L', x: 137, y: 77 },
    { kind: 'R', x: 377, y: 94 },
    { kind: 'C', x: 113, y: 238 },
    { kind: 'M', x: 373, y: 252 },
  ];

  function studyGraph() {
    return '<div class="study-graph" role="group" aria-label="选择训练专项">' +
      '<canvas id="study-graph-canvas" width="1000" height="656" aria-hidden="true"></canvas>' +
      '<div class="study-graph-core" aria-hidden="true"><span>CET</span><i></i><span>04</span></div>' +
      STUDY_MODULES.map(({ kind, x, y }) =>
        '<button type="button" class="study-node" style="--node-x:' + x / 5 + '%;--node-y:' + (y / 328 * 100).toFixed(2) + '%"' +
        ' onclick="DESK.startSetup(\'module\',10,\'' + kind + '\')"><span lang="en">' + KIND[kind].english + '</span>' +
        '<small>' + KIND[kind].full + '</small></button>').join('') + '</div>';
  }

  function drawStudyGraph() {
    const canvas = document.getElementById('study-graph-canvas');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cx = 250, cy = 164;
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.lineWidth = 0.7;
    context.setLineDash([1, 4]);
    context.strokeStyle = 'rgba(224,207,255,.24)';
    for (const radius of [52, 89, 126, 153]) {
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([]);
    STUDY_MODULES.forEach(({ x, y }, index) => {
      const bend = index % 2 ? 22 : -22;
      context.strokeStyle = 'rgba(246,160,121,.56)';
      context.beginPath();
      context.moveTo(cx, cy);
      context.quadraticCurveTo((cx + x) / 2 + bend, (cy + y) / 2 - bend, x, y);
      context.stroke();
    });
    // A fixed golden-angle sequence keeps the particle field stable between renders.
    for (let i = 1; i <= 420; i++) {
      const angle = i * 2.399963 + 0.42 * Math.sin(i * .03);
      const distance = 160 * Math.sqrt(i / 420) + 9 * Math.sin(angle * 4);
      const opacity = .13 + .55 * ((i * 17 % 37) / 37);
      context.fillStyle = i % 5 ? 'rgba(178,164,224,' + opacity + ')' : 'rgba(255,166,114,' + opacity + ')';
      context.beginPath();
      context.arc(cx + Math.cos(angle) * distance * 1.16, cy + Math.sin(angle) * distance * .76, i % 17 ? .76 : 1.45, 0, Math.PI * 2);
      context.fill();
    }
  }

  function viewDesk() {
    const day = S.days[today()] || { n: 0, r: 0 };
    const acc7 = acc7days();
    const wrong = Object.keys(S.wrong).length;
    const preview = previewSet();
    const recent = S.runs.slice(-5).reverse();
    const papers = Object.keys(S.papers || {}).sort((a, b) => (S.papers[b].ts || 0) - (S.papers[a].ts || 0)).slice(0, 3);

    let h = '<div class="wrap desk-home"><section class="hero" aria-labelledby="desk-title">' +
      '<div class="hero-copy"><div class="hero-meta" lang="en">College English Test <span></span> Band 4</div>' +
      '<h1 id="desk-title" lang="en">English <em>Workbench</em></h1>' +
      '<p>按考点练真题，按考试节奏做模考。<br>把值得回看的错题和笔记收进 Obsidian。</p><div class="acts">' +
      '<button class="btn lg hero-primary" onclick="DESK.startSetup(\'smart\',10)"><span><span lang="en">Start practice</span><small>开始训练</small></span>' + svg(IC.arrow) + '</button>' +
      '<button class="btn lg hero-secondary" onclick="DESK.openPapers()"><span><span lang="en">Mock exams</span><small>套卷模考</small></span></button>' +
      '</div></div>' + studyGraph() + '</section>';

    h += '<div class="stats desk-stats">' +
      statCard('今日训练', day.n, '题', day.n ? '答对 ' + day.r + ' 题' : '今日还未作答', IC.paper, '', 'Today') +
      statCard('近 7 天正确率', acc7 == null ? '—' : Math.round(acc7 * 100), acc7 == null ? '' : '%', acc7 == null ? '暂无作答记录' : '每题取最近一次', IC.target, '', '7-day accuracy') +
      statCard('连续训练', streak(), '天', '', IC.stats, '', 'Current streak') +
      statCard('待重练错题', wrong, '题', '', IC.wrong, 'DESK.quickWrong()', 'Review queue') + '</div>';

    h += '<div class="desk-grid"><div class="desk-stack">' +
      '<section class="card desk-panel"><div class="desk-panel-head">' +
      '<div class="grow"><h2><span lang="en">Daily Practice</span><small>今日推荐</small></h2><p>' + preview.title + '</p></div>' +
      '<button class="btn pri" onclick="DESK.startSetup(\'smart\',10)">练这组' + svg(IC.arrow) + '</button></div>' +
      '<div class="desk-panel-note small">' + preview.desc + '</div>' +
      '<div class="desk-questions">' + preview.list + '</div></section>';

    h += '<section class="card desk-panel"><div class="desk-panel-head"><h2><span lang="en">Recent Activity</span><small>最近训练</small></h2>' +
      '<button class="btn sm ghost" onclick="DESK.go(\'stats\')">查看数据' + svg(IC.arrow) + '</button></div>';
    if (recent.length) {
      h += '<div class="desk-table"><table class="t"><thead><tr><th>时间</th><th>方式</th><th class="num">题量</th><th class="num">正确率</th><th class="num">用时</th></tr></thead><tbody>' +
        recent.map(r => {
          const acc = r.n ? r.right / r.n : null;
          return '<tr><td class="dim mono">' + r.date + ' ' + pad(r.hh) + ':' + pad(r.mm) + '</td><td>' + esc(r.modeName) + '</td><td class="num mono">' + r.n + '</td>' +
            '<td class="num mono" style="color:' + (acc === null ? 'var(--dim)' : acc >= 0.7 ? 'var(--ok)' : 'var(--bad)') + '">' + (acc === null ? '—' : Math.round(acc * 100) + '%') + '</td>' +
            '<td class="num mono dim">' + fmtDur(r.dur) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      h += '<div class="desk-panel-note small">完成一组后，可在这里查看正确率和用时。</div>';
    }
    h += '</section>';

    h += '<section class="card desk-panel"><div class="desk-panel-head"><h2><span lang="en">Exam History</span><small>套卷记录</small></h2>' +
      '<button class="btn sm ghost" onclick="DESK.openPapers()">全部套卷' + svg(IC.arrow) + '</button></div>';
    if (papers.length) {
      h += '<div class="desk-table"><table class="t"><thead><tr><th>试卷</th><th class="num">客观题</th><th class="num">估算分</th><th class="num">日期</th><th></th></tr></thead><tbody>' +
        papers.map(key => {
          const r = S.papers[key];
          const paper = PAPER[key] || {};
          return '<tr><td>' + esc(paper.label || key) + '</td><td class="num mono">' + r.right + '/' + r.total + '</td>' +
            '<td class="num mono">' + (r.score || '—') + '</td><td class="num dim mono">' + r.date + '</td>' +
            '<td><button class="btn sm ghost" onclick="DESK.startPaper(\'' + key + '\')">再做</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      h += '<div class="desk-panel-note small">' + Object.keys(PP).length + ' 套真题与 ' + Object.keys(MOCKS).length + ' 套模考。交卷后可逐题复盘。</div>';
    }
    h += '</section></div><div class="desk-stack">';

    const weak = weakPoints(3);
    h += '<section class="card desk-panel"><div class="desk-panel-head"><h2><span lang="en">Focus Areas</span><small>薄弱考点</small></h2>' +
      '<button class="btn sm ghost" onclick="DESK.go(\'brain\')">考点地图' + svg(IC.arrow) + '</button></div>';
    if (weak.length) {
      h += '<div class="desk-weak-list">' + weak.map(item => {
        const point = PMAP[item.id] || { name: item.id };
        const rate = Math.round((mastery(item.id) || 0) * 100);
        return '<div class="desk-weak"><div class="row"><strong class="grow">' + esc(point.name) + '</strong><span class="mono">' + rate + '%</span></div>' +
          '<div class="bar"><i style="width:' + rate + '%"></i></div><div class="row"><span class="small grow">练过 ' + item.seen + ' 次</span>' +
          '<button class="btn sm ghost" onclick="DESK.startPoint(\'' + item.id + '\')">专攻</button></div></div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="desk-panel-note small">完成练习后，这里会列出优先复习的考点。</div>';
    }
    h += '</section>';

    h += '<section class="card desk-vault"><div class="desk-vault-icon">' + svg(IC.vault) + '</div>' +
      '<h2><span lang="en">Obsidian Vault</span><small>脑库</small></h2><p>导出 Markdown 复盘，放进 <code>04-复盘/</code>，串起真题和考点。</p>' +
      '<button class="btn sm ghost" onclick="DESK.go(\'vault\')">导出与导入说明' + svg(IC.arrow) + '</button></section>';

    h += '<section class="card desk-panel"><div class="desk-panel-head"><h2><span lang="en">Practice Modes</span><small>其他训练方式</small></h2></div><div class="desk-modes">' +
      modeRow('弱项专攻', '集中练正确率偏低的考点', 'weak') +
      modeRow('整块专项', '按听力、阅读等模块练习', 'module') +
      modeRow('没做过的题', '优先覆盖还没作答的真题', 'new') +
      '</div></section></div></div></div>';
    return h;
  }

  function statCard(label, value, unit, detail, icon, action, english) {
    const tag = action ? 'button' : 'div';
    return '<' + tag + ' class="stat' + (action ? ' stat-action' : '') + '"' +
      (action ? ' type="button" onclick="' + action + '"' : '') + '>' +
      '<span class="stat-head"><span class="lb">' + (english ? '<span lang="en">' + english + '</span><small>' + label + '</small>' : label) + '</span>' +
      (icon ? '<span class="stat-icon">' + svg(icon) + '</span>' : '') + '</span>' +
      '<span class="vv">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</span>' +
      (detail ? '<span class="ft">' + esc(detail) + '</span>' : '') +
      (action ? '<span class="stat-arrow">' + svg(IC.arrow) + '</span>' : '') + '</' + tag + '>';
  }

  function modeRow(name, desc, mode) {
    return '<button type="button" class="desk-mode" onclick="DESK.startSetup(\'' + mode + '\',10)">' +
      '<span class="grow"><strong>' + name + '</strong><span class="small">' + desc + '</span></span>' + svg(IC.chevron) + '</button>';
  }

  function acc7days() {
    let s = 0, r = 0;
    const now = Date.now();
    QS.forEach(q => {
      const rec = S.qs[q.id];
      if (!rec || !rec.ts) return;
      if (now - rec.ts > 7 * 864e5) return;
      s++; if (rec.ok) r++;
    });
    return s ? r / s : null;
  }
  function previewSet() {
    // 只做展示，真正开始时按权重抽
    const pool = QS.filter(q => q.k !== 'W' && q.k !== 'T');
    const usedP = new Set();
    const pickOne = k => {
      const cand = pool.filter(q => q.k === k && !usedP.has(q.p) && !S.qs[q.id]);
      const any = pool.filter(q => q.k === k && !usedP.has(q.p));
      const q = cand[0] || any[0] || pool.find(x => x.k === k);
      if (q) usedP.add(q.p);
      return q;
    };
    const list = ['L', 'C', 'M', 'R', 'R', 'L'].map(pickOne).filter(Boolean);
    return {
      title: '智能组卷 · 10 题',
      desc: '听力 3 · 选词 2 · 匹配 2 · 阅读 3，优先抽你没做过的、以及错过的考点',
      list: list.map(q => '<button type="button" class="desk-question" onclick="DESK.previewOne(\'' + q.id + '\')">' +
        '<span class="question-kind" lang="en" title="' + KIND[q.k].full + '" style="--kind:' + KIND[q.k].color + '">' + KIND[q.k].english + '</span>' +
        '<span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cut(
          q.k === 'C' ? ctxOf(q) : q.st || ('第 ' + q.n + ' 题 · ' + q.ty + ' · ' + (q.o[0] || '')), 62)) + '</span>' +
        (S.qs[q.id] ? '<span class="chip done" style="flex:0 0 auto">做过 · 上次' + (S.qs[q.id].ok ? '对' : '错') + '</span>' : '') +
        '<span class="question-point dim">' + (q.pt[0] || '') + '</span>' + svg(IC.chevron) + '</button>').join(''),
    };
  }

  /* ================= 训练设置 ================= */
  let trainTab = 'single';
  let paperTab = 'real';

  function viewTrain() {
    let h = '<div class="wrap"><div class="inner-page-head"><h1 lang="en">Practice</h1>' +
      '<div class="small" style="margin-top:6px">两种练法：<b>单题</b>按考点抽题，答完立刻看依据；<b>套卷</b>整卷计时，交卷才给分与解析。</div></div>';

    h += '<div class="segwrap"><div class="seg">' +
      '<span class="' + (trainTab === 'single' ? 'on' : '') + '" onclick="DESK.trainTab(\'single\')">单题训练</span>' +
      '<span class="' + (trainTab === 'paper' ? 'on' : '') + '" onclick="DESK.trainTab(\'paper\')">套卷模考</span>' +
      '</div></div>';

    h += trainTab === 'single' ? viewSingleSetup() : viewPaperPick();
    h += '</div>';
    return h;
  }

  function viewSingleSetup() {
    const modes = [
      ['smart', '智能组卷', '按你的薄弱考点加权抽题，四个模块混排。没有记录时按真题分布走。'],
      ['weak', '弱项专攻', '只练当前正确率最低的三个考点，错了立刻归因。'],
      ['module', '整块专项', '听力 / 选词 / 匹配 / 阅读，一次只打一块。'],
      ['new', '没做过的题', '只抽你还没答过的真题，先把覆盖面铺开。'],
      ['wrong', '错题重练', Object.keys(S.wrong).length ? '错题本里有 ' + Object.keys(S.wrong).length + ' 题，按最近错的先来。' : '错题本还是空的，先做一组。'],
    ];
    let h = '';
    h += '<h2>方式</h2><div class="modes">' + modes.map(([k, n, d]) =>
      '<div class="mode ' + (setup.mode === k ? 'on' : '') + '" onclick="DESK.setMode(\'' + k + '\')"><div class="ic">' + (k === 'smart' ? 'AUTO' : k === 'weak' ? 'WEAK' : k === 'module' ? 'BLOCK' : k === 'new' ? 'NEW' : 'REDO') + '</div>' +
      '<b>' + n + '</b><p>' + d + '</p></div>').join('') + '</div>';

    if (setup.mode === 'module') {
      h += '<h2>练哪一块</h2><div class="row wrap">' + ['L', 'C', 'M', 'R'].map(k =>
        '<button type="button" class="chip click ' + (setup.kind === k ? 'acc' : '') + '" aria-pressed="' + (setup.kind === k) +
        '" style="padding:8px 14px;font-size:13px" onclick="DESK.setKind(\'' + k + '\')"><span lang="en">' + KIND[k].english +
        '</span> · ' + KIND[k].full + '</button>').join('') + '</div>';
    }

    h += '<h2>题量</h2><div class="row wrap">' + [10, 20, 30].map(n =>
      '<div class="chip click ' + (setup.size === n ? 'acc' : '') + '" style="padding:8px 16px;font-size:13px" onclick="DESK.setSize(' + n + ')">' + n + ' 题</div>').join('') +
      '<span class="small dim" style="margin-left:6px">约 ' + Math.round(setup.size * 1.1) + ' 分钟</span></div>';

    h += '<div style="margin-top:24px"><button class="btn pri lg" onclick="DESK.startNow()">开始 →</button></div>';

    const fresh = QS.filter(q => !S.qs[q.id] && q.k !== 'W' && q.k !== 'T').length;
    h += '<h2>这一组会抽到什么</h2><div class="card"><div class="small">' +
      '每个考点按 <b>正确率 × 最近 5 次表现</b> 算弱点分，越弱越容易被抽中；答对过的题权重降到 0.42，错题 ×1.5，2024 年后的卷 +15%。' +
      '抽到<b>做过的题</b>会标出来（做过 · 上次对/错），没做过的不标——看到标记就当复习，别当成新题。' +
      '<div class="sep"></div>还没做过的真题：<b>' + fresh + '</b> 题 / 共 ' + QS.filter(q => q.k !== 'W' && q.k !== 'T').length + ' 题。</div></div>';
    return h;
  }

  /* ---------- 套卷列表 ---------- */
  function viewPaperPick() {
    let h = '<div class="segwrap" style="margin-top:4px"><div class="seg">' +
      '<span class="' + (paperTab === 'real' ? 'on' : '') + '" onclick="DESK.paperTab(\'real\')">真题套卷 ' + Object.keys(PP).length + '</span>' +
      '<span class="' + (paperTab === 'mock' ? 'on' : '') + '" onclick="DESK.paperTab(\'mock\')">模考卷 ' + Object.keys(MOCKS).length + '</span>' +
      '</div></div>';

    if (paperTab === 'mock') {
      h += '<div class="card" style="margin-top:14px"><div class="small">模考卷是自建卷：听力 6 题、选词 10 空、匹配 5–6 题、仔细阅读 8 题、写作 + 翻译，按 100 分钟整卷做。' +
        '<b>听力没有录音</b>（自建材料），左边给原文——当精读练，练的是「选项差异 → 原文对应」这一步。</div></div>';
      h += '<div class="pgrid2">' + Object.values(MOCKS).map(P => {
        const st = paperStat(P.k);
        const last = st.rec;
        return '<div class="pcard" onclick="DESK.startPaper(\'' + P.k + '\')">' +
          '<div class="row"><b style="font-size:14.5px">' + esc(P.label) + '</b><span class="grow"></span>' +
          (st.draft ? '<span class="chip amber">有未交的卷</span>' : last ? '<span class="chip">上次 ' + last.right + '/' + last.total + '</span>' : '<span class="chip">未做</span>') + '</div>' +
          '<div class="small dim" style="margin-top:4px">' + esc(P.sub || '') + '</div>' +
          '<div class="small" style="margin-top:10px">' + st.qs.length + ' 题 · 已做 ' + st.done + '/' + st.total + ' 题</div>' +
          '<div class="row" style="margin-top:12px">' +
          (st.draft ? '<button class="btn sm pri" onclick="event.stopPropagation();DESK.resumePaper(\'' + P.k + '\')">继续做</button>' : '') +
          '<button class="btn sm ' + (st.draft ? 'ghost' : 'pri') + '" onclick="event.stopPropagation();DESK.startPaper(\'' + P.k + '\')">' + (last ? '重做' : '开始') + '</button>' +
          '</div></div>';
      }).join('') + '</div>';
      return h;
    }

    const years = [];
    Object.keys(PP).forEach(k => { if (years.indexOf(PP[k].y) < 0) years.push(PP[k].y); });
    years.sort((a, b) => b - a);
    h += '<div class="card" style="margin-top:14px"><div class="small">整卷 55 题（听力 25 + 阅读 30）+ 翻译 + 写作，建议 125 分钟：写作 30′ → 听力 25′ → 阅读 40′ → 翻译 25′。' +
      '<b>交卷才出答案</b>；交完可以逐题看依据与四层解析。</div></div>';

    years.forEach(y => {
      const list = Object.keys(PP).filter(k => PP[k].y === y)
        .sort((a, b) => String(PP[b].s).localeCompare(String(PP[a].s)) || String(PP[a].st).localeCompare(String(PP[b].st)));
      h += '<h2>' + y + ' 年 · ' + list.length + ' 套</h2><div class="card pad0"><div class="plist">';
      list.forEach(k => {
        const P = PP[k];
        const st = paperStat(k);
        const last = st.rec;
        const pct = last && last.total ? Math.round(last.right / last.total * 100) : null;
        h += '<div class="prow" onclick="DESK.startPaper(\'' + k + '\')">' +
          '<div class="pbadge">' + (P.s === '12' ? '12月' : P.s + '月') + '</div>' +
          '<div class="grow" style="min-width:0"><div class="row"><b>' + esc(P.label.replace(/^\d{4}年/, '').replace(/^\d{1,2}月\s*/, '')) + '</b>' +
          (st.qs.some(q => q.k === 'L') ? '' : '<span class="chip">无听力</span>') +
          (st.draft ? '<span class="chip amber">未交卷</span>' : '') + '</div>' +
          '<div class="small dim" style="margin-top:2px">' + st.qs.length + ' 题 · 已做 ' + st.done + '/' + st.total +
          (last ? ' · 上次 ' + last.right + '/' + last.total + '（' + pct + '%）· ' + last.date : '') + '</div></div>' +
          '<div class="pacts">' +
          (st.draft ? '<button class="btn sm pri" onclick="event.stopPropagation();DESK.resumePaper(\'' + k + '\')">继续</button>' : '') +
          '<button class="btn sm ghost" onclick="event.stopPropagation();DESK.startPaper(\'' + k + '\')">' + (last ? '重做' : '开始') + '</button>' +
          '</div></div>';
      });
      h += '</div></div>';
    });
    return h;
  }

  function paperStat(key) {
    const qs = paperQs(key);
    let done = 0;
    qs.forEach(q => { if (S.qs[q.id]) done++; });
    return { qs, done, total: qs.length, rec: paperRec(key), draft: (S.paperDraft || {})[key] };
  }

  /* ---------- 套卷：开始 / 继续 ---------- */
  function startPaper(key, resume) {
    const qs = paperQs(key);
    if (!qs.length) return toast('这套卷没有题目');
    const draft = (S.paperDraft || {})[key];
    const use = resume && draft ? draft : null;
    sess = {
      mode: 'paper', exam: true, paperKey: key, src: MOCKS[key] ? 'mock' : 'real',
      ids: qs.map(q => q.id),
      i: use ? Math.min(use.i || 0, qs.length - 1) : 0,
      ans: use ? Object.assign({}, use.ans) : {},
      text: use ? Object.assign({}, use.text) : {},
      cause: {}, right: 0, done: false, size: qs.length,
      t0: use && use.t0 ? use.t0 : Date.now(), lastTs: Date.now(),
    };
    view = 'run'; render(); window.scrollTo(0, 0);
  }
  function saveDraft() {
    if (!sess || !sess.exam || sess.done) return;
    S.paperDraft = S.paperDraft || {};
    S.paperDraft[sess.paperKey] = { ans: sess.ans, text: sess.text, i: sess.i, t0: sess.t0 };
    save();
  }

  /* ---------- 套卷答题页 ---------- */
  function viewExam() {
    const key = sess.paperKey;
    const P = PAPER[key] || { label: key };
    const qs = sess.ids.map(id => QMAP[id]);
    const q = curQ();
    if (!q) return viewExamResult();
    const parts = ['L', 'R', 'T', 'W'].filter(p => qs.some(x => partOf(x) === p));
    const cur = partOf(q);
    const inPart = qs.filter(x => partOf(x) === cur);
    const ansIn = inPart.filter(x => sess.ans[x.id] !== undefined).length;
    const totalAns = qs.filter(x => sess.ans[x.id] !== undefined).length;

    let h = '<div class="wrap"><div class="exambar">' +
      '<div class="grow"><div class="row"><b style="font-size:15px">' + esc(P.label) + '</b>' +
      '<span class="chip">' + (sess.src === 'mock' ? '自建模考' : '真题整卷') + '</span>' +
      '<span class="chip">' + qs.length + ' 题</span></div>' +
      '<div class="small dim" style="margin-top:2px">已答 ' + totalAns + ' / ' + qs.length + ' · 交卷后统一判分</div></div>' +
      '<span class="exclock mono" id="clock">' + fmtDur(Date.now() - sess.t0) + '</span>' +
      '<button class="btn sm ghost" onclick="DESK.toggleCard()">答题卡</button>' +
      '<button class="btn sm pri" onclick="DESK.submitExam()">交卷</button>' +
      '</div>';

    h += '<div class="examtabs">' + parts.map(p => {
      const ps = qs.filter(x => partOf(x) === p);
      const a = ps.filter(x => sess.ans[x.id] !== undefined).length;
      return '<span class="etab ' + (cur === p ? 'on' : '') + '" onclick="DESK.jumpPart(\'' + p + '\')">' + PART_NAME[p] +
        '<i>' + a + '/' + ps.length + '</i></span>';
    }).join('') + '</div>';

    if (showCard) h += answerCard(qs, cur);

    const isR = q.k === 'R', isM = q.k === 'M', isC = q.k === 'C', isL = q.k === 'L';
    const isW = q.k === 'W', isT = q.k === 'T';

    h += '<div class="qbody' + (isC ? ' c' : '') + (isR || isM || isC || (isL && UN[q.u]) ? '' : ' single') + '">';

    if (isR || isM || isC) {
      h += '<div class="qcol"><div class="pane scroll">' + materialHTML(q, false) + '</div></div>';
    } else if (isL && UN[q.u]) {
      h += '<div class="qcol"><div class="pane scroll"><div class="pane-title">听力原文 · 自建模题</div>' +
        '<div class="small dim" style="margin-bottom:8px">这套没有录音，先把原文当阅读材料读，再选；练的是「选项差异 → 原文对应」。</div>' +
        '<div class="passage">' + esc(pretty(UN[q.u].text)) + '</div></div></div>';
    }

    h += '<div class="qcol"><div class="pane">';
    h += '<div class="qtag"><span class="chip acc">' + esc(PART_NAME[cur]) + '</span>' +
      (q.n ? '<span class="chip">第 ' + q.n + ' 题</span>' : '') +
      '<span class="chip">' + esc(q.ty || '') + '</span>' + doneChip(q.id) + '</div>';

    if (isL) {
      if (sess.src === 'real') {
        h += audioHTML(q);
        h += '<div class="small" style="margin:10px 0 4px">听录音作答。真实考试不印题干，问题只播一遍。</div>';
      } else {
        h += '<div class="stem en">' + esc(q.st) + '</div>';
      }
    } else if (isC) {
      h += '<div class="stem en">' + blankSentence(q) + '</div>';
      h += '<div class="small dim" style="margin:-6px 0 10px">空位需要填一个 <b>' + posName(q.pos) + '</b>。先按词性排除，再看语义；<b>十个空填完才统一公布答案</b>。</div>';
    } else if (isM) {
      h += '<div class="stem en">' + esc(q.st) + '</div><div class="small dim" style="margin:-6px 0 10px">这句在说哪一段？左边是段落原文。</div>';
    } else if (isR) {
      h += '<div class="stem en">' + esc(q.st) + '</div>';
    } else if (isW) {
      h += '<div class="stem en">' + esc(q.st) + '</div>';
      const txt = sess.text[q.id] || '';
      h += '<div class="small dim" style="margin:10px 0 6px">写在这里，交卷后保存并给自评档位。建议 30 分钟、120–180 词。</div>' +
        '<textarea class="exwrite" placeholder="Write your essay here…" oninput="DESK.examText(this.value)">' + esc(txt) + '</textarea>' +
        '<div class="row" style="margin-top:6px"><span class="small dim" id="wcount">' + wc(txt) + ' 词</span>' +
        '<span class="grow"></span><span class="small dim">交卷后可跳到「写作翻译」页跑批改</span></div>';
    } else if (isT) {
      h += '<div class="stem">' + esc(pretty(q.st)) + '</div>';
      const txt = sess.text[q.id] || '';
      h += '<div class="small dim" style="margin:10px 0 6px">写英文译文，交卷后保存并给自评档位。建议 25 分钟。</div>' +
        '<textarea class="exwrite" placeholder="Type your translation here…" oninput="DESK.examText(this.value)">' + esc(txt) + '</textarea>' +
        '<div class="row" style="margin-top:6px"><span class="small dim" id="wcount">' + wc(txt) + ' 词</span></div>';
    }

    if (!isW && !isT) h += optionsHTML(q, false);

    h += '<div class="qfoot">' +
      '<button class="btn ghost" onclick="DESK.prevQ()" ' + (sess.i === 0 ? 'disabled' : '') + '>← 上一题</button>' +
      '<span class="small dim">' + (sess.i + 1) + ' / ' + qs.length + '</span>' +
      '<button class="btn" onclick="DESK.nextQ()">' + (sess.i + 1 >= qs.length ? '交卷' : '下一题 →') + '</button>' +
      '</div>';
    h += '</div></div></div></div>';
    return h;
  }

  function answerCard(qs, cur) {
    return '<div class="card cardgrid" style="margin-bottom:14px"><div class="row" style="margin-bottom:8px">' +
      '<b style="font-size:13.5px">答题卡</b><span class="small dim">实心 = 已答，方框 = 空着，左上角小点 = 以前做过</span>' +
      '<span class="grow"></span><button class="btn sm ghost" onclick="DESK.toggleCard()">收起</button></div>' +
      '<div class="cardgrid-in">' + qs.map(q => {
        const a = sess.ans[q.id];
        const cls = 'ccell' + (a !== undefined ? ' on' : '') + (partOf(q) === cur ? ' cur' : '');
        const num = q.k === 'W' ? '写' : q.k === 'T' ? '译' : q.n;
        return '<span class="' + cls + '" onclick="DESK.jumpTo(\'' + q.id + '\')" title="' + esc((q.ty || '') + ' · ' + (a || '未答')) + '">' +
          doneDot(q.id) + num + '</span>';
      }).join('') + '</div></div>';
  }
  /* ---------- 套卷：判分 / 结果 / 逐题解析 ---------- */
  function partOf(q) {
    if (q.k === 'L') return 'L';
    if (q.k === 'W') return 'W';
    if (q.k === 'T') return 'T';
    return 'R';
  }
  const PART_NAME = { L: '听力', R: '阅读', T: '翻译', W: '写作' };
  let showCard = false;

  function qValue(q) {
    if (q.k === 'L') return 9.94;
    if (q.k === 'C') return 3.55;
    if (q.k === 'M') return 7.1;
    if (q.k === 'R') return 14.2;
    return 0;
  }
  function toggleCard() { showCard = !showCard; render(); }
  function jumpTo(id) {
    const i = sess ? sess.ids.indexOf(id) : -1;
    if (i < 0) return;
    sess.i = i; showCard = false; sess.lastTs = Date.now(); saveDraft(); render(); window.scrollTo(0, 0);
  }
  function jumpPart(p) {
    if (!sess) return;
    const id = sess.ids.find(x => partOf(QMAP[x]) === p);
    if (id) jumpTo(id);
  }
  function examText(v) {
    const q = curQ(); if (!q) return;
    sess.text[q.id] = v; saveDraft();
    const c = document.getElementById('wcount');
    if (c) c.textContent = wc(v) + ' 词';
  }

  function submitExam() {
    if (!sess || !sess.exam || sess.done) return;
    const qs = sess.ids.map(id => QMAP[id]);
    const obj = qs.filter(q => q.k !== 'W' && q.k !== 'T');
    const unans = obj.filter(q => sess.ans[q.id] === undefined).length;
    if (unans && !confirm('还有 ' + unans + ' 道客观题没答，确定交卷？')) return;

    let right = 0, objMax = 0, objGot = 0;
    obj.forEach(q => {
      objMax += qValue(q);
      const a = sess.ans[q.id];
      if (a === undefined) return;
      const ok = a === q.a;
      if (ok) { right++; objGot += qValue(q); }
      const rec = S.qs[q.id] || {};
      S.qs[q.id] = { a, ok, ts: Date.now(), cause: rec.cause || '', n: (rec.n || 0) + 1 };
      (q.pt || []).forEach(id => {
        const st = S.pts[id] || (S.pts[id] = { s: 0, r: 0, hist: [] });
        st.s++; if (ok) st.r++;
        st.hist = st.hist || []; st.hist.push(ok ? 1 : 0);
        if (st.hist.length > 20) st.hist.shift();
      });
      if (!ok) {
        const w = S.wrong[q.id] || { n: 0 };
        w.n = (w.n || 0) + 1; w.ts = Date.now(); w.a = a;
        S.wrong[q.id] = w;
      } else if (S.wrong[q.id]) {
        delete S.wrong[q.id];
      }
    });

    const answered = obj.filter(q => sess.ans[q.id] !== undefined).length;
    const d = today();
    const day = S.days[d] || (S.days[d] = { n: 0, r: 0 });
    day.n += answered; day.r += right;

    qs.forEach(q => {
      if ((q.k === 'W' || q.k === 'T') && sess.text[q.id]) S.write[q.id] = sess.text[q.id];
    });

    sess.right = right; sess.objMax = objMax; sess.objGot = objGot;
    sess.done = true; sess.spent = Date.now() - sess.t0;
    sess.self = sess.self || {};

    const score = paperScore();
    S.papers = S.papers || {};
    S.papers[sess.paperKey] = {
      ts: Date.now(), date: d, right, total: obj.length, answered,
      score, dur: sess.spent,
    };
    if (S.paperDraft) delete S.paperDraft[sess.paperKey];

    const now = new Date();
    S.runs.push({
      ts: Date.now(), date: d, hh: now.getHours(), mm: now.getMinutes(),
      mode: 'paper', modeName: '套卷 · ' + ((PAPER[sess.paperKey] || {}).label || sess.paperKey),
      n: answered, planned: obj.length, right, dur: sess.spent, ids: sess.ids.slice(),
    });
    if (S.runs.length > 300) S.runs = S.runs.slice(-300);
    save(); render(); window.scrollTo(0, 0);
  }

  function objScaled(got, max) {
    if (!max) return 0;
    return max >= 490 ? got : got / max * 497;
  }
  function paperScore() {
    const got = objScaled(sess.objGot || 0, sess.objMax || 0);
    const self = sess.self || {};
    return Math.round((got + (self.w || 0) * 106.5 + (self.t || 0) * 106.5) * 10) / 10;
  }
  function examSelf(kind, level) {
    if (!sess) return;
    sess.self = sess.self || {};
    sess.self[kind] = sess.self[kind] === level ? 0 : level;
    S.papers[sess.paperKey].score = paperScore();
    save(); render();
  }

  function viewExamResult() {
    const key = sess.paperKey;
    const P = PAPER[key] || { label: key };
    const qs = sess.ids.map(id => QMAP[id]);
    const obj = qs.filter(q => q.k !== 'W' && q.k !== 'T');
    const answered = obj.filter(q => sess.ans[q.id] !== undefined);
    const right = sess.right || 0;
    const acc = answered.length ? right / answered.length : 0;
    const spent = sess.spent || (Date.now() - sess.t0);
    const self = sess.self || {};
    const score = paperScore();
    const hasL = obj.some(q => q.k === 'L');
    const scaled = objScaled(sess.objGot || 0, sess.objMax || 0);
    const wrongs = obj.filter(q => sess.ans[q.id] !== undefined && sess.ans[q.id] !== q.a);
    const blank = obj.length - answered.length;
    const wq = qs.find(q => q.k === 'W'), tq = qs.find(q => q.k === 'T');

    let h = '<div class="wrap"><div class="scorehero">' +
      ring(acc) +
      '<div class="grow"><div class="small dim">' + esc(P.label) + ' · 已交卷</div>' +
      '<div style="font-size:22px;font-weight:650;margin:2px 0 6px">估算 <span style="color:var(--acc)">' + score + '</span> / 710' +
      (self.w || self.t ? '' : '<span class="small dim" style="font-size:12px;font-weight:400"> · 主观题未自评</span>') + '</div>' +
      '<div class="small">客观题 ' + right + ' / ' + obj.length + ' 对' + (blank ? '（' + blank + ' 题空着）' : '') +
      ' · 客观得分 ' + Math.round((sess.objGot || 0) * 10) / 10 + ' / ' + Math.round((sess.objMax || 0) * 10) / 10 +
      ' · 用时 ' + fmtDur(spent) + '</div>' +
      ((sess.objMax || 0) >= 490 ? '' : '<div class="small amber" style="margin-top:6px">' +
        (hasL ? '这是自建模考卷，只有 ' + qs.length + ' 题' : '本套原卷没有印听力（三套共用一份录音）') +
        '：客观题按比例折算成 ' + Math.round(scaled * 10) / 10 + ' / 497，再加写作翻译，才是估算总分。</div>') +
      '</div>' +
      '<div style="margin-left:auto;display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn pri" onclick="DESK.exportPaper()">导出整卷复盘</button>' +
      '<button class="btn ghost" onclick="DESK.retryPaper()">再做一遍</button>' +
      '<button class="btn ghost" onclick="DESK.go(\'train\')">换一套卷</button>' +
      '</div></div>';

    /* 分部分统计 */
    const parts = ['L', 'C', 'M', 'R'].filter(p => obj.some(q => q.k === p));
    h += '<div class="stats" style="margin-top:16px">' + parts.map(p => {
      const ps = obj.filter(q => q.k === p);
      const a = ps.filter(q => sess.ans[q.id] !== undefined);
      const r = ps.filter(q => sess.ans[q.id] === q.a).length;
      const pct = a.length ? Math.round(r / a.length * 100) : 0;
      const nm = { L: '听力', C: '选词填空', M: '长篇匹配', R: '仔细阅读' }[p];
      const full = Math.round(ps.reduce((n, q) => n + qValue(q), 0) * 10) / 10;
      return statCard(nm, r + '/' + ps.length, '', pct + '% · 满分 ' + full);
    }).join('') + '</div>';

    /* 答题卡 */
    h += '<h2>逐题结果</h2><div class="card"><div class="row" style="margin-bottom:8px">' +
      '<span class="small dim">绿 = 对 · 红 = 错 · 灰 = 空着 · 点任何一题看解析</span></div>' +
      '<div class="cardgrid-in">' + obj.map(q => {
        const a = sess.ans[q.id];
        const cls = a === undefined ? 'blank' : a === q.a ? 'ok' : 'bad';
        return '<span class="ccell ' + cls + '" onclick="DESK.reviewInPaper(\'' + q.id + '\')" title="' + esc((q.ty || '') + ' · 你选 ' + (a || '—') + ' · 答案 ' + q.a) + '">' +
          (q.n || '') + '</span>';
      }).join('') + '</div></div>';

    if (wrongs.length) {
      h += '<h2>错题 ' + wrongs.length + ' 道 · 已进错题本</h2><div class="card pad0"><table class="t"><thead><tr><th>题</th><th>类型</th><th>我选</th><th>答案</th><th>考点</th><th></th></tr></thead><tbody>' +
        wrongs.map(q => '<tr><td class="mono">' + (q.n || '—') + '</td><td><span class="chip">' + KIND[q.k].n + '</span> ' + esc(cut(q.ty || '', 10)) + '</td>' +
          '<td class="mono" style="color:var(--bad)">' + sess.ans[q.id] + '</td>' +
          '<td class="mono" style="color:var(--ok)">' + q.a + '</td>' +
          '<td class="dim">' + (q.pt[0] || '') + ' ' + esc((PMAP[q.pt[0]] || {}).name || '') + '</td>' +
          '<td><button class="btn sm ghost" onclick="DESK.reviewInPaper(\'' + q.id + '\')">看解析</button></td></tr>').join('') +
        '</tbody></table></div>';
    }

    /* 写作 / 翻译 */
    h += '<h2>主观题 · 自评后才算进总分</h2><div class="cols"><div class="card">' +
      '<div class="row"><b style="font-size:14px">写作</b><span class="grow"></span><span class="chip">106.5 满分</span></div>' +
      '<div class="small dim" style="margin-top:6px">' + esc(cut(wq ? wq.st : '', 220)) + '</div>' +
      '<div class="small" style="margin-top:8px">我写的：<b>' + wc(sess.text[(wq || {}).id] || '') + '</b> 词</div>' +
      '<div class="row wrap" style="margin-top:10px;gap:6px">' +
      [[0.85, '结构完整、错误少'], [0.65, '有结构但有语法错'], [0.4, '未完成']].map(([v, n]) =>
        '<span class="chip click ' + (self.w === v ? 'acc' : '') + '" onclick="DESK.examSelf(\'w\',' + v + ')">' + n + ' · ' + Math.round(v * 106.5) + '</span>').join('') +
      '</div></div>' +
      '<div class="card"><div class="row"><b style="font-size:14px">翻译</b><span class="grow"></span><span class="chip">106.5 满分</span></div>' +
      '<div class="small dim" style="margin-top:6px">' + esc(cut(tq ? tq.st : '', 160)) + '</div>' +
      '<div class="small" style="margin-top:8px">我译的：<b>' + wc(sess.text[(tq || {}).id] || '') + '</b> 词</div>' +
      '<div class="row wrap" style="margin-top:10px;gap:6px">' +
      [[0.85, '完整通顺'], [0.65, '有错但大意对'], [0.4, '基本译不出']].map(([v, n]) =>
        '<span class="chip click ' + (self.t === v ? 'acc' : '') + '" onclick="DESK.examSelf(\'t\',' + v + ')">' + n + ' · ' + Math.round(v * 106.5) + '</span>').join('') +
      '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm ghost" onclick="DESK.go(\'write\')">去写作翻译页批改</button></div></div></div>';

    h += '<h2>下一步</h2><div class="card"><div class="small">把这一套导出成复盘笔记，丢进 Obsidian 的 <code>04-复盘</code>：frontmatter 带卷名与分数，正文按部分列出每道错题的 <code>[[题目]]</code> 与 <code>[[考点]]</code> 双链。</div>' +
      '<div class="row wrap" style="margin-top:12px"><button class="btn sm" onclick="DESK.exportPaper()">下载复盘 md</button>' +
      '<button class="btn sm ghost" onclick="DESK.copyPaperMd()">复制 markdown</button>' +
      '<button class="btn sm ghost" onclick="DESK.go(\'vault\')">接入说明</button></div></div>';

    h += '</div>';
    return h;
  }

  function viewPaperReview() {
    const q = QMAP[sess.reviewId] || curQ();
    if (!q) return viewExamResult();
    const P = PAPER[sess.paperKey] || {};
    const qs = sess.ids.map(id => QMAP[id]);
    const idx = sess.ids.indexOf(q.id);
    const isR = q.k === 'R', isM = q.k === 'M', isC = q.k === 'C', isL = q.k === 'L';
    const twoCol = isR || isM || isC || (isL && UN[q.u]);

    let h = '<div class="wrap"><div class="exambar">' +
      '<div class="grow"><div class="row"><b style="font-size:15px">' + esc(P.label || '') + '</b>' +
      '<span class="chip">第 ' + (idx + 1) + ' / ' + qs.length + ' 题</span>' +
      '<span class="chip">' + KIND[q.k].n + '</span></div>' +
      '<div class="small dim" style="margin-top:2px">' + esc(q.ty || '') + '</div></div>' +
      '<button class="btn sm ghost" onclick="DESK.prevReview()" ' + (idx <= 0 ? 'disabled' : '') + '>← 上一题</button>' +
      '<button class="btn sm ghost" onclick="DESK.nextReview()" ' + (idx >= qs.length - 1 ? 'disabled' : '') + '>下一题 →</button>' +
      '<button class="btn sm pri" onclick="DESK.backResult()">回到结果</button>' +
      '</div>';

    h += '<div class="qbody' + (isC ? ' c' : '') + (twoCol ? '' : ' single') + '">';
    if (isR || isM || isC) {
      h += '<div class="qcol"><div class="pane scroll">' + materialHTML(q, true) + '</div></div>';
    } else if (isL && UN[q.u]) {
      h += '<div class="qcol"><div class="pane scroll"><div class="pane-title">听力原文 · 自建模题</div>' +
        '<div class="passage">' + highlight(esc(pretty(UN[q.u].text)), pretty(q.loc)) + '</div></div></div>';
    }
    h += '<div class="qcol"><div class="pane">';
    h += '<div class="qtag"><span class="chip">' + (q.n ? '第 ' + q.n + ' 题' : KIND[q.k].n) + '</span>' +
      '<span class="chip">' + esc(q.ty || '') + '</span>' + doneChip(q.id) + '</div>';
    if (isC) h += '<div class="stem en">' + blankSentence(q) + '</div>';
    else if (q.k !== 'W' && q.k !== 'T' && !(isL && sess.src === 'real' && !q.st)) h += '<div class="stem en">' + esc(q.st || '') + '</div>';
    if (q.k === 'W' || q.k === 'T') {
      h += '<div class="quote">' + esc(cut(sess.text[q.id] || '（没写）', 600)) + '</div>';
      if (q.sample) h += '<div class="sec-block"><div class="sec-h">参考范文</div><div class="small" style="white-space:pre-wrap">' + esc(q.sample) + '</div></div>';
      if (q.ref) h += '<div class="sec-block"><div class="sec-h">参考译文</div><div class="small" style="white-space:pre-wrap">' + esc(q.ref) + '</div></div>';
      h += '</div></div></div></div>';
      return h;
    }
    h += optionsHTML(q, true);
    h += resultHTML(q);
    h += analysisHTML(q, true);
    h += '</div></div></div></div>';
    return h;
  }

  /* ================= 答题 ================= */
  function curQ() { return sess ? QMAP[sess.ids[sess.i]] : null; }

  function viewRun() {
    if (!sess) return '<div class="wrap"><div class="empty"><b>没有进行中的训练</b><button class="btn" onclick="DESK.go(\'train\')">去开一组</button></div></div>';
    if (sess.exam) return sess.done ? viewExamResult() : viewExam();
    if (sess.done) return viewSummary();
    const q = curQ();
    if (!q) return viewSummary();
    const total = sess.ids.length;
    const answered = sess.ans[q.id] !== undefined;
    const isR = q.k === 'R', isM = q.k === 'M', isC = q.k === 'C', isL = q.k === 'L';
    /* 选词填空：填了不等于判了，十个空齐了才公布 */
    const judged = answered && (!isC || isCJudged(q));

    let h = '<div class="wrap"><div class="qhead">' +
      '<span class="small mono">' + (sess.i + 1) + ' / ' + total + '</span>' +
      '<div class="pbar"><div class="progress"><i style="width:' + (((sess.i + (answered ? 1 : 0)) / total) * 100) + '%"></i></div></div>' +
      '<span class="chip">' + KIND[q.k].n + '</span>' +
      '<span class="chip">' + esc(q.ty) + '</span>' +
      '<span class="grow"></span>' +
      '<span class="small dim mono" id="clock">' + fmtDur(Date.now() - sess.t0) + '</span>' +
      '<button class="btn sm ghost" onclick="DESK.endEarly()">结束</button>' +
      '</div>';

    h += '<div class="qbody' + (isC ? ' c' : '') + (isR || isM || isC ? '' : ' single') + '">';

    /* 左：材料 */
    if (isR || isM || isC) {
      h += '<div class="qcol"><div class="pane scroll">' + materialHTML(q, judged) + '</div></div>';
    }

    /* 右：题目 + 解析 */
    h += '<div class="qcol"><div class="' + (isR || isM || isC ? '' : 'sticky') + '">';
    h += '<div class="pane">';
    h += '<div class="qtag">' +
      '<span class="chip acc">' + (q.pt[0] || '') + ' ' + esc((PMAP[q.pt[0]] || {}).name || '') + '</span>' +
      '<span class="chip">' + paperLabel(q.p) + '</span>' +
      '<span class="chip">第 ' + q.n + ' 题</span>' +
      (S.wrong[q.id] ? '<span class="chip bad">错过 ' + (S.wrong[q.id].n || 1) + ' 次</span>' : '') +
      doneChip(q.id) +
      '</div>';

    if (isL) {
      h += audioHTML(q);
      h += '<div class="small" style="margin:10px 0 12px">听录音，选最佳答案。真实考试问题只播一遍，这里也一样——先作答，再看解析。</div>';
    } else if (isC) {
      h += '<div class="stem en">' + blankSentence(q) + '</div>';
      h += '<div class="small dim" style="margin:-6px 0 10px">空位需要填一个 <b>' + posName(q.pos) + '</b>。先按词性排除，再看语义；<b>十个空填完才统一公布答案</b>。</div>';
    } else if (isM) {
      h += '<div class="stem en">' + esc(q.st) + '</div><div class="small dim" style="margin:-6px 0 10px">这句在说哪一段？左边是 A–O 十五段原文。</div>';
    } else {
      h += '<div class="stem en">' + esc(q.st) + '</div>';
    }

    h += optionsHTML(q, judged);
    if (judged) h += resultHTML(q);
    else if (isC) {
      const set = cFillSet(q.u, q.p);
      const got = set.filter(x => sess.ans[x.id] !== undefined).length;
      h += '<div class="qfoot"><span class="small dim">选词填空：已填 <b>' + got + ' / ' + set.length +
        '</b> 个 · 十空填完统一公布答案</span></div>';
    } else h += '<div class="qfoot"><span class="small dim">选一个选项 → 立刻出答案与依据</span></div>';
    h += '</div>';

    if (judged) h += analysisHTML(q);
    h += '</div></div>';

    h += '</div></div>';
    return h;
  }

  function posName(p) {
    return ({ n: '名词', v: '动词', adj: '形容词', adv: '副词', 'v-ed': '动词过去分词', 'v-ing': '动词现在分词' })[p] || (p || '实词');
  }

  function materialHTML(q, answered) {
    if (q.k === 'R') {
      const u = UN[q.u];
      if (!u) return '<div class="small">材料缺失</div>';
      let text = esc(pretty(u.text));
      if (answered && q.loc) text = highlight(text, pretty(q.loc));
      return '<div class="pane-title">' + (q.n <= 50 ? 'Passage One' : 'Passage Two') + '</div><div class="passage">' +
        text.split(/\n+/).map(x => '<p>' + x + '</p>').join('') + '</div>';
    }
    if (q.k === 'M') {
      const u = UN[q.u];
      if (!u) return '<div class="small">材料缺失</div>';
      return '<div class="pane-title">A – O 十五段</div><div class="passage" style="font-size:13.6px;line-height:1.8">' +
        u.paras.map(([l, t]) => {
          const hit = answered && q.a === l;
          return '<p' + (hit ? ' style="background:rgba(67,209,158,.12);border-left:2px solid var(--ok);padding:6px 8px;border-radius:0 6px 6px 0"' : '') + '><span class="para-l">[' + l + ']</span>' + esc(pretty(t)) + '</p>';
        }).join('') + '</div>';
    }
    if (q.k === 'C') {
      const u = UN[q.u];
      if (!u) return '<div class="small">材料缺失</div>';
      let text = esc(pretty(u.text));
      const jd = !!answered;
      text = text.replace(/\[\[(\d{2})\]\]/g, (m, n) => {
        const same = String(+n) === String(q.n);
        const wq = ALLQ.find(x => x && x.k === 'C' && x.u === q.u && x.p === q.p && String(x.n) === String(+n));
        const pickL = wq ? sess.ans[wq.id] : undefined;
        const mine = pickL !== undefined ? ((u.bank.find(b => b.l === pickL) || {}).w || '') : '';
        const ok = wq ? pickL === wq.a : false;
        const color = (jd && pickL !== undefined) ? 'border-bottom-color:' + (ok ? 'var(--ok)' : 'var(--bad)') + ';color:' + (ok ? 'var(--ok)' : 'var(--bad)') : '';
        const tapAttr = ' onclick="DESK.pickBlank(' + (+n) + ')"';
        const cls = 'blank' + (same ? ' cur' : '') + (mine ? ' filled' : '');
        return '<span class="' + cls + '" data-n="' + (+n) + '"' + tapAttr +
          ' title="第 ' + (+n) + ' 空' + (mine ? ' · 已填 ' + esc(mine) : ' · 点一下填') + '" style="cursor:pointer;' + color + '">' +
          esc(mine || String(+n)) + '</span>';
      });
      return '<div class="pane-title">Section A · 选词填空</div><div class="passage" style="font-size:14.4px">' +
        text.split(/\n+/).map(x => '<p>' + x + '</p>').join('') + '</div>';
    }
    return '';
  }

  function highlight(text, loc) {
    const s = String(loc || '').trim();
    if (!s) return text;
    const idx = text.indexOf(esc(s).replace(/&amp;/g, '&'));
    if (idx < 0) {
      const key = s.slice(0, 40);
      const i2 = text.indexOf(key);
      if (i2 < 0) return text;
      return text.slice(0, i2) + '<mark>' + text.slice(i2, i2 + s.length) + '</mark>' + text.slice(i2 + s.length);
    }
    return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + s.length) + '</mark>' + text.slice(idx + s.length);
  }

  function audioHTML(q) {
    const p = PP[q.p];
    if (!p || !p.audio) return '<div class="audiobar"><span class="dot"></span><span class="small">这一套没有音频文件，按选项逻辑作答。</span></div>';
    return '<div class="audiobar"><span class="dot"></span><div class="grow"><audio controls preload="none" src="' + p.audio + '"></audio></div></div>' +
      '<div class="small dim" style="margin-top:6px">音频来自原卷镜像；播不动就按选项逻辑选，解析照常看。</div>';
  }

  function optionsHTML(q, answered) {
    const sel = sess.ans[q.id];
    if (q.k === 'C') {
      const u = UN[q.u]; if (!u) return '';
      return '<div class="wordbank">' + u.bank.map(b => {
        let cls = 'wb';
        if (answered) {
          if (b.l === q.a) cls += ' ok';
          else if (b.l === sel) cls += ' on';
        } else if (b.l === sel) cls += ' on';
        return '<div class="' + cls + '" onclick="DESK.answer(\'' + b.l + '\')"><span class="l">' + b.l + '</span>' + esc(b.w) + '</div>';
      }).join('') + '</div>';
    }
    if (q.k === 'M') {
      const letters = 'ABCDEFGHIJKLMNO';
      return '<div class="wordbank" style="gap:7px">' + letters.split('').map(l => {
        let cls = 'wb';
        if (answered) { if (l === q.a) cls += ' ok'; else if (l === sel) cls += ' on'; }
        else if (l === sel) cls += ' on';
        return '<div class="' + cls + '" style="min-width:42px;justify-content:center;font-weight:600" onclick="DESK.answer(\'' + l + '\')">' + l + '</div>';
      }).join('') + '</div><div class="small dim" style="margin-top:8px">选段落字母；答案段会在左边高亮。</div>';
    }
    return '<div class="opts">' + (q.o || []).map((o, i) => {
      const l = 'ABCD'[i];
      let cls = 'opt en';
      if (answered) {
        if (l === q.a) cls += ' right';
        else if (l === sel) cls += ' wrong';
        else cls += ' dim';
      } else if (l === sel) cls += ' sel';
      return '<div class="' + cls + '" onclick="DESK.answer(\'' + l + '\')"><span class="l">' + l + '</span><span class="grow">' + esc(o) + '</span>' +
        (answered && l === q.a ? '<span class="mk" style="color:var(--ok)">正确</span>' : answered && l === sel ? '<span class="mk" style="color:var(--bad)">你选</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function resultHTML(q) {
    const sel = sess.ans[q.id];
    const ok = sel === q.a;
    const dur = sess.dur ? sess.dur[q.id] : 0;
    let h = '<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' +
      '<span class="big">' + (ok ? '✓ 正确' : sel === undefined ? '— 未作答' : '✗ 答错') + '</span>' +
      '<span>答案 <b class="mono">' + q.a + '</b>' + (q.w ? ' · ' + esc(q.w) : '') +
      (ok ? '' : sel === undefined ? ' ｜ 未作答' : ' ｜ 你选 <b class="mono">' + sel + '</b>') + '</span>' +
      (dur ? '<span class="small dim" style="margin-left:auto">' + Math.round(dur / 1000) + ' 秒</span>' : '') +
      '</div>';

    // 错因
    if (!ok) {
      const cur = sess.cause[q.id];
      h += '<div class="sec-block" style="border-top:0;padding-top:10px"><div class="sec-h">这次为什么错（记下来，脑库要用）</div><div class="cause-row">' +
        CAUSES.map(([k, n]) => '<span class="chip click ' + (cur === k ? 'acc' : '') + '" onclick="DESK.setCause(\'' + k + '\')">' + n + '</span>').join('') + '</div></div>';
    }
    return h;
  }

  /* 解析：答案依据 / 干扰项 / 四层 */
  function analysisHTML(q, noFoot) {
    const pt = PMAP[q.pt[0]] || { name: q.ty, core: '', judge: '', distract: [], boundary: '' };
    const answered = true;
    let h = '<div class="pane" style="margin-top:14px">';

    h += '<div class="sec-h">依据 · 这题为什么是这个答案</div>';
    h += evidenceHTML(q);

    const dists = q.d || [];
    if (dists.length) {
      h += '<div class="sec-block"><div class="sec-h">干扰项 · 三个错项各自怎么造的</div>' +
        dists.map(d => {
          const i = 'ABCD'.indexOf(d.l);
          const txt = (q.o || [])[i] || '';
          return '<div class="dist-item"><span class="lb">' + d.l + '</span><span class="tx">' + esc(cut(txt, 96)) +
            '<div class="dim" style="font-size:11.5px;margin-top:2px">' + esc(TAG_DESC[d.t] || '') + '</div></span>' +
            '<span class="tg"><span class="chip">' + esc(d.t) + '</span></span></div>';
        }).join('') + '</div>';
    } else if (q.k === 'C') {
      h += '<div class="sec-block"><div class="sec-h">排除路径 · 词性先砍一半</div>' + clozeElim(q) + '</div>';
    } else if (q.k === 'M') {
      h += '<div class="sec-block"><div class="sec-h">段落打分 · 关键词落在哪几段</div>' + matchScores(q) + '</div>';
    } else if (q.k === 'L') {
      h += '<div class="sec-block"><div class="sec-h">选项差异 · 听之前先看出题人改了哪</div>' + listenDiff(q) + '</div>' +
        '<div class="sec-block"><div class="sec-h">听法 · 这题该抓什么</div>' +
        '<div class="small">听力只有音频、没有逐句原文，所以这里不给“定位句”，给的是<b>抓音路线</b>：' +
        esc(pt.judge || '先看选项差异，再带着差异去听。') + '</div></div>';
    }

    // 四层
    h += '<div class="sec-block"><div class="sec-h">四层拆解</div>' +
      fold('第一层 · 推理链（从题干到答案）', layers1(q), true) +
      fold('第二层 · 最快解法（考场上 30 秒）', layers2(q)) +
      fold('第三层 · 易错点（命题人怎么下套）', layers3(q)) +
      fold('第四层 · 母题抽象（换话题不换路径）', layers4(q)) +
      '</div>';

    // 考点 + 双链
    h += '<div class="sec-block"><div class="sec-h">连着脑库</div><div class="row wrap" style="gap:7px">' +
      q.pt.map(id => '<span class="chip click acc" onclick="DESK.openPoint(\'' + id + '\')">' + id + ' ' + esc((PMAP[id] || {}).name || '') + '</span>').join('') +
      '</div><div class="row wrap" style="margin-top:10px;gap:7px">' +
      '<button class="btn sm ghost" onclick="DESK.copyLinks()">复制双链</button>' +
      '<button class="btn sm ghost" onclick="DESK.openPoint(\'' + q.pt[0] + '\')">看这个考点</button>' +
      '<span class="small dim" style="margin-left:auto">' + esc(qNote(q)) + '</span>' +
      '</div></div>';

    h += '</div>';

    if (!noFoot) {
      h += '<div class="qfoot">' +
        '<button class="btn ghost" onclick="DESK.prevQ()" ' + (sess.i === 0 ? 'disabled' : '') + '>← 上一题</button>' +
        '<span class="grow"></span>' +
        '<button class="btn pri" onclick="DESK.nextQ()">' + (sess.i + 1 >= sess.ids.length ? '看本次结果 →' : '下一题 →') + '</button>' +
        '</div>';
    }
    return h;
  }

  function evidenceHTML(q) {
    if (q.why && q.k !== 'C') {
      let h = '<div class="small" style="line-height:1.8">' + esc(q.why) + '</div>';
      if (q.loc) h += '<div class="quote" style="margin-top:10px">' + esc(pretty(q.loc)) + '</div>' +
        '<div class="small dim" style="margin-top:6px">上面这段就是原文依据' + (q.pit ? '；常见错法：' + esc(q.pit) : '') + '。</div>';
      if (q.on && q.on.length) {
        h += '<div style="margin-top:10px">' + q.on.map((t, i) => '<div class="dist-item"><span class="lb">' + 'ABCD'[i] + '</span>' +
          '<span class="tx">' + esc(t) + '</span></div>').join('') + '</div>';
      }
      return h;
    }
    if (q.k === 'R') {
      let h = '';
      if (q.loc) {
        h += '<div class="quote">' + esc(pretty(q.loc)) + '</div>';
        h += '<div class="small dim" style="margin-top:6px">定位句由「题干实词 + 罕见词加权 + 题文同序」算出，是可核对的线索；和你判断不一致时以原文为准。</div>';
      } else {
        h += '<div class="small">这题没匹配到明确依据句，回原文自己划一句，写在复盘里。</div>';
      }
      if (q.rw && q.rw.length) {
        h += '<div style="margin-top:10px" class="small">改写对照：' + q.rw.map(([a, b]) => '<span class="chip amber" style="margin:2px 3px 0 0">' + esc(a) + ' ↔ ' + esc(b) + '</span>').join('') + '</div>';
      } else {
        h += '<div class="small dim" style="margin-top:10px">正确项与定位句字面高度重合，逐词比对即可。</div>';
      }
      return h;
    }
    if (q.k === 'M') {
      const u = UN[q.u];
      const para = u ? u.paras.find(p => p[0] === q.a) : null;
      return '<div class="small" style="margin-bottom:6px">答案段落 <b style="color:var(--ok)">[' + q.a + ']</b>：</div>' +
        (para ? '<div class="quote">' + esc(cut(para[1], 420)) + '</div>' : '<div class="small">材料缺失</div>') +
        '<div class="small dim" style="margin-top:6px">陈述句和该段之间是同义改写，不是同一个词——找到“意思一样、说法不同”的那一句。</div>';
    }
    if (q.k === 'C') {
      const u = UN[q.u];
      const bank = u ? u.bank : [];
      return '<div class="small">空位句：</div><div class="quote">' + esc(blankSentence(q)) + '</div>' +
        '<div class="row wrap" style="margin-top:10px;gap:6px">' +
        '<span class="chip ok">答案 ' + q.a + ' · ' + esc(q.w || '') + '</span>' +
        '<span class="chip">空位需要 ' + posName(q.pos) + '</span></div>' +
        '<div class="small dim" style="margin-top:8px">判定顺序：词性 → 搭配 → 语义场。词性不符的选项，语义再通也不能选。</div>';
    }
    // 听力
    const text = (q.o || [])[q.a.charCodeAt(0) - 65] || '';
    return '<div class="small">正确项：<b style="color:var(--ok)">' + q.a + '. ' + esc(text) + '</b></div>' +
      '<div class="small dim" style="margin-top:8px">听力题不给定位句（没有逐句原文），依据是「听到的表述 → 选项的同义替换」。做完把听到的关键词写进复盘，下次听同一类题会更快。</div>';
  }

  function clozeElim(q) {
    const u = UN[q.u];
    if (!u) return '';
    const want = q.pos;
    const rows = u.bank.map(b => {
      const ok = (b.p || '').indexOf(want) >= 0 || b.l === q.a;
      const pz = String(b.p || '').split('/').filter(Boolean).map(posName).join(' / ') || '—';
      return '<div class="dist-item"><span class="lb">' + b.l + '</span><span class="tx">' + esc(b.w) +
        '</span><span class="tg"><span class="chip ' + (ok ? 'ok' : '') + '">' + esc(pz) + '</span></span></div>';
    }).join('');
    return '<div class="small" style="margin-bottom:8px">空位要 <b>' + posName(want) + '</b>。同词性的留在桌面上，其余直接划掉：</div>' + rows;
  }

  function matchScores(q) {
    const u = UN[q.u];
    if (!u) return '';
    const keys = words(q.st);
    const scored = u.paras.map(([l, t]) => {
      const ks = words(t);
      let hit = 0;
      keys.forEach(k => { if (ks.has(k)) hit++; });
      return { l, hit, first: cut(t, 90) };
    }).sort((a, b) => b.hit - a.hit);
    return '<div class="small" style="margin-bottom:8px">按陈述句关键词逐段打分（只看实词重合，用来排除）：</div>' +
      scored.slice(0, 4).map((s, i) => '<div class="dist-item"><span class="lb">' + s.l + '</span><span class="tx">重合 ' + s.hit + ' 个实词 · <span class="dim">' + esc(s.first) + '</span></span>' +
        '<span class="tg">' + (s.l === q.a ? '<span class="chip ok">答案</span>' : i === 0 ? '<span class="chip amber">最高分</span>' : '') + '</span></div>').join('') +
      '<div class="small dim" style="margin-top:8px">词面重合只能用来排除；真正的答案是“换一种说法讲同一件事”的那一段。</div>';
  }

  function wc(t) {
    const m = String(t || '').trim().match(/[A-Za-z][A-Za-z'’-]*/g);
    return m ? m.length : 0;
  }
  function words(t) {
    const STOP = new Set('a an the and or but if of to in on at by for with from as is are was were be been it its this that these those we you they he she his her their our not no more most other some such can could may might will would should do does did have has had than then so because while when where who which what'.split(' '));
    const s = new Set();
    String(t || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).forEach(w => {
      if (w.length > 2 && !STOP.has(w)) s.add(w.slice(0, 5));
    });
    return s;
  }

  /* 听力：四个选项的差异词（只在本项出现、别的项没有的词） */
  function listenDiff(q) {
    const sets = (q.o || []).map(o => words(o));
    const freq = {};
    sets.forEach(st => st.forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
    const rows = (q.o || []).map((o, i) => {
      const l = 'ABCD'[i];
      const ws = String(o).split(/(\s+)/);
      const html = ws.map(tok => {
        const k = tok.toLowerCase().replace(/[^a-z'-]/g, '');
        const k5 = k.slice(0, 5);
        if (k.length > 2 && freq[k5] === 1) return '<b style="color:var(--amber)">' + esc(tok) + '</b>';
        return esc(tok);
      }).join('');
      return '<div class="dist-item"><span class="lb" style="color:' + (l === q.a ? 'var(--ok)' : 'var(--mut)') + '">' + l + '</span>' +
        '<span class="tx">' + html + '</span><span class="tg">' + (l === q.a ? '<span class="chip ok">答案</span>' : '') + '</span></div>';
    }).join('');
    return '<div class="small dim" style="margin-bottom:6px">加粗的是只有这一项才有的词——听的时候就是听它们。</div>' + rows;
  }

  function fold(title, body, open) {
    return '<details class="fold"' + (open ? ' open' : '') + '><summary>' + title + '</summary><div class="foldbody">' + body + '</div></details>';
  }

  function layers1(q) {
    const pt = PMAP[q.pt[0]] || {};
    if (q.k === 'R') {
      return '<p><b>答案 ' + q.a + '</b>：' + esc((q.o || [])[q.a.charCodeAt(0) - 65] || '') + '</p>' +
        (q.loc ? '<p>回原文找到这一句：<span class="dim">' + esc(cut(q.loc, 300)) + '</span></p>' : '') +
        '<p>题干问的是 <b>' + esc(q.ty) + '</b>；定位句的主干给出方向，四个选项里只有一项在<b>方向</b>和<b>范围</b>上都对得上。' +
        (q.rw && q.rw.length ? '命题人做的手脚是同义替换：' + q.rw.map(x => '`' + x[0] + '` ↔ `' + x[1] + '`').join('，') + '。' : '') + '</p>' +
        (pt.boundary ? '<p class="dim">边界：' + esc(pt.boundary) + '</p>' : '');
    }
    if (q.k === 'M') {
      const u = UN[q.u];
      const para = u ? u.paras.find(p => p[0] === q.a) : null;
      return '<p>陈述句：<span class="dim">' + esc(cut(q.st, 200)) + '</span></p>' +
        '<p>答案段 <b>[' + q.a + ']</b>：' + esc(cut(para ? para[1] : '', 260)) + '</p>' +
        '<p>把陈述句拆成「主体 + 动作 + 对象」，去段落里找同义说法；词面全对但讲的是另一件事的段落，是陷阱。</p>';
    }
    if (q.k === 'C') {
      return '<p>空位在：<span class="dim">' + esc(cut(blankSentence(q), 200)) + '</span></p>' +
        '<p>先定词性（' + posName(q.pos) + '），再定搭配，最后看语义场是否和上下文一致。答案是 <b>' + q.a + ' · ' + esc(q.w || '') + '</b>。</p>';
    }
    return '<p><b>答案 ' + q.a + '</b>：' + esc((q.o || [])[q.a.charCodeAt(0) - 65] || '') + '</p>' +
      '<p>听力没有逐句原文，可靠路径是「选项差异 → 带着差异听 → 听到同义表述就落笔」。</p>';
  }
  function layers2(q) {
    const pt = PMAP[q.pt[0]] || {};
    const step = {
      R: ['读题干，只圈名词和动词，不先看选项', '回原文同一段扫这些词，锁定一句', '读定位句主干：谁 + 做了什么 + 方向', '四个选项逐个对主干：方向反的划掉，范围变了的划掉，没提的划掉'],
      M: ['先把十个陈述句的主语和动作划出来', '按“最独特的词”去找段落，不要从 A 开始读', '找到候选段后，读段首句 + 段尾句确认大意', '词面像但主体不同的段落直接排除'],
      C: ['先判空位词性（看冠词、介词、主语位置）', '在词库里按词性分组，砍掉一半', '看空位前后固定搭配', '剩下两三个再比语义场'],
      L: ['播放前先扫选项，圈出四个选项的差异词', '听到差异词立刻定位到题号', '同义替换处就是答案，不要等原词', '没听清就放弃，别拖累下一题'],
    }[q.k] || [];
    return '<p><b>' + esc(pt.name || q.ty) + '</b>：' + esc(pt.judge || '') + '</p>' +
      '<ol style="margin:8px 0 0;padding-left:18px">' + step.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  }
  function layers3(q) {
    const pt = PMAP[q.pt[0]] || {};
    let h = '';
    if (q.d && q.d.length) {
      h += '<p>这道题的三个错项分别用了：' + q.d.map(d => '<b>' + esc(d.t) + '</b>').join('、') + '。</p>';
    }
    if (pt.distract && pt.distract.length) {
      h += '<p>这个考点常见的下套方式：</p><ul style="margin:4px 0 0;padding-left:18px">' +
        pt.distract.map(d => '<li>' + esc(d) + '</li>').join('') + '</ul>';
    }
    if (!h) h = '<p class="dim">这个考点暂无归纳的干扰项套路。</p>';
    return h;
  }
  function layers4(q) {
    const pt = PMAP[q.pt[0]] || {};
    return '<p><b>' + esc(pt.name || q.ty) + '</b>：' + esc(pt.core || '') + '</p>' +
      (pt.boundary ? '<p>边界：' + esc(pt.boundary) + '</p>' : '') +
      '<p class="dim">换一个话题、换一套卷，路径完全一样：' + esc((pt.judge || '').slice(0, 80)) + '</p>' +
      '<p class="dim">脑库笔记：<code>[[' + pNote(q.pt[0]) + ']]</code> · 题目笔记：<code>[[' + qNote(q) + ']]</code></p>';
  }

  function ctxOf(q) {
    const u = UN[q.u];
    if (!u) return q.st || '';
    const t = String(u.text);
    const i = t.indexOf('[[' + pad(q.n) + ']]');
    if (i < 0) return t.slice(0, 90);
    let left = t.slice(Math.max(0, i - 78), i).split(/[.;!?]\s/).pop() || '';
    left = left.replace(/^[^A-Za-z]+/, '').replace(/^\S*\s/, '');
    const right = (t.slice(i + 6, i + 90).split(/[.;!?]/)[0] || '');
    return (left + ' ___ ' + right).trim();
  }
  function blankSentence(q) {
    const u = UN[q.u];
    if (!u) return '';
    const t = String(u.text);
    const token = '[[' + pad(q.n) + ']]';
    const i = t.indexOf(token);
    if (i < 0) return t.slice(0, 160);
    let s = Math.max(0, i - 160), e = Math.min(t.length, i + 160);
    const seg = t.slice(s, e);
    // 收拢到句子边界
    const before = seg.slice(0, i - s);
    const after = seg.slice(i - s + token.length);
    const bs = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
    const cutB = bs >= 0 ? before.slice(bs + 2) : before;
    const m = after.match(/[.;!?]/);
    const cutA = m ? after.slice(0, m.index + 1) : after;
    return (cutB + ' ______ ' + cutA).trim();
  }

  /* ================= 会话动作 ================= */
  /* 选词填空：点材料里的空位直接弹词库。
     手机上整篇材料很长，词库在下面要滚很久 —— 这是「填不了答案」的主要原因。 */
  let pickQ = null;
  function pickBlank(n) {
    if (!sess) return;
    if (sess.done) { toast('已交卷，点「逐题解析」看答案'); return; }
    const cur = curQ();
    if (!cur || cur.k !== 'C') return;
    const all = cFillSet(cur.u, cur.p);
    const q = all.find(x => String(x.n) === String(n)) || cur;
    if (isCJudged(cur) || sess.done) { toast('这篇已经判分了，答案在下面'); return; }
    if (q.id !== cur.id) {
      const idx = sess.ids.indexOf(q.id);
      if (idx >= 0) { sess.i = idx; render(); }
    }
    const u = UN[q.u];
    if (!u) return;
    closePanel();
    pickQ = q;
    const p = document.getElementById('wpanel');
    p.innerHTML = '<div class="row"><b>第 ' + q.n + ' 空</b>' +
      '<span class="small dim">要填 <b>' + posName(q.pos) + '</b></span><span class="grow"></span>' +
      '<button class="btn sm ghost" onclick="DESK.closePanel()">关闭</button></div>' +
      '<div class="wordbank">' + u.bank.map(b =>
        '<div class="wb" onclick="DESK.answerFromPicker(\'' + b.l + '\')"><span class="l">' + b.l + '</span>' + esc(b.w) +
        (b.p ? '<i class="small dim" style="margin-left:5px;font-style:normal">' + esc(b.p) + '</i>' : '') + '</div>').join('') + '</div>' +
      '<div class="small dim" style="margin-top:8px">先按词性排除，再看搭配与语义。十个空填完统一判分。</div>';
    p.classList.add('on');
    fitPanel();
  }
  function answerFromPicker(l) {
    const q = pickQ; pickQ = null;
    closePanel();
    if (q && q.k === 'C') answerC(q, l); else answer(l);
  }

  /* ===== 选词填空：十个空填完才统一判分 ===== */
  function cSet(u) {
    if (!sess) return [];
    return sess.ids.map(id => QMAP[id])
      .filter(x => x && x.k === 'C' && x.u === u)
      .sort((a, b) => a.n - b.n);
  }
  /* 整篇文章的十个空（不管这次练了几个），填满它才公布答案。
     同一 unit 可能被多套卷共用（如 mock-1 / mock-4），必须按试卷区分。 */
  function cFillSet(u, p) {
    return ALLQ.filter(x => x && x.k === 'C' && x.u === u && (!p || x.p === p)).sort((a, b) => a.n - b.n);
  }
  function isCJudged(q) {
    return !!(sess && sess.cJudge && sess.cJudge[q.u]);
  }
  /* 只记账、不动界面 */
  function commitAnswer(q, letter) {
    const ok = letter === q.a;
    if (ok) sess.right++;
    const rec = S.qs[q.id] || {};
    S.qs[q.id] = { a: letter, ok: ok, ts: Date.now(), cause: rec.cause || '', n: (rec.n || 0) + 1 };
    (q.pt || []).forEach(id => {
      const st = S.pts[id] || (S.pts[id] = { s: 0, r: 0, hist: [] });
      st.s++; if (ok) st.r++;
      st.hist = st.hist || []; st.hist.push(ok ? 1 : 0);
      if (st.hist.length > 20) st.hist.shift();
    });
    const d = today();
    const day = S.days[d] || (S.days[d] = { n: 0, r: 0 });
    day.n++; if (ok) day.r++;
    if (!ok) {
      const w = S.wrong[q.id] || { n: 0 };
      w.n = (w.n || 0) + 1; w.ts = Date.now(); w.a = letter;
      S.wrong[q.id] = w;
    } else if (S.wrong[q.id]) {
      delete S.wrong[q.id];
    }
    save();
    return ok;
  }
  function answerC(q, letter) {
    /* 套卷里点材料空位：和点选项一样，只存答案，交卷统一判分 */
    if (sess.exam && !sess.done) {
      sess.ans[q.id] = letter; saveDraft(); render(); return;
    }
    const had = sess.ans[q.id];
    if (had !== undefined && (isCJudged(q) || sess.exam)) { toast('第 ' + q.n + ' 空已填：' + had); return; }
    sess.ans[q.id] = letter;
    sess.dur = sess.dur || {};
    if (!sess.dur[q.id]) sess.dur[q.id] = Date.now() - (sess.lastTs || sess.t0);
    /* 单题重做只判这一题，不要求填满整篇十个空 */
    const all = sess.mode === 'single' ? [q] : cFillSet(q.u, q.p);
    const left = all.filter(x => sess.ans[x.id] === undefined);
    if (left.length) {
      /* 还没填完：只填空、不判分，自动跳到下一个空 */
      const nxt = left[0];
      const idx = sess.ids.indexOf(nxt.id);
      if (idx >= 0) sess.i = idx;
      save(); render();
      toast('第 ' + q.n + ' 空已填「' + letter + '」· 还剩 ' + left.length + ' 个空');
      setTimeout(() => {
        const el = document.querySelector('.blank.cur');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 80);
      return;
    }
    /* 十个空都填完 → 统一判分（只记本次练到的题） */
    cSet(q.u).forEach(x => commitAnswer(x, sess.ans[x.id]));
    sess.cJudge = sess.cJudge || {};
    sess.cJudge[q.u] = true;
    save(); render();
    setTimeout(() => {
      const el = document.querySelector('.verdict');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }

  function answer(letter) {
    const q = curQ();
    if (!q) return;
    /* 套卷：先存答案，交卷才判分，可以改 */
    if (sess.exam && !sess.done) {
      sess.ans[q.id] = letter;
      saveDraft(); render();
      const nx = document.getElementById('anshint');
      if (nx) nx.textContent = '已选 ' + letter;
      return;
    }
    if (q.k === 'C') return answerC(q, letter);
    if (sess.ans[q.id] !== undefined) return;
    sess.ans[q.id] = letter;
    sess.dur = sess.dur || {};
    sess.dur[q.id] = Date.now() - (sess.lastTs || sess.t0);
    commitAnswer(q, letter);
    render();
    const el = document.querySelector('.verdict');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function setCause(c) {
    const q = curQ(); if (!q) return;
    sess.cause[q.id] = c;
    if (S.qs[q.id]) S.qs[q.id].cause = c;
    if (S.wrong[q.id]) S.wrong[q.id].cause = c;
    save(); render();
  }
  function nextQ() {
    if (!sess) return;
    if (sess.exam) {
      if (sess.i + 1 >= sess.ids.length) { submitExam(); return; }
      sess.i++; saveDraft(); render(); window.scrollTo(0, 0); return;
    }
    if (sess.i + 1 >= sess.ids.length) { finish(); return; }
    sess.i++;
    sess.lastTs = Date.now();
    render(); window.scrollTo(0, 0);
  }
  function prevQ() {
    if (!sess || sess.i === 0) return;
    sess.i--; sess.lastTs = Date.now();
    if (sess.exam) saveDraft();
    render(); window.scrollTo(0, 0);
  }
  function finish() {
    if (!sess) return;
    /* 提前结束时，已填但还没判分的选词空也要计入记录 */
    if (!sess.cJudge) sess.cJudge = {};
    sess.ids.map(id => QMAP[id]).forEach(x => {
      if (x && x.k === 'C' && sess.ans[x.id] !== undefined && !sess.cJudge[x.u]) {
        commitAnswer(x, sess.ans[x.id]);
        sess.cJudge[x.u] = true;
      }
    });
    sess.done = true;
    sess.dur = sess.dur || {};
    const answered = answeredCount();
    const spent = Date.now() - sess.t0;
    sess.spent = spent;
    const now = new Date();
    S.runs.push({
      ts: Date.now(), date: today(), hh: now.getHours(), mm: now.getMinutes(),
      mode: sess.mode, modeName: modeName(sess), n: answered, planned: sess.ids.length,
      right: sess.right, dur: spent, ids: sess.ids.slice(),
    });
    if (S.runs.length > 300) S.runs = S.runs.slice(-300);
    save(); render(); window.scrollTo(0, 0);
  }
  function endEarly() {
    if (!sess) return;
    if (sess.exam) return submitExam();
    if (sess.i === 0 && !Object.keys(sess.ans).length) { sess = null; go('desk'); return; }
    finish();
  }
  function answeredCount() {
    if (!sess) return 0;
    return sess.ids.filter(id => sess.ans[id] !== undefined).length;
  }
  function modeName(s) {
    if (s.mode === 'paper') return '套卷 · ' + ((PAPER[s.paperKey] || {}).label || '');
    if (s.mode === 'smart') return '智能组卷';
    if (s.mode === 'weak') return '弱项专攻';
    if (s.mode === 'point') return '考点专攻 · ' + ((PMAP[s.pid] || {}).name || s.pid);
    if (s.mode === 'module') return '专项 · ' + KIND[s.kind].full;
    if (s.mode === 'new') return '新题';
    if (s.mode === 'wrong') return '错题重练';
    return '训练';
  }

  /* ================= 结果页 ================= */
  function viewSummary() {
    if (!sess) return '';
    const planned = sess.ids.length;
    const total = answeredCount() || planned;
    const right = sess.right;
    const acc = total ? right / total : 0;
    const spent = sess.spent || (Date.now() - sess.t0);
    const wrongs = sess.ids.map(id => QMAP[id]).filter(q => q && sess.ans[q.id] !== undefined && sess.ans[q.id] !== q.a);
    const touched = {};
    sess.ids.forEach(id => { const q = QMAP[id]; (q.pt || []).forEach(p => { touched[p] = 1; }); });

    let h = '<div class="wrap"><div class="scorehero">' +
      ring(acc) +
      '<div class="grow"><div class="small dim">' + esc(modeName(sess)) + '</div>' +
      '<div style="font-size:22px;font-weight:650;margin:2px 0 6px">' + (acc >= 0.8 ? '这组稳' : acc >= 0.6 ? '及格线上，还能再压' : '这组暴露的问题值得记') + '</div>' +
      '<div class="small">' + (total < planned ? '已答 ' + total + ' / ' + planned + ' 题' : total + ' 题') + ' · 对 ' + right + ' · 错 ' + (total - right) + ' · 用时 ' + fmtDur(spent) + '</div>' +
      '<div class="row wrap" style="margin-top:12px;gap:7px">' +
      Object.keys(touched).slice(0, 8).map(id => '<span class="chip acc">' + id + ' ' + esc((PMAP[id] || {}).name || '') + '</span>').join('') +
      '</div></div>' +
      '<div style="margin-left:auto;display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn pri" onclick="DESK.exportSession()">导出复盘 md</button>' +
      '<button class="btn ghost" onclick="DESK.startSetup(\'smart\',10)">再来一组</button>' +
      '</div></div>';

    if (wrongs.length) {
      h += '<h2>错题 ' + wrongs.length + ' 道 · 已经进错题本</h2><div class="card pad0"><table class="t"><thead><tr><th>题</th><th>考点</th><th>我选</th><th>答案</th><th>错因</th><th></th></tr></thead><tbody>' +
        wrongs.map(q => '<tr><td><span class="chip">' + KIND[q.k].n + '</span> ' + esc(cut(q.st || (q.k === 'L' ? '第 ' + q.n + ' 题 · ' + q.ty + '（听力）' : ctxOf(q)), 46)) + '</td>' +
          '<td class="dim">' + (q.pt[0] || '') + ' ' + esc((PMAP[q.pt[0]] || {}).name || '') + '</td>' +
          '<td class="mono" style="color:var(--bad)">' + (sess.ans[q.id] || '—') + '</td>' +
          '<td class="mono" style="color:var(--ok)">' + q.a + '</td>' +
          '<td class="dim">' + esc(CAUSE_NAME[sess.cause[q.id]] || '未标') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn sm ghost" onclick="DESK.single(\'' + q.id + '\')">重做</button> ' +
          '<button class="btn sm ghost" onclick="DESK.openPoint(\'' + q.pt[0] + '\')">考点</button></td></tr>').join('') +
        '</tbody></table></div>';
    }

    h += '<h2>下一步</h2><div class="cols"><div class="card"><h3>把这次变成脑节点</h3>' +
      '<div class="small">导出的是标准 Obsidian 复盘笔记：frontmatter + 本次数据 + 每道错题的双链、我选/答案、错因、依据句。' +
      '丢进 <code>04-复盘</code>，图谱里这批考点会被点亮。</div>' +
      '<div style="margin-top:12px" class="row wrap"><button class="btn sm" onclick="DESK.exportSession()">下载复盘 md</button>' +
      '<button class="btn sm ghost" onclick="DESK.copySessionMd()">复制 markdown</button>' +
      '<button class="btn sm ghost" onclick="DESK.go(\'vault\')">接入说明</button></div></div>' +
      '<div class="card"><h3>这组暴露的考点</h3>' +
      (Object.keys(touched).slice(0, 5).map(id => {
        const m = mastery(id);
        return '<div class="row" style="padding:4px 0"><span class="grow" style="font-size:13px">' + esc((PMAP[id] || {}).name || id) + '</span>' +
          '<span class="mono small" style="color:' + ((m || 0) < 0.6 ? 'var(--bad)' : 'var(--mut)') + '">' + (m == null ? '—' : Math.round(m * 100) + '%') + '</span></div>';
      }).join('') || '<div class="small dim">无</div>') +
      '</div></div>';
    h += '</div>';
    return h;
  }
  function ring(acc) {
    const R = 44, C = 2 * Math.PI * R;
    const on = Math.max(0, Math.min(1, acc)) * C;
    const col = acc >= 0.8 ? 'var(--ok)' : acc >= 0.6 ? 'var(--amber)' : 'var(--bad)';
    return '<div class="ring"><svg width="104" height="104" viewBox="0 0 104 104">' +
      '<circle cx="52" cy="52" r="' + R + '" fill="none" stroke="var(--line2)" stroke-width="8"/>' +
      '<circle cx="52" cy="52" r="' + R + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + on + ' ' + C + '"/>' +
      '</svg><div class="num"><b style="color:' + col + '">' + Math.round(acc * 100) + '%</b><span>正确率</span></div></div>';
  }

  /* ================= 考点地图 ================= */
  function viewBrain() {
    const groups = [
      ['听力', ['L']], ['阅读', ['R']], ['干扰项', ['D']], ['选词填空', ['C']], ['长篇匹配', ['M']], ['写作', ['W']], ['翻译', ['T']],
    ];
    let h = '<div class="wrap"><div style="margin-top:22px"><h1>考点地图</h1>' +
      '<div class="small" style="margin-top:6px">43 个考点是脑库的骨架：每道真题挂 1–2 个考点，每个考点又有自己的笔记。这里显示的是<b>你在每个考点上的实测正确率</b>。</div></div>';

    h += '<div class="card" style="margin-top:16px;padding:16px 18px">' +
      '<div class="row" style="margin-bottom:6px"><b style="font-size:14.5px">知识网络</b>' +
      '<span class="small dim" style="margin-left:8px">点 = 考点，线 = 同一道题或同一篇文章里一起出现，颜色 = 你的正确率</span>' +
      '<span class="grow"></span><span class="small dim">点一下进考点</span></div>' +
      '<div class="row wrap" style="gap:12px;margin:2px 0 8px">' +
      [['L', '听力'], ['R', '仔细阅读'], ['D', '干扰项'], ['C', '选词填空'], ['M', '长篇匹配'], ['W', '写作'], ['T', '翻译']].map(([k, n]) =>
        '<span class="small dim" style="display:inline-flex;align-items:center;gap:5px"><i style="width:7px;height:7px;border-radius:99px;background:' +
        (KIND[k]?.color || '#eea2aa') + ';display:inline-block"></i>' + n + '</span>').join('') +
      '<span class="small dim" style="margin-left:6px">· 半透明 = 还没练过</span></div>' +
      graphSVG() + '</div>';

    h += '<div class="stats" style="margin-top:16px">' +
      statCard('考点总数', PTS.length, '个', '覆盖 7 个模块') +
      statCard('练过的考点', PTS.filter(p => ptStat(p.id).s > 0).length, '个', '至少答过一次') +
      statCard('最稳的考点', bestPoint() || '—', '', '正确率最高') +
      statCard('最弱的考点', weakPoints(1).length ? (PMAP[weakPoints(1)[0].id] || {}).name : '—', '', '优先补') +
      '</div>';

    groups.forEach(([gn, ids]) => {
      const list = PTS.filter(p => ids.indexOf(p.id[0]) >= 0);
      if (!list.length) return;
      h += '<h2>' + gn + ' <span class="dim" style="font-size:12px;font-weight:400">' + list.length + ' 个考点</span></h2><div class="pgrid">';
      list.forEach(p => {
        const m = mastery(p.id), st = ptStat(p.id);
        const pct = m == null ? 0 : Math.round(m * 100);
        h += '<div class="pcard" onclick="DESK.openPoint(\'' + p.id + '\')">' +
          '<div class="id">' + p.id + '</div><b>' + esc(p.name) + '</b>' +
          '<div class="mt"><div class="bar"><i style="width:' + pct + '%;background:' + (m == null ? 'var(--line2)' : pct < 60 ? 'var(--bad)' : pct < 80 ? 'var(--amber)' : 'var(--ok)') + '"></i></div>' +
          '<span class="mono">' + (m == null ? '未练' : pct + '%') + '</span></div>' +
          '<div class="small dim" style="margin-top:6px">' + p.n + ' 题 · 我练过 ' + st.s + ' 次</div>' +
          '</div>';
      });
      h += '</div>';
    });

    h += '<h2>这张图怎么读</h2><div class="card"><div class="small">' +
      '绿色 = 稳（≥80%），黄色 = 半会（60–80%），红色 = 没通（&lt;60%），灰条 = 还没练过。' +
      '点任意考点，能看到它的判定信号、常见下套方式和边界，以及你在这个考点上错过的题——那些题就是你在 Obsidian 里该补的笔记。</div></div>';
    h += '</div>';
    return h;
  }
  /* 考点共现网络：同题共现 + 同篇材料共现 */
  function graphSVG() {
    const W = 1040, H = 430;
    const nodes = PTS.map(p => ({
      id: p.id, name: p.name, mod: p.id[0], n: p.n,
      m: mastery(p.id), x: 0, y: 0, vx: 0, vy: 0,
    }));
    const idx = {};
    nodes.forEach((n, i) => { idx[n.id] = i; });
    const ew = {};
    const addPair = (a, b, w) => {
      if (a === b || idx[a] === undefined || idx[b] === undefined) return;
      const k = a < b ? a + '|' + b : b + '|' + a;
      ew[k] = (ew[k] || 0) + w;
    };
    QS.forEach(q => {
      const ps = (q.pt || []).filter(x => idx[x] !== undefined);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) addPair(ps[i], ps[j], 3);
    });
    // 同一篇材料下的题（同一篇文章），把它们的考点连起来
    const byUnit = {};
    QS.forEach(q => {
      if (!q.u) return;
      const ps = (q.pt || []).filter(x => idx[x] !== undefined);
      if (!ps.length) return;
      byUnit[q.u] = byUnit[q.u] || {};
      ps.forEach(x => { byUnit[q.u][x] = 1; });
    });
    Object.values(byUnit).forEach(set => {
      const arr = Object.keys(set);
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addPair(arr[i], arr[j], 1);
    });

    const edges = Object.keys(ew).map(k => {
      const [a, b] = k.split('|');
      return { a: idx[a], b: idx[b], w: ew[k] };
    });
    const maxW = Math.max(1, ...edges.map(e => e.w));

    // 初始位置：按模块分扇区
    const mods = [];
    nodes.forEach(n => { if (mods.indexOf(n.mod) < 0) mods.push(n.mod); });
    nodes.forEach((n, i) => {
      const gi = mods.indexOf(n.mod);
      const ang = (gi / mods.length) * Math.PI * 2 + (i % 4) * 0.22;
      const rad = 80 + (i % 9) * 16;
      n.x = W / 2 + Math.cos(ang) * rad;
      n.y = H / 2 + Math.sin(ang) * rad * 0.66;
    });

    for (let step = 0; step < 420; step++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 1;
          if (d2 > 120000) continue;
          const f = 2200 / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      edges.forEach(e => {
        const a = nodes[e.a], b = nodes[e.b];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 74;
        const f = (d - target) * 0.0055 * (1 + e.w / maxW);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      });
      nodes.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.0012;
        n.vy += (H / 2 - n.y) * 0.0018;
        n.vx *= 0.84; n.vy *= 0.84;
        n.x += Math.max(-14, Math.min(14, n.vx));
        n.y += Math.max(-12, Math.min(12, n.vy));
      });
    }

    // 归一化到画布（填满，别挤在中间）
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
    const padX = 46, padY = 28;
    nodes.forEach(n => {
      n.x = padX + (n.x - minX) / (maxX - minX || 1) * (W - padX * 2);
      n.y = padY + (n.y - minY) / (maxY - minY || 1) * (H - padY * 2);
    });

    // 模块标签（放在该模块节点重心上方）
    const MODNAME = { L: '听力', R: '仔细阅读', D: '干扰项', C: '选词填空', M: '长篇匹配', W: '写作', T: '翻译' };
    const gl = {};
    nodes.forEach(n => {
      const g = gl[n.mod] || (gl[n.mod] = { x: 0, y: 0, c: 0, top: 1e9, l: 1e9, r: -1e9 });
      g.x += n.x; g.y += n.y; g.c++;
      g.top = Math.min(g.top, n.y); g.l = Math.min(g.l, n.x); g.r = Math.max(g.r, n.x);
    });
    const glabels = '';

    const lines = edges.map(e => {
      const a = nodes[e.a], b = nodes[e.b];
      const k = e.w / maxW;
      const op = 0.07 + k * 0.33;
      return '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) +
        '" stroke="#8a77ab" stroke-opacity="' + op.toFixed(2) + '" stroke-width="' + (0.5 + k * 1.8).toFixed(1) + '"/>';
    }).join('');

    const dots = nodes.map(n => {
      const r = 4.4 + Math.min(4.5, Math.log(1 + n.n) * 1.0);
      const col = n.m == null ? (KIND[n.mod]?.color || '#eea2aa') : n.m >= 0.8 ? 'var(--ok)' : n.m >= 0.6 ? 'var(--amber)' : 'var(--bad)';
      const fillOp = n.m == null ? 0.42 : 0.9;
      return '<g style="cursor:pointer" onclick="DESK.openPoint(\'' + n.id + '\')"><title>' + esc(n.id + ' ' + n.name) + ' · ' + n.n + ' 题 · ' + (n.m == null ? '未练' : Math.round(n.m * 100) + '%') + '</title>' +
        '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + col + '" fill-opacity="' + fillOp + '" stroke="var(--bg)" stroke-width="1.1"/>' +
        '<text x="' + (n.x + r + 3).toFixed(1) + '" y="' + (n.y + 3).toFixed(1) + '" font-size="9.5" fill="var(--mut)" font-family="ui-monospace,monospace">' + n.id + '</text></g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + lines + glabels + dots + '</svg>';
  }

  function bestPoint() {
    let best = null, bm = -1;
    PTS.forEach(p => {
      const st = ptStat(p.id);
      if (st.s >= 3) { const m = st.r / st.s; if (m > bm) { bm = m; best = p.name; } }
    });
    return best;
  }

  function openPoint(pid) {
    const p = PMAP[pid];
    if (!p) return;
    const st = ptStat(pid);
    const m = st.s ? st.r / st.s : null;
    const qs = QS.filter(q => (q.pt || []).indexOf(pid) >= 0);
    const mine = qs.filter(q => S.qs[q.id]).sort((a, b) => (S.qs[b.id].ts || 0) - (S.qs[a.id].ts || 0)).slice(0, 8);
    const wrong = qs.filter(q => S.wrong[q.id]).slice(0, 6);

    let h = '<div class="mask" onclick="if(event.target===this)DESK.closeModal()"><div class="modal">' +
      '<div class="xh"><span class="chip acc">' + p.id + '</span><b style="font-size:16px">' + esc(p.name) + '</b>' +
      '<span class="grow"></span><button class="btn sm ghost" onclick="DESK.closeModal()">关闭</button></div>' +
      '<div class="row" style="gap:8px;margin-bottom:12px"><span class="chip">' + p.n + ' 道真题</span>' +
      '<span class="chip">我练过 ' + st.s + ' 次</span>' +
      '<span class="chip ' + (m == null ? '' : m >= 0.8 ? 'ok' : m < 0.6 ? 'bad' : 'amber') + '">正确率 ' + (m == null ? '—' : Math.round(m * 100) + '%') + '</span>' +
      '<span class="chip">' + esc(p.group) + '</span></div>';

    h += '<div class="sec-h">核心结论</div><div style="font-size:13.5px;line-height:1.8">' + esc(p.core) + '</div>';
    h += '<div class="sep"></div><div class="sec-h">判定信号（什么时候用）</div><div class="small">' + esc(p.judge) + '</div>';
    h += '<div class="sep"></div><div class="sec-h">命题人怎么下套</div><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.85">' +
      (p.distract || []).map(d => '<li>' + esc(d) + '</li>').join('') + '</ul>';
    if (p.boundary) h += '<div class="sep"></div><div class="sec-h">边界（什么时候不适用）</div><div class="small">' + esc(p.boundary) + '</div>';

    if (wrong.length) {
      h += '<div class="sep"></div><div class="sec-h">我在这个考点上错的题</div>' +
        wrong.map(q => '<div class="dist-item" style="cursor:pointer" onclick="DESK.single(\'' + q.id + '\')"><span class="lb">' + KIND[q.k].n + '</span>' +
          '<span class="tx">' + esc(cut(q.st || ctxOf(q), 70)) + '<div class="dim" style="font-size:11.5px">' + paperLabel(q.p) + ' · 第 ' + q.n + ' 题 · 错过 ' + ((S.wrong[q.id] || {}).n || 1) + ' 次</div></span>' +
          '<span class="tg"><span class="chip">重做</span></span></div>').join('');
    }

    h += '<div class="sep"></div><div class="sec-h">脑库里的位置</div>' +
      '<div class="small">笔记：<code>[[' + pNote(p.id) + ']]</code></div>' +
      '<div class="small dim" style="margin-top:4px">这个考点下共 ' + p.n + ' 道真题，在 Obsidian 里打开考点笔记能看到全部反链。</div>';

    h += '<div class="row" style="margin-top:18px"><button class="btn pri" onclick="DESK.startPoint(\'' + p.id + '\',10)">练这个考点 · 10 题</button>' +
      '<button class="btn ghost" onclick="DESK.copyPoint(\'' + p.id + '\')">复制双链</button>' +
      '<span class="grow"></span><span class="small dim">' + (mine.length ? '最近练过 ' + mine.length + ' 题' : '还没练过') + '</span></div>';

    h += '</div></div>';
    showModal(h);
  }

  /* ================= 单词本 ================= */
  const CJK_RE = /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
  const EN_RE = /^[A-Za-z][A-Za-z'’\-]*(?:[ ,;]+[A-Za-z][A-Za-z'’\-]*){0,5}$/;
  let wFilter = 'all';

  function enOnly(raw) {
    let t = String(raw || '').trim().replace(/^[\s"'“”‘’()\[\]{}]+/, '').replace(/[\s"'“”‘’()\[\]{}.,;:!?]+$/, '');
    if (!t || t.length > 42) return '';
    if (CJK_RE.test(t)) return '';
    if (!/[A-Za-z]/.test(t)) return '';
    if (!EN_RE.test(t)) return '';
    return t;
  }
  function sentenceOK(raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 6 || t.length > 420) return '';
    if (CJK_RE.test(t)) return '';
    const ws = t.match(/[A-Za-z][A-Za-z'’\-]*/g) || [];
    if (ws.length < 2) return '';
    const hasEnd = /[.!?]["'”)]?$/.test(t);
    if (ws.length <= 6 && !hasEnd) return '';
    return t;
  }

  function viewWords() {
    const all = S.words || [];
    const y = all.filter(w => w.c === 'y').length;
    const r = all.filter(w => w.c === 'r').length;
    const list = all.filter(w => wFilter === 'all' || w.c === wFilter);

    let h = '<div class="wrap"><div style="margin-top:22px"><h1>单词本</h1>' +
      '<div class="small" style="margin-top:6px">在任意原文、题干、解析里<b>划选一个英文词</b>，弹出「译 / 黄标 / 红标」；选中整句英文时变成「译整句」。' +
      '释义走内置离线词库（' + (window.dictInit ? window.dictInit().size : 0) + ' 条，自动还原 studies→study、running→run），没收录的给在线英汉入口。</div></div>';

    h += '<div class="stats" style="margin-top:16px">' +
      statCard('全部', all.length, '词', '黄标 + 红标') +
      statCard('黄标 · 要背', y, '词', '会读不会用') +
      statCard('红标 · 易错', r, '词', '错过或拼错') +
      statCard('今天新增', all.filter(w => w.t && w.t > Date.now() - 864e5).length, '词', '划词自动收录') +
      '</div>';

    h += '<div class="row wrap" style="margin-top:6px;gap:8px">' +
      [['all', '全部'], ['y', '黄标'], ['r', '红标']].map(([k, n]) =>
        '<span class="chip click ' + (wFilter === k ? 'acc' : '') + '" style="padding:7px 14px;font-size:13px" onclick="DESK.wFilter(\'' + k + '\')">' + n + '</span>').join('') +
      '<span class="grow"></span>' +
      '<input id="wadd" class="winput" placeholder="手动加一个词，回车收录" onkeydown="if(event.key===\'Enter\')DESK.manualWord(this.value)">' +
      '</div>';

    h += '<div class="card" style="margin-top:14px;padding:0">';
    if (!list.length) {
      h += '<div class="empty"><b>还没有词</b>去做题或看解析，划一个不认识的词试试——比如在阅读原文里选中 <i>infrastructure</i>。</div>';
    } else {
      h += '<div class="wlist">' + list.map(w => {
        const i = all.indexOf(w);
        return '<div class="wrow">' +
          '<span class="wmark ' + (w.c === 'y' ? 'y' : 'r') + '"></span>' +
          '<div class="grow" style="min-width:0"><div class="wh"><b>' + esc(w.w) + '</b>' +
          (w.ph ? '<span class="small dim">' + esc(w.ph) + '</span>' : '') + '</div>' +
          '<div class="small" style="margin-top:2px">' + esc(w.d || '—') + '</div>' +
          '<div class="small dim" style="margin-top:3px">' + esc(w.src || '') + (w.t ? ' · ' + new Date(w.t).toLocaleDateString('zh-CN') : '') + '</div></div>' +
          '<div class="wacts">' +
          '<button class="btn sm ghost" onclick="DESK.say(\'' + esc(w.w).replace(/'/g, "\\'") + '\')" title="朗读">🔊</button>' +
          '<button class="btn sm ghost ' + (w.c === 'y' ? 'acc' : '') + '" onclick="DESK.wordColor(' + i + ',\'y\')">黄</button>' +
          '<button class="btn sm ghost ' + (w.c === 'r' ? 'acc' : '') + '" onclick="DESK.wordColor(' + i + ',\'r\')">红</button>' +
          '<button class="btn sm ghost" onclick="DESK.wordDel(' + i + ')">删</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    h += '</div>';

    if (all.length) {
      h += '<div class="row wrap" style="margin-top:14px;gap:8px">' +
        '<button class="btn sm ghost" onclick="DESK.exportWords()">导出 TXT</button>' +
        '<button class="btn sm ghost" onclick="DESK.copyWords()">复制全部</button>' +
        '<button class="btn sm ghost" onclick="DESK.reviewWords()">开始背（黄标优先）</button>' +
        '<button class="btn sm ghost" onclick="if(confirm(\'清空单词本？\')){DESK.clearWords()}">清空</button></div>';
    }
    h += '</div>';
    return h;
  }

  function manualWord(t) {
    const w = enOnly(t);
    if (!w) return toast('只收英文单词或短语');
    saveWord(w, 'y');
    const el = document.getElementById('wadd'); if (el) el.value = '';
    render();
  }
  function wordColor(i, c) { if (S.words[i]) { S.words[i].c = c; S.words[i].t = Date.now(); save(); render(); } }
  function wordDel(i) { S.words.splice(i, 1); save(); render(); }
  function clearWords() { S.words = []; save(); render(); }
  function setWords(list) { S.words = list; save(); render(); }

  function say(t) {
    if (!window.speechSynthesis) return toast('当前浏览器不支持朗读');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(t));
    u.lang = 'en-US'; u.rate = 0.92;
    speechSynthesis.speak(u);
  }

  function saveWord(txt, color, definition) {
    const t = enOnly(txt);
    if (!t) return;
    const one = /^[A-Za-z][A-Za-z'’\-]*$/.test(t);
    const r = one ? window.lookup(t) : null;
    const phrase = !one ? CET_PHRASES.get(t.toLowerCase()) : null;
    const cur = (S.words || []).find(w => w.w.toLowerCase() === t.toLowerCase());
    const def = definition ?? (cur?.d || phrase?.def || (r && !r.compound ? r.def : '') || window.dictInit().get(t.toLowerCase()) || '');
    if (cur) {
      cur.c = color; cur.t = Date.now();
      cur.d = def;
    } else {
      S.words = S.words || [];
      S.words.unshift({
        w: t, d: def, c: color, ph: r && r.base && !r.compound ? '原形 ' + r.base : '',
        src: wordSrc(), t: Date.now(),
      });
    }
    save(); toast('已加入单词本 · ' + (color === 'y' ? '黄标' : '红标'));
    if (view === 'words') render();
    return cur || S.words[0];
  }
  function wordSrc() {
    if (sess && sess.exam) return (PAPER[sess.paperKey] || {}).label || '套卷';
    const q = sess ? curQ() : null;
    if (q) return paperLabel(q.p) + (q.n ? ' 第 ' + q.n + ' 题' : '');
    if (view === 'words') return '单词本';
    return '';
  }

  /* ---------- 划词：浮动条（移动端优先） ----------
     鸿蒙 / 安卓的长按选词常常拿不到「一个词」：
       · 长按粒度粗，选中的往往是整行或整段 → enOnly 拒、sentenceOK 也拒，于是什么都不弹；
       · 选好之后用户拖手柄调整范围，只有 selectionchange，不会再有第二次 touchend；
       · 点浮动条时浏览器先取消选择，部分机型因此吞掉 click。
     所以三条路一起上：selection（桌面主路径）+ 落点取词（移动主路径）+ 常驻「查词」入口（兜底）。 */
  let selText = '', selMode = 'word';
  let lastPoint = null, barGuard = 0, barShownAt = 0;
  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  /* 鸿蒙 / 部分国产内核：长按只给整段选择，caretRangeFromPoint 也可能不可用。
     所以取词走三级：标准 caret API → Range 矩形命中 → 元素首个英文词。 */
  const UA = navigator.userAgent || '';
  const IS_HARMONY = /HarmonyOS|OpenHarmony|ArkWeb|HuaweiBrowser|HUAWEI/i.test(UA);

  function hideBar() {
    const bar = document.getElementById('wbar');
    if (bar) bar.classList.remove('on');
  }
  function barOn() {
    const b = document.getElementById('wbar');
    return !!(b && b.classList.contains('on'));
  }

  /* 从一个文本节点 + 偏移，向两边扩出完整的英文词 */
  function wordAround(str, off) {
    if (!str) return '';
    const W = /[A-Za-z'’\-]/;
    let i = Math.min(Math.max(off || 0, 0), str.length);
    const inWord = (k) => (k < str.length && W.test(str.charAt(k))) || (k > 0 && W.test(str.charAt(k - 1)));
    if (!inWord(i)) {
      /* 落点常落在词尾空格上，往右挪一小段找最近的字母 */
      let j = i;
      while (j < str.length && !W.test(str.charAt(j)) && j - i <= 14) j++;
      if (j < str.length && j - i <= 14) i = j;
      else {
        let k = i;
        while (k > 0 && !W.test(str.charAt(k - 1)) && i - k <= 14) k--;
        i = k;
      }
    }
    let a = i, b = i;
    while (a > 0 && W.test(str.charAt(a - 1))) a--;
    while (b < str.length && W.test(str.charAt(b))) b++;
    return enOnly(str.slice(a, b)) || '';
  }

  /* 通用兜底：用 Range.getClientRects() 做字符命中，不依赖 caretRangeFromPoint */
  function charNodeAtPoint(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    let root = hit;
    try { root = hit.closest('p,li,blockquote,td,th,h1,h2,h3,h4,h5,h6,dd,dt,.qtext,.stem,.small') || hit; } catch (e) { }
    if (!root || !root.nodeType) return null;
    let walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const v = n.nodeValue;
          if (!v || !/[A-Za-z]/.test(v)) return NodeFilter.FILTER_REJECT;
          const pe = n.parentElement;
          if (!pe) return NodeFilter.FILTER_REJECT;
          const tag = pe.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    } catch (e) { return null; }
    const range = document.createRange();
    let n, guard = 0;
    while ((n = walker.nextNode()) && guard < 300) {
      guard++;
      const len = (n.nodeValue || '').length;
      if (!len || len > 1200) continue;
      try {
        range.setStart(n, 0); range.setEnd(n, len);
        const br = range.getBoundingClientRect();
        if (!br || !br.width || x < br.left - 2 || x > br.right + 2 || y < br.top - 2 || y > br.bottom + 2) continue;
        const step = len > 260 ? 2 : 1;
        for (let i = 0; i < len; i += step) {
          range.setStart(n, i); range.setEnd(n, Math.min(i + step, len));
          const rs = range.getClientRects();
          for (let k = 0; k < rs.length; k++) {
            const r = rs[k];
            if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) {
              return { node: n, off: i };
            }
          }
        }
      } catch (e) { }
    }
    return null;
  }

  /* 从屏幕坐标反推落点所在的那个英文词 */
  function wordAtPoint(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return '';
    let node = null, off = 0;
    /* ① 标准 API */
    try {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r && r.startContainer) { node = r.startContainer; off = r.startOffset; }
      } else if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p && p.offsetNode) { node = p.offsetNode; off = p.offset; }
      }
    } catch (e) { }
    if (node && node.nodeType === 3) {
      const w = wordAround(node.nodeValue || '', off);
      if (w) return w;
    }
    /* ② Range 矩形命中（不挑内核） */
    try {
      const h = charNodeAtPoint(x, y);
      if (h) {
        const w = wordAround(h.node.nodeValue || '', h.off);
        if (w) return w;
      }
    } catch (e) { }
    /* ③ 元素里第一个英文词（最粗糙，但不至于什么都不弹） */
    try {
      const el = document.elementFromPoint(x, y);
      if (el && el.textContent) {
        const m = el.textContent.match(/[A-Za-z][A-Za-z'’\-]{1,20}/);
        if (m) return enOnly(m[0]) || '';
      }
    } catch (e) { }
    return '';
  }

  /* 用 visualViewport 夹住位置 —— 手机上软键盘 / 缩放后 innerHeight 不等于可视高度 */
  function placeBar(rect) {
    const bar = document.getElementById('wbar');
    if (!bar) return;
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const ox = vv ? vv.offsetLeft : 0;
    const oy = vv ? vv.offsetTop : 0;
    bar.style.left = '0px'; bar.style.top = '0px';
    const bw = bar.offsetWidth || 180, bh = bar.offsetHeight || 34;
    let left, top;
    if (rect && (rect.width || rect.left || rect.top)) {
      left = (rect.left || 0) + (rect.width || 0) / 2 - bw / 2;
      top = (rect.bottom || rect.top || 0) + 10;
    } else {
      left = vw / 2 - bw / 2;
      top = vh - bh - 96;
    }
    left = Math.max(ox + 8, Math.min(left, ox + vw - bw - 8));
    top = Math.max(oy + 8, Math.min(top, oy + vh - bh - 12));
    bar.style.left = Math.round(left) + 'px';
    bar.style.top = Math.round(top) + 'px';
  }

  function showBar(txt, mode, rect) {
    const bar = document.getElementById('wbar');
    if (!bar) return;
    selText = txt; selMode = mode;
    const bs = bar.querySelectorAll('button');
    if (bs[0]) bs[0].textContent = mode === 'sent' ? '译整句' : '译';
    if (bs[1]) bs[1].style.display = mode === 'sent' ? 'none' : '';
    if (bs[2]) bs[2].style.display = mode === 'sent' ? 'none' : '';
    bar.classList.add('on');
    barShownAt = Date.now();
    placeBar(rect);
  }

  /* 不管长按选中了整行还是整段，都尽量抽出「一个词」或「一句」 */
  function pickFromRaw(raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const one = enOnly(t);
    if (one && /^[A-Za-z][A-Za-z'’\-]*$/.test(one)) return { txt: one, mode: 'word' };
    const ws = t.match(/[A-Za-z][A-Za-z'’\-]*/g) || [];
    if (!ws.length) return null;
    if (ws.length === 1) return { txt: enOnly(ws[0]) || '', mode: 'word' };
    const sent = sentenceOK(t);
    if (sent && /[.!?;:]$/.test(sent)) return { txt: sent, mode: 'sent' };
    if (ws.length <= 3) return { txt: enOnly(ws.join(' ')) || ws[0], mode: 'word' };
    /* 整段：挑最长的那个词，长按基本是冲着它去的 */
    let best = ws[0];
    ws.forEach(w => { if (w.length > best.length) best = w; });
    return { txt: enOnly(best) || '', mode: 'word' };
  }

  function checkSel(allowPoint) {
    const sel = window.getSelection();
    let raw = '', rect = null;
    try {
      raw = sel && sel.toString ? sel.toString() : '';
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width || r.height)) rect = r;
      }
    } catch (e) { }

    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 3 ? node.parentElement : node);
    const blocked = el && (el.closest('#modal, #wpanel, #wbar') || el.closest('input,textarea,select'));
    const panelOn = (() => { const p = document.getElementById('wpanel'); return !!(p && p.classList.contains('on')); })();
    if (panelOn) return;

    if (!blocked) {
      /* 刚弹出来的条不要被随后的 selectionchange / touchend 覆盖掉 */
      if (barOn() && Date.now() - barShownAt < 1600 && (!raw || raw.indexOf(selText) >= 0)) return;
      /* 落点取词优先：长按选中整段时，落点那个词才是用户想要的 */
      if (allowPoint && lastPoint) {
        const w = wordAtPoint(lastPoint.x, lastPoint.y);
        if (w) { showBar(w, 'word', { left: lastPoint.x, top: lastPoint.y, bottom: lastPoint.y, width: 0 }); return; }
      }
      const p = pickFromRaw(raw);
      if (p && p.txt) { showBar(p.txt, p.mode, rect); return; }
    }
    hideBar();
  }

  /* 「点词即译」：轻点正文英文词直接出释义，完全绕开系统的长按选择 */
  function tapWord(x, y) {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { }
    if (!el) return false;
    if (el.closest && el.closest('button,a,input,textarea,select,label,.opt,.wb,.blank,.wordbank,.chip,.nav-item,.btn,' +
      '.topbar,.mobilenav,.passage-hd,#wbar,#wpanel,#wdock,#modal,.wxhint')) return false;
    const w = wordAtPoint(x, y);
    if (!w) return false;
    hideBar();
    openWordPanel(w);
    return true;
  }

  function barAct(a) {
    barGuard = Date.now();
    if (selMode === 'sent') { if (a === 'tr') openSentPanel(selText); }
    else if (a === 'tr') openWordPanel(selText);
    else if (selText) saveWord(selText, a);
    hideBar();
  }

  function initSelection() {
    const bar = document.getElementById('wbar');
    if (!bar) return;

    let downAt = 0, downPt = null, moved = false, pressT = 0, lastPtrAt = 0, lastTouchUp = 0;
    const clearPress = () => { if (pressT) { clearTimeout(pressT); pressT = 0; } };

    const startPress = (x, y) => {
      downAt = Date.now(); moved = false;
      downPt = { x: x, y: y };
      lastPoint = downPt;
      hideBar(); clearPress();
      /* 鸿蒙长按后手指常常一直按着、或者抬起时系统把事件吃掉，
         所以不等 touchend，按住 0.5 秒就地取词。 */
      pressT = setTimeout(() => {
        pressT = 0;
        if (moved || !downPt) return;
        const w = wordAtPoint(downPt.x, downPt.y);
        if (w) showBar(w, 'word', { left: downPt.x, top: downPt.y, bottom: downPt.y, width: 0 });
      }, 500);
    };
    const movePress = (x, y) => {
      if (!downPt) return;
      if (Math.abs(x - downPt.x) > 12 || Math.abs(y - downPt.y) > 12) { moved = true; clearPress(); }
    };

    document.addEventListener('pointerdown', e => {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('#wbar,#wpanel,#wdock')) return;
      lastPtrAt = Date.now();
      startPress(e.clientX, e.clientY);
    }, true);

    document.addEventListener('pointermove', e => { movePress(e.clientX, e.clientY); }, true);
    document.addEventListener('pointercancel', () => { clearPress(); downPt = null; }, true);

    /* 微信 / 老 X5 内核可能只发 touch 事件，不发 pointer：补一条同样的路 */
    document.addEventListener('touchstart', e => {
      if (Date.now() - lastPtrAt < 80) return;
      const t = e.touches && e.touches[0];
      if (!t || !e.target || !e.target.closest) return;
      if (e.target.closest('#wbar,#wpanel,#wdock')) return;
      startPress(t.clientX, t.clientY);
    }, { capture: true, passive: true });

    document.addEventListener('touchmove', e => {
      const t = e.touches && e.touches[0];
      if (t) movePress(t.clientX, t.clientY);
    }, { capture: true, passive: true });

    const up = e => {
      clearPress();
      if (!e.target || !e.target.closest) { downPt = null; return; }
      if (e.target.closest('#wbar,#wpanel,#wdock')) { downPt = null; return; }
      /* 触屏上 touchend 之后浏览器还会补一个 mouseup，别算两次 */
      if (e.type === 'mouseup' && Date.now() - lastTouchUp < 800) { downPt = null; return; }
      if (e.type === 'touchend') lastTouchUp = Date.now();
      const t = (e.changedTouches && e.changedTouches[0]) || e;
      const pt = (t && typeof t.clientX === 'number' && isFinite(t.clientX)) ? { x: t.clientX, y: t.clientY } : downPt;
      const held = downAt ? Date.now() - downAt : 999;
      const tap = held < 350 && !moved && !!pt;
      downAt = 0; downPt = null;
      if (pt) lastPoint = pt;
      if (tap && S.tapDict) { if (tapWord(pt.x, pt.y)) return; }
      [50, 260].forEach(d => setTimeout(() => checkSel(held >= 350), d));
    };
    document.addEventListener('mouseup', up, true);
    document.addEventListener('touchend', up, true);

    /* 拖动手柄调整范围时不会再有 touchend，只能靠 selectionchange 收口 */
    document.addEventListener('selectionchange', () => {
      clearTimeout(initSelection._t);
      initSelection._t = setTimeout(() => checkSel(false), 300);
    });

    document.addEventListener('scroll', hideBar, true);

    /* 微信里 pointer / touch 都可能被接管，但 click 一定有 —— 再补一条 */
    document.addEventListener('click', e => {
      if (!S.tapDict) return;
      if (Date.now() - lastTouchUp < 900) return;
      const pn = document.getElementById('wpanel');
      if (pn && pn.classList.contains('on')) return;
      if (!e.target || !e.target.closest) return;
      if (typeof e.clientX !== 'number' || !isFinite(e.clientX)) return;
      setTimeout(() => tapWord(e.clientX, e.clientY), 30);
    }, true);

    const fire = e => {
      const b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      barAct(b.dataset.act);
    };
    bar.addEventListener('touchend', fire, { passive: false });
    bar.addEventListener('click', e => {
      if (Date.now() - barGuard < 400) return;
      fire(e);
    });
    /* 点浮条时先别让浏览器把选区清掉（清了会立刻 hideBar，看着像没反应） */
    bar.addEventListener('pointerdown', e => { e.stopPropagation(); }, true);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitPanel);
      window.visualViewport.addEventListener('scroll', fitPanel);
    }
  }

  function setTapDict(on) {
    S.tapDict = !!on;
    S.tapTip = 1;
    if (on) delete S.tapOff; else S.tapOff = 1;
    save();
    toast(on ? '已开启：轻点正文英文词即可查' : '已关闭点词即译');
    render();
  }

  const CET_PHRASES = new Map([
    ['daily practice', { def: '日常练习；每日练习', example: 'Daily practice helps you build confidence.', translation: '每天练习有助于建立信心。' }],
    ['take into account', { def: '把……考虑在内；顾及', example: 'The study takes age into account.', translation: '这项研究考虑了年龄因素。' }],
    ['in contrast', { def: '相比之下；与此相反' }],
    ['as a result', { def: '因此；结果是' }],
    ['to some extent', { def: '在某种程度上' }],
    ['make a difference', { def: '产生影响；起作用' }],
    ['in the long run', { def: '从长远来看' }],
    ['play a role', { def: '发挥作用；扮演角色' }],
    ['be likely to', { def: '很可能；有可能' }],
    ['on the other hand', { def: '另一方面' }],
  ]);
  const DICT_TYPES = { word: ['Word', '单词'], phrase: ['Phrase', '短语'], sentence: ['Sentence', '整句'] };
  let dictEntry = null;
  let dictAnchor = null;

  function openSearchPanel(prefill = '', forceSentence = false) {
    const panel = document.getElementById('wpanel');
    if (!panel) return;
    if (!panel.classList.contains('dictionary-panel')) {
      pickQ = null;
      dictAnchor = document.activeElement;
      panel.style.bottom = '';
      panel.classList.add('on', 'dictionary-panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-labelledby', 'dictionary-title');
      panel.innerHTML = '<header class="dict-head">' +
        '<span class="dict-emblem">' + svg(IC.words) + '</span><div class="grow"><h2 id="dictionary-title" lang="en">Dictionary</h2><span>英汉词典</span></div>' +
        '<button type="button" class="dict-icon-button" data-dict-action="close" aria-label="关闭词典" title="关闭（Esc）">' + svg(IC.close) + '</button></header>' +
        '<div class="dict-search"><form id="dict-form" class="dict-form" role="search">' +
        '<label class="dict-field" for="wq">' + svg(IC.search) + '<span class="dict-sr-only">要查询的英文</span>' +
        '<input id="wq" type="search" enterkeyhint="search" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="480" placeholder="输入单词、短语或英文句子" aria-describedby="dict-form-message"></label>' +
        '<button type="submit" class="btn pri dict-submit">查词</button></form>' +
        '<div class="dict-tools"><button type="button" class="dict-text-button" data-dict-action="paste">' + svg(IC.clipboard) + '粘贴</button>' +
        '<label class="dict-toggle"><input type="checkbox" id="wtap"' + (S.tapDict ? ' checked' : '') + '>点词即译</label></div>' +
        '<div id="dict-form-message" class="dict-form-message" role="status"></div></div>' +
        '<div id="dict-scroll" class="dict-scroll"><div id="dict-result"><div class="dict-empty">' +
        '<p>直接查词，也可以在题目里划词或长按查询。</p><div class="dict-examples" aria-label="查询示例">' +
        ['approach', 'daily practice', 'take into account'].map(term =>
          '<button type="button" data-dict-action="term" data-term="' + term + '" lang="en">' + term + '</button>').join('') + '</div></div></div></div>';
      fitPanel();
    }
    if (prefill) return queryDictionary(prefill, forceSentence);
    if (!IS_TOUCH) document.getElementById('wq')?.focus();
  }

  function fitPanel() {
    const p = document.getElementById('wpanel');
    const vv = window.visualViewport;
    if (!p || !vv) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    if (p.classList.contains('dictionary-panel')) {
      p.style.setProperty('--dict-keyboard', kb > 60 ? kb + 'px' : '0px');
      p.style.setProperty('--dict-visible-height', Math.max(0, Math.floor(vv.height - 8)) + 'px');
    } else {
      p.style.bottom = kb > 60 ? kb + 'px' : '';
    }
  }

  function pasteWord() {
    const input = document.getElementById('wq');
    if (!input) return;
    function manualPaste() {
      if (document.getElementById('wq') !== input) return;
      input.focus();
      document.getElementById('dict-form-message').textContent = '请在输入框内长按或使用粘贴快捷键。';
    }
    if (!navigator.clipboard?.readText) return manualPaste();
    const previous = input.value;
    navigator.clipboard.readText().then(text => {
      if (document.getElementById('wq') !== input || input.value !== previous) return;
      if (!text.trim()) {
        document.getElementById('dict-form-message').textContent = '剪贴板为空。';
        return;
      }
      if (queryDictionary(text) && IS_TOUCH) input.blur();
    }).catch(manualPaste);
  }

  function initDictionary() {
    const panel = document.getElementById('wpanel');
    panel.addEventListener('submit', event => {
      if (event.target.id !== 'dict-form') return;
      event.preventDefault();
      const input = document.getElementById('wq');
      if (queryDictionary(input.value) && IS_TOUCH) input.blur();
    });
    panel.addEventListener('paste', event => {
      if (event.target.id !== 'wq') return;
      setTimeout(() => {
        if (document.getElementById('wq') === event.target && queryDictionary(event.target.value) && IS_TOUCH) event.target.blur();
      }, 0);
    });
    panel.addEventListener('input', event => {
      if (event.target.id === 'wq') document.getElementById('dict-form-message').textContent = '';
    });
    panel.addEventListener('change', event => {
      if (event.target.id === 'wtap') setTapDict(event.target.checked);
    });
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-dict-action]');
      if (!button) return;
      const action = button.dataset.dictAction;
      if (action === 'close') closePanel(true);
      if (action === 'paste') pasteWord();
      if (action === 'say' && dictEntry) say(dictEntry.term);
      if (action === 'mark') addWordFromPanel(button.dataset.color);
      if (action === 'term' && queryDictionary(button.dataset.term)) document.getElementById('dict-term-title')?.focus();
    });
  }

  function closePanel(restoreFocus = false) {
    const panel = document.getElementById('wpanel');
    if (panel) {
      panel.classList.remove('on', 'dictionary-panel');
      panel.removeAttribute('role');
      panel.removeAttribute('aria-labelledby');
      panel.style.bottom = '';
      panel.innerHTML = '';
    }
    if (restoreFocus && dictAnchor?.isConnected) dictAnchor.focus();
    dictEntry = null;
    dictAnchor = null;
    pickQ = null;
  }

  function openWordPanel(text) { openSearchPanel(text); }
  function openSentPanel(text) { openSearchPanel(text, true); }

  function dictionarySenses(definition) {
    const markers = [...definition.matchAll(/(^|[\s；;，,])(adj|adv|prep|pron|conj|abbr|num|int|aux|det|ad|vt|vi|a|n|v)\.\s*/gi)];
    if (!markers.length) return [{ pos: '', sense: definition }];
    const senses = [];
    if (markers[0].index) senses.push({ pos: '', sense: definition.slice(0, markers[0].index) });
    markers.forEach((marker, i) => senses.push({
      pos: (marker[2] === 'a' ? 'adj' : marker[2] === 'ad' ? 'adv' : marker[2]) + '.',
      sense: definition.slice(marker.index + marker[0].length, markers[i + 1]?.index),
    }));
    return senses.map(({ pos, sense }) => ({ pos, sense: sense.trim().replace(/[；;，,]+$/, '') })).filter(item => item.sense);
  }

  function dictionaryComponents(term) {
    const words = [...new Set(term.toLowerCase().replace(/’/g, "'").match(/[a-z][a-z'\-]*/g) || [])];
    return words.slice(0, 8).flatMap(word => {
      const record = window.lookup(word);
      if (!record?.def || record.compound) return [];
      const first = dictionarySenses(record.def)[0]?.sense || record.def;
      return [{ word, sense: cut(first, 48) }];
    });
  }

  function queryDictionary(raw, forceSentence = false) {
    const input = document.getElementById('wq');
    if (!input) return false;
    const query = String(raw || '').replace(/\s+/g, ' ').trim();
    const message = document.getElementById('dict-form-message');
    if (!query || query.length > 480 || !/[a-z]/i.test(query) || CJK_RE.test(query)) {
      message.textContent = query.length > 480 ? '一次最多查询 480 个字符。' : '请输入英文单词、短语或句子。';
      return false;
    }
    message.textContent = '';
    input.value = query;
    const short = enOnly(query);
    const curated = short && CET_PHRASES.get(short.toLowerCase());
    const isSentence = forceSentence || !short || (!curated && /\s/.test(short) && /[.!?]["'”’)]?$/.test(query));
    const term = isSentence ? query : short;
    const type = isSentence ? 'sentence' : /[\s,;]/.test(term) ? 'phrase' : 'word';
    const key = term.toLowerCase().replace(/’/g, "'"), tokens = window.dictInit();
    const word = type === 'word' ? window.lookup(key) : null;
    const exact = type === 'sentence' ? '' : tokens.get(key);
    const definition = exact || (!isSentence && curated?.def) || (word && !word.compound ? word.def : '') || '';
    const entry = {
      type, term, definition, curated: isSentence ? null : curated,
      base: word && !word.compound ? word.base : '',
      components: type === 'word' && !word?.compound ? [] : dictionaryComponents(term.replace(/-/g, type === 'word' ? ' ' : '-')),
      status: definition ? 'offline' : 'loading',
      saved: type === 'sentence' ? null : (S.words || []).find(item => item.w.toLowerCase() === term.toLowerCase()),
    };
    dictEntry = entry;
    renderDictionaryEntry(entry);
    if (!entry.definition) {
      const task = type === 'word' ? trWord(term) : trSentence(term);
      task.then(({ zh, cached }) => {
        if (entry.fillOnResolve && entry.saved && !entry.saved.d && (S.words || []).includes(entry.saved)) {
          entry.saved.d = zh;
          save();
          if (view === 'words') render();
        }
        if (dictEntry !== entry) return;
        entry.definition = zh;
        entry.status = cached ? 'cached' : 'online';
        updateDictionaryDefinition(entry);
      }).catch(() => {
        if (dictEntry !== entry) return;
        entry.status = 'unavailable';
        updateDictionaryDefinition(entry);
      });
    }
    return true;
  }

  function dictionaryDefinition(entry) {
    const label = entry.type === 'sentence' || (entry.type === 'phrase' && entry.status !== 'offline') ? '参考译文' : '释义';
    const source = {
      offline: entry.curated ? '离线短语' : '离线词典', loading: '正在联网查询', online: '在线参考',
      cached: '缓存译文', unavailable: '暂无在线结果',
    }[entry.status];
    let body = '';
    if (entry.definition) {
      body = entry.type === 'word' && entry.status === 'offline'
        ? '<ul class="dict-senses">' + dictionarySenses(entry.definition).map(({ pos, sense }) =>
          '<li>' + (pos ? '<span class="dict-pos" lang="en">' + esc(pos) + '</span>' : '') + '<span>' + esc(sense) + '</span></li>').join('') + '</ul>'
        : '<p class="dict-translation">' + esc(entry.definition) + '</p>';
    } else if (entry.status === 'unavailable') {
      body = '<p class="dict-message">' + (entry.components.length ? '可以先看下方的逐词释义。' : '可以用有道词典继续查询。') + '</p>';
    }
    return '<div class="dict-definition-head"><span>' + label + '</span><span class="dict-source ' + entry.status + '">' + source + '</span></div>' + body;
  }

  function updateDictionaryDefinition(entry) {
    const body = document.getElementById('dict-definition');
    if (body) body.innerHTML = dictionaryDefinition(entry);
  }

  function dictionaryActions(entry) {
    const link = '<a class="dict-online" target="_blank" rel="noopener noreferrer" href="https://dict.youdao.com/result?word=' +
      encodeURIComponent(entry.term) + '&amp;lang=en">有道词典 <span aria-hidden="true">↗</span></a>';
    if (entry.type === 'sentence') return link;
    return '<div class="dict-marks" role="group" aria-label="加入单词本">' + [['y', '待背'], ['r', '易错']].map(([color, label]) =>
      '<button type="button" class="dict-mark ' + color + '" data-dict-action="mark" data-color="' + color + '" aria-pressed="' +
      (entry.saved?.c === color) + '"><span aria-hidden="true"></span>' + label + '</button>').join('') + '</div>' + link;
  }

  function renderDictionaryEntry(entry) {
    const [kind, kindZh] = DICT_TYPES[entry.type];
    let h = '<article class="dict-entry"><div class="dict-type"><span lang="en">' + kind + '</span><span>' + kindZh + '</span></div>' +
      '<div class="dict-term-row"><h3 id="dict-term-title" class="dict-term' + (entry.type === 'sentence' ? ' dict-sentence' : '') + '" lang="en" tabindex="-1">' + esc(entry.term) + '</h3>' +
      '<button type="button" class="dict-icon-button dict-audio" data-dict-action="say" aria-label="朗读英文" title="朗读英文">' + svg(IC.audio) + '</button></div>' +
      (entry.base ? '<div class="dict-base">相关原形 <button type="button" class="dict-text-button" lang="en" data-dict-action="term" data-term="' + esc(entry.base) + '">' + esc(entry.base) + '</button></div>' : '') +
      '<div id="dict-definition" class="dict-definition" aria-live="polite">' + dictionaryDefinition(entry) + '</div>';
    if (entry.curated?.example) {
      h += '<div class="dict-example"><div class="dict-section-label"><span lang="en">In context</span> 例句</div><p lang="en">' + esc(entry.curated.example) + '</p><span>' + esc(entry.curated.translation) + '</span></div>';
    }
    if (entry.components.length) {
      h += '<details class="dict-components"' + (entry.status === 'loading' ? ' open' : '') + '><summary><span lang="en">Word by word</span> 逐词查看</summary>' +
        '<div class="dict-component-list">' + entry.components.map(({ word, sense }) =>
          '<button type="button" data-dict-action="term" data-term="' + esc(word) + '"><b lang="en">' + esc(word) + '</b><span>' + esc(sense) + '</span>' + svg(IC.chevron) + '</button>').join('') + '</div></details>';
    }
    if (entry.type !== 'sentence') {
      h += '<details class="dict-edit"><summary>编辑我的释义</summary><label class="dict-sr-only" for="wdefin">我的释义</label>' +
        '<textarea id="wdefin" rows="2" maxlength="1000" placeholder="留空时使用词典释义">' + esc(entry.saved?.d || '') + '</textarea><p>点击下方「待背」或「易错」保存。</p></details>';
    }
    h += '<footer class="dict-footer" id="dict-footer">' + dictionaryActions(entry) + '</footer>' +
      '<div id="dict-saved" class="dict-saved" role="status">' + (entry.saved ? '已收录 · ' + (entry.saved.c === 'r' ? '易错' : '待背') : '') + '</div></article>';
    document.getElementById('dict-result').innerHTML = h;
    document.getElementById('dict-scroll').scrollTop = 0;
  }

  function addWordFromPanel(color) {
    const entry = dictEntry;
    if (!entry || entry.type === 'sentence' || (color !== 'y' && color !== 'r')) return;
    const custom = document.getElementById('wdefin')?.value.trim();
    const saved = saveWord(entry.term, color, custom || entry.definition);
    if (!saved) return;
    entry.saved = saved;
    entry.fillOnResolve = !saved.d && entry.status === 'loading';
    const status = document.getElementById('dict-saved');
    status.textContent = (storageOK ? '已收录 · ' : '仅本次有效 · ') + (color === 'y' ? '待背' : '易错');
    document.querySelectorAll('#dict-footer [data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)));
  }


  /* ---------- 整句翻译（在线，带缓存） ---------- */
  function trCache() {
    try { return JSON.parse(localStorage.getItem('cet4_tr') || '{}'); } catch (e) { return {}; }
  }
  function trSave(k, v) {
    try {
      const c = trCache(); c[k] = v;
      const ks = Object.keys(c);
      if (ks.length > 400) ks.slice(0, ks.length - 400).forEach(x => delete c[x]);
      localStorage.setItem('cet4_tr', JSON.stringify(c));
    } catch (e) { }
  }
  async function translateEnglish(text, key) {
    const cached = trCache()[key];
    if (cached) return { zh: cached, cached: true };
    if (typeof fetch !== 'function' || navigator.onLine === false) throw new Error('离线');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller && setTimeout(() => controller.abort(), 8000);
    try {
      const url = 'https://api.mymemory.translated.net/get?langpair=' + encodeURIComponent('en|zh-CN') + '&q=' + encodeURIComponent(text);
      const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      const translation = String(payload?.responseData?.translatedText || '').trim();
      if (!/[\u3400-\u9fff]/.test(translation) || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(translation)) throw new Error('暂无中文译文');
      const zh = translation.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      trSave(key, zh);
      return { zh };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function trSentence(text) { return translateEnglish(text.slice(0, 480), text.slice(0, 360)); }
  function trWord(word) { return translateEnglish(word.slice(0, 60), 'W:' + word.toLowerCase()); }


  function exportWords() {
    const txt = (S.words || []).map(w => w.w + '\t' + (w.d || '') + '\t' + (w.c === 'y' ? '黄' : '红')).join('\n');
    download('单词本.txt', txt);
  }
  function copyWords() {
    const txt = (S.words || []).map(w => w.w + '  ' + (w.d || '')).join('\n');
    copyText(txt, '已复制 ' + (S.words || []).length + ' 个词');
  }
  /* ================= 备份与恢复 ================= */
  const BK_APP = 'cet4-desk';
  function b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64dec(str) {
    const bin = atob(String(str).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function sizeText(n) {
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function dataSize() {
    try { return (JSON.stringify(S) || '').length; } catch (e) { return 0; }
  }
  function backupPayload() {
    return { app: BK_APP, v: 1, ts: Date.now(), tool: '四级训练工作台', data: S };
  }
  /* 合并两份数据：同一题以时间更新的为准，单词取并集，记录取较大值 */
  function mergeInto(base, add) {
    const out = Object.assign({}, base);
    ['qs', 'pts', 'fav', 'write', 'wrong', 'papers'].forEach(k => {
      const A = Object.assign({}, out[k] || {}), B = (add && add[k]) || {};
      Object.keys(B).forEach(id => {
        const a = A[id], b = B[id];
        if (!a) { A[id] = b; return; }
        const at = a.ts || a.t || 0, bt = b.ts || b.t || 0;
        if (bt >= at) A[id] = b;
      });
      out[k] = A;
    });
    const seen = {};
    (out.words || []).forEach(w => { seen[String(w.w).toLowerCase()] = w; });
    ((add && add.words) || []).forEach(w => {
      const k = String(w.w).toLowerCase();
      const old = seen[k];
      if (!old) { seen[k] = w; return; }
      if (!old.d && w.d) old.d = w.d;
      if (w.t && (!old.t || w.t < old.t)) old.t = w.t;
    });
    out.words = Object.keys(seen).map(k => seen[k]);
    const runs = (out.runs || []).concat((add && add.runs) || []);
    const rt = {};
    runs.forEach(r => { rt[r.ts || JSON.stringify(r)] = r; });
    out.runs = Object.keys(rt).map(k => rt[k]).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-300);
    const days = Object.assign({}, out.days || {});
    Object.keys((add && add.days) || {}).forEach(d => {
      const a = days[d] || { n: 0, r: 0 }, b = add.days[d];
      days[d] = { n: Math.max(a.n || 0, b.n || 0), r: Math.max(a.r || 0, b.r || 0) };
    });
    out.days = days;
    out.created = Math.min(out.created || Date.now(), (add && add.created) || Date.now());
    return out;
  }
  function applyBackup(raw, mode) {
    let obj = null;
    try { obj = JSON.parse(raw); } catch (e) { return toast('这份备份读不出来（不是有效 JSON）'); }
    const d = obj && obj.data ? obj.data : obj;
    if (!d || typeof d !== 'object' || (!d.qs && !d.words)) return toast('不像是四级工作台的备份文件');
    const before = { q: Object.keys(S.qs || {}).length, w: (S.words || []).length };
    S = mode === 'replace' ? Object.assign(blankStore(), d) : mergeInto(S, d);
    S.lastBackup = Date.now();
    save();
    toast(mode === 'replace'
      ? '已覆盖恢复：' + Object.keys(S.qs || {}).length + ' 题 / ' + (S.words || []).length + ' 词'
      : '已合并：题 ' + before.q + '→' + Object.keys(S.qs || {}).length + '，词 ' + before.w + '→' + (S.words || []).length);
    closeModal(); closePanel();
    render();
  }
  let importMode = 'merge';
  function importPanel() {
    showModal('<div class="modalcard">' +
      '<div class="row"><b>从备份恢复</b><span class="grow"></span><button class="btn sm ghost" onclick="DESK.closeModal()">关闭</button></div>' +
      '<div class="small dim" style="margin-top:8px;line-height:1.7">选一个之前导出的 <code>.json</code> 备份文件；手机上文件在「文件管理 / 微信聊天记录」里都能选到。</div>' +
      '<div style="margin-top:12px"><input id="bkfile" type="file" accept=".json,application/json,text/plain" style="width:100%"></div>' +
      '<div class="row" style="margin-top:14px;gap:14px">' +
      '<label class="small"><input type="radio" name="bkm" value="merge" checked onchange="DESK.setImportMode(\'merge\')"> 合并（保留本机较新的记录）</label>' +
      '<label class="small"><input type="radio" name="bkm" value="replace" onchange="DESK.setImportMode(\'replace\')"> 覆盖（清空后导入）</label>' +
      '</div>' +
      '<div class="row" style="margin-top:14px;gap:8px"><button class="btn pri" onclick="DESK.doImportFile()">导入这个文件</button></div>' +
      '<div class="small dim" style="margin-top:14px;line-height:1.7">或者把「备份码」粘到下面（从另一台设备复制来的那一长串）：</div>' +
      '<textarea id="bkcode" class="winput" style="width:100%;height:70px;margin-top:6px;resize:vertical" placeholder="粘贴备份码"></textarea>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost" onclick="DESK.doImportCode()">从粘贴内容恢复</button></div>' +
      '</div>');
  }
  function doImportFile() {
    const f = document.getElementById('bkfile');
    if (!f || !f.files || !f.files[0]) return toast('先选一个备份文件');
    const fr = new FileReader();
    fr.onload = () => applyBackup(String(fr.result || ''), importMode);
    fr.onerror = () => toast('文件读不出来');
    fr.readAsText(f.files[0], 'utf-8');
  }
  function doImportCode() {
    const t = document.getElementById('bkcode');
    const raw = t ? t.value.trim() : '';
    if (!raw) return toast('先把备份码粘进来');
    let txt = raw;
    if (!/^[{\[]/.test(txt)) { try { txt = b64dec(txt); } catch (e) { return toast('备份码格式不对'); } }
    applyBackup(txt, importMode);
  }
  function copyBackupCode() {
    const code = b64enc(JSON.stringify(backupPayload()));
    if (code.length > 60000 && !confirm('备份码有 ' + Math.round(code.length / 1024) + ' KB，微信/短信可能粘不全。\n建议改用「导出备份文件」。仍要复制吗？')) return;
    copyText(code, '备份码已复制（' + Math.round(code.length / 1024) + ' KB），发到另一台设备粘贴即可');
  }
  function diagHTML() {
    const d = [];
    d.push(['页面版本', VER]);
    d.push(['内核', (IS_HARMONY ? '鸿蒙 · ' : '') + (UA.match(/(MicroMessenger|HuaweiBrowser|HeyTapBrowser|UCBrowser|Quark|MQQBrowser|Chrome|Safari|Firefox)\/[\d.]+/) || ['未识别'])[0]]);
    d.push(['划词 API', typeof window.getSelection === 'function' ? 'OK' : '缺失']);
    d.push(['按点取词', (document.caretRangeFromPoint ? 'caretRangeFromPoint' : (document.caretPositionFromPoint ? 'caretPositionFromPoint' : '无，走 Range 兜底'))]);
    d.push(['Range 兜底', typeof document.createRange === 'function' ? '可用' : '不可用']);
    d.push(['点词即译', S.tapDict ? '已开启' : '未开启']);
    d.push(['触摸事件', ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0) ? '触摸设备' : '鼠标设备']);
    d.push(['本机存储', storageProbe() ? '可写' : '不可写（无痕/受限）']);
    d.push(['已存数据', sizeText(dataSize())]);
    d.push(['离线词典', (window.dictInit ? window.dictInit().size : 0) + ' 条']);
    d.push(['朗读 TTS', ('speechSynthesis' in window) ? '有' : '无']);
    d.push(['在线翻译', typeof fetch === 'function' ? '接口可用性见下' : '无 fetch']);
    const rows = d.map(x => '<tr><td class="small dim">' + x[0] + '</td><td class="small">' + esc(String(x[1])) + '</td></tr>').join('');
    return '<table class="tbl" style="width:100%">' + rows + '</table>';
  }
  function runDiag() {
    showModal('<div class="modalcard"><div class="row"><b>划词 / 存储 自检</b><span class="grow"></span>' +
      '<button class="btn sm ghost" onclick="DESK.closeModal()">关闭</button></div>' +
      '<div id="diagbox" style="margin-top:12px">' + diagHTML() + '</div>' +
      '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">' +
      '<button class="btn sm pri" onclick="DESK.turnOnTap()">开启点词即译</button>' +
      '<button class="btn sm ghost" onclick="DESK.pingTr()">测在线翻译</button>' +
      '<button class="btn sm ghost" onclick="DESK.forceUpdate()">强制更新页面</button></div>' +
      '<div id="diagtr" class="small" style="margin-top:8px"></div>' +
      '<div class="small dim" style="margin-top:12px;line-height:1.7">下面这条英文用来实测取词：手指按在 <b>wonderful</b> 上停 0.5 秒，看会不会弹出翻译条；也可以直接轻点它（需先开启点词即译）。</div>' +
      '<div class="small" id="diagtest" style="margin-top:6px;line-height:1.9;padding:8px 10px;border:1px dashed var(--line);border-radius:8px" ' +
      'onclick="DESK.testPoint(event.clientX,event.clientY)" ontouchend="var t=event.changedTouches[0];DESK.testPoint(t.clientX,t.clientY)">' +
      'The wonderful thing about this dictionary is that it works offline.</div>' +
      '<div id="diagpt" class="small dim" style="margin-top:6px"></div></div>');
  }
  function pingTr() {
    const el = document.getElementById('diagtr');
    if (el) el.textContent = '测试中…';
    trSentence('The quick brown fox jumps over the lazy dog.').then(r => {
      if (el) el.innerHTML = '<span style="color:var(--ok)">在线翻译可用</span> · ' + esc(r.zh.slice(0, 60));
    }).catch(e => {
      if (el) el.innerHTML = '<span class="amber">在线翻译连不上（' + esc(String(e && e.message || e)) + '）。整句翻译会退化成逐词注释，单词释义不受影响（离线词库）。</span>';
    });
  }

  /* 背单词：从黄标开始，随机 20 个，用浏览器朗读 */
  function reviewWords() {
    const pool = (S.words || []).slice().sort((a, b) => (a.c === 'y' ? -1 : 1) - (b.c === 'y' ? -1 : 1));
    if (!pool.length) return toast('单词本是空的');
    startWords(pool.slice(0, 20));
  }
  function startWords(list) {
    wordQuiz = { list, i: 0, show: false };
    view = 'words'; render();
  }
  let wordQuiz = null;
  function wordQuizHTML() {
    const w = wordQuiz.list[wordQuiz.i];
    if (!w) { wordQuiz = null; return ''; }
    return '<div class="wrap"><div class="card" style="max-width:640px;margin:24px auto;text-align:center">' +
      '<div class="small dim">' + (wordQuiz.i + 1) + ' / ' + wordQuiz.list.length + '</div>' +
      '<div style="font-size:30px;font-weight:650;margin:14px 0 6px">' + esc(w.w) + '</div>' +
      '<div class="row" style="justify-content:center;gap:8px"><button class="btn sm ghost" onclick="DESK.say(\'' + esc(w.w).replace(/'/g, "\\'") + '\')">🔊 读一遍</button></div>' +
      (wordQuiz.show ? '<div class="small" style="margin-top:14px;font-size:15px">' + esc(w.d || '（没有释义）') + '</div>' : '<div class="small dim" style="margin-top:14px">想好了再点「看释义」</div>') +
      '<div class="row" style="justify-content:center;gap:8px;margin-top:20px">' +
      (wordQuiz.show ? '' : '<button class="btn pri" onclick="DESK.quizShow()">看释义</button>') +
      '<button class="btn ghost" onclick="DESK.quizNext()">' + (wordQuiz.i + 1 >= wordQuiz.list.length ? '结束' : '下一个 →') + '</button>' +
      '</div></div></div>';
  }

  /* ================= 错题本 ================= */
  function viewWrong() {
    const ids = Object.keys(S.wrong);
    const all = ids.map(id => QMAP[id]).filter(Boolean);
    const kinds = ['all', 'L', 'C', 'M', 'R'];
    const list = wrongFilter === 'all' ? all : all.filter(q => q.k === wrongFilter);

    let h = '<div class="wrap"><div style="margin-top:22px" class="row wrap"><div class="grow"><h1>错题本</h1>' +
      '<div class="small" style="margin-top:6px">错一次就进来。重做对了会自动移出——错题本是“还没通”的清单，不是荣誉墙。</div></div>' +
      (all.length ? '<button class="btn pri" onclick="DESK.startSetup(\'wrong\',10)">重练 10 题</button>' : '') + '</div>';

    h += '<div class="row wrap" style="margin:16px 0 4px;gap:7px">' + kinds.map(k =>
      '<span class="chip click ' + (wrongFilter === k ? 'acc' : '') + '" onclick="DESK.setWrongFilter(\'' + k + '\')">' +
      (k === 'all' ? '全部 ' + all.length : KIND[k].n + ' ' + all.filter(q => q.k === k).length) + '</span>').join('') + '</div>';

    if (!list.length) {
      h += '<div class="card"><div class="empty"><b>' + (all.length ? '这个模块没有错题' : '错题本是空的') + '</b>' +
        (all.length ? '换个筛选看看。' : '做一组题，错的会自动进来。') + '<div style="margin-top:12px"><button class="btn" onclick="DESK.go(\'train\')">去训练</button></div></div></div>';
    } else {
      const byPt = {};
      list.forEach(q => { const k = q.pt[0] || '其他'; (byPt[k] = byPt[k] || []).push(q); });
      Object.keys(byPt).sort().forEach(pid => {
        h += '<h2>' + pid + ' ' + esc((PMAP[pid] || {}).name || '') + ' <span class="dim" style="font-size:12px;font-weight:400">' + byPt[pid].length + ' 题</span></h2>' +
          '<div class="card pad0"><table class="t"><thead><tr><th style="width:40%">题目</th><th>卷</th><th>我选</th><th>答案</th><th>错因</th><th></th></tr></thead><tbody>' +
          byPt[pid].map(q => '<tr><td>' + esc(cut(q.st || (q.k === 'L' ? '第 ' + q.n + ' 题 · ' + q.ty : q.k === 'C' ? ctxOf(q) : q.ty), 68)) + '</td>' +
            '<td class="dim">' + paperLabel(q.p) + '</td>' +
            '<td class="mono" style="color:var(--bad)">' + ((S.wrong[q.id] || {}).a || '—') + '</td>' +
            '<td class="mono" style="color:var(--ok)">' + q.a + '</td>' +
            '<td class="dim">' + esc(CAUSE_NAME[((S.wrong[q.id] || {}).cause) || ((S.qs[q.id] || {}).cause)] || '未标') + '</td>' +
            '<td><button class="btn sm ghost" onclick="DESK.single(\'' + q.id + '\')">重做</button></td></tr>').join('') +
          '</tbody></table></div>';
      });
    }

    h += '<h2>导出</h2><div class="card"><div class="small">把错题本导成 markdown，按考点分组、带双链和错因，放进 <code>04-复盘/00-错题本</code> 覆盖或另存。</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm" onclick="DESK.exportWrong()">下载错题本 md</button>' +
      '<button class="btn sm ghost" onclick="DESK.copyWrongMd()">复制 markdown</button></div></div>';
    h += '</div>';
    return h;
  }

  /* ================= 数据 ================= */
  function viewStats() {
    const days = last14();
    const maxN = Math.max(1, ...days.map(d => d.n));
    const accAll = overallAcc();

    // 模块
    const modRows = ['L', 'C', 'M', 'R'].map(k => {
      let s = 0, r = 0;
      QS.forEach(q => { if (q.k === k && S.qs[q.id]) { s++; if (S.qs[q.id].ok) r++; } });
      return { k, s, r, acc: s ? r / s : null };
    });
    // 错因
    const causeCnt = {};
    Object.values(S.qs).forEach(rec => { if (rec.cause) causeCnt[rec.cause] = (causeCnt[rec.cause] || 0) + 1; });
    const causeTotal = Object.values(causeCnt).reduce((a, b) => a + b, 0);

    let h = '<div class="wrap"><div style="margin-top:22px"><h1>数据</h1>' +
      '<div class="small" style="margin-top:6px">只统计你自己做过的。数据在浏览器本地，不上传。</div></div>';

    h += '<div class="stats" style="margin-top:16px">' +
      statCard('累计作答', Object.keys(S.qs).length, '题', '去重后的题数') +
      statCard('总正确率', accAll == null ? '—' : Math.round(accAll * 100), accAll == null ? '' : '%', '按最近一次作答') +
      statCard('训练组数', S.runs.length, '组', S.runs.length ? '平均 ' + Math.round(S.runs.reduce((a, r) => a + r.n, 0) / S.runs.length) + ' 题/组' : '') +
      statCard('待清错题', Object.keys(S.wrong).length, '题', '重做对了才消失') +
      '</div>';

    h += '<div class="cols"><div><h2>近 14 天</h2><div class="card"><div class="chart">' +
      days.map(d => {
        const pct = d.n ? Math.round(d.n / maxN * 100) : 0;
        return '<div class="col" title="' + d.date + ' · ' + d.n + ' 题"><i class="' + (d.n >= 10 ? 'hot' : '') + '" style="height:' + Math.max(2, pct) + '%"></i>' +
          '<span>' + d.d.slice(3).replace('-', '/') + '</span></div>';
      }).join('') + '</div><div class="small dim" style="margin-top:8px">每天答的题数；紫色 ≥10 题。</div></div>';

    h += '<h2>模块正确率</h2><div class="card">' + modRows.map(m => {
      const pct = m.acc == null ? 0 : Math.round(m.acc * 100);
      return '<div style="margin-bottom:12px"><div class="row" style="margin-bottom:5px"><span style="font-size:13px">' + KIND[m.k].full + '</span>' +
        '<span class="grow"></span><span class="mono small">' + (m.acc == null ? '未练' : pct + '%') + ' <span class="dim">(' + m.r + '/' + m.s + ')</span></span></div>' +
        '<div class="bar"><i style="width:' + pct + '%;background:' + (pct < 60 ? 'var(--bad)' : pct < 80 ? 'var(--amber)' : 'var(--ok)') + '"></i></div></div>';
    }).join('') + '</div></div>';

    h += '<div><h2>错因分布</h2><div class="card">';
    if (!causeTotal) h += '<div class="small dim">答错时选一下错因，这里就会出分布。这是最有价值的一张表——它告诉你该练“找句子”还是“背单词”。</div>';
    else {
      h += CAUSES.map(([k, n]) => {
        const c = causeCnt[k] || 0;
        const pct = Math.round(c / causeTotal * 100);
        return '<div style="margin-bottom:10px"><div class="row" style="margin-bottom:4px"><span style="font-size:13px">' + n + '</span>' +
          '<span class="grow"></span><span class="mono small">' + c + ' 次 · ' + pct + '%</span></div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
      }).join('') + '<div class="small dim">共 ' + causeTotal + ' 次归因。前三项就是下一阶段的训练重点。</div>';
    }
    h += '</div>';

    h += '<h2>最弱的 8 个考点</h2><div class="card pad0"><table class="t"><thead><tr><th>考点</th><th class="num">正确率</th><th class="num">样本</th><th></th></tr></thead><tbody>' +
      PTS.filter(p => ptStat(p.id).s > 0).map(p => ({ p, m: mastery(p.id), s: ptStat(p.id).s }))
        .sort((a, b) => a.m - b.m).slice(0, 8).map(x =>
          '<tr><td>' + x.p.id + ' ' + esc(x.p.name) + '</td><td class="num mono" style="color:' + (x.m < 0.6 ? 'var(--bad)' : 'var(--amber)') + '">' + Math.round(x.m * 100) + '%</td>' +
          '<td class="num mono dim">' + x.s + '</td><td><button class="btn sm ghost" onclick="DESK.startPoint(\'' + x.p.id + '\')">练</button></td></tr>').join('') +
      '</tbody></table>' + (PTS.filter(p => ptStat(p.id).s > 0).length ? '' : '<div class="empty"><b>还没有考点数据</b>做完一组就有。</div>') + '</div>';

    h += '</div></div>';

    h += '<h2>全部考点数据</h2><div class="card pad0" style="max-height:420px;overflow:auto"><table class="t"><thead><tr><th>考点</th><th>模块</th><th class="num">真题数</th><th class="num">我练过</th><th class="num">对</th><th class="num">正确率</th></tr></thead><tbody>' +
      PTS.map(p => {
        const st = ptStat(p.id);
        const m = st.s ? Math.round(st.r / st.s * 100) : null;
        return '<tr><td>' + p.id + ' ' + esc(p.name) + '</td><td class="dim">' + esc(p.group) + '</td><td class="num mono dim">' + p.n + '</td>' +
          '<td class="num mono">' + st.s + '</td><td class="num mono">' + st.r + '</td>' +
          '<td class="num mono" style="color:' + (m == null ? 'var(--dim)' : m < 60 ? 'var(--bad)' : m < 80 ? 'var(--amber)' : 'var(--ok)') + '">' + (m == null ? '—' : m + '%') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    h += backupCard();
    h += '<div style="margin-top:14px"><button class="btn ghost sm" onclick="DESK.resetAll()">清空本机训练数据</button></div>';
    h += '</div>';
    return h;
  }

  /* 数据页底部：备份卡片 */
  function backupCard() {
    const ok = storageProbe();
    const last = S.lastBackup || 0;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const nQ = Object.keys(S.qs || {}).length, nW = (S.words || []).length, nP = Object.keys(S.papers || {}).length;
    const kv = (k, v) => '<div style="min-width:86px"><div class="mono" style="font-size:18px">' + v + '</div><div class="small dim">' + k + '</div></div>';
    let h = '<h2>本机数据与备份</h2><div class="card">';
    h += '<div class="row wrap" style="gap:20px">' + kv('做过的题', nQ) + kv('单词', nW) + kv('套卷', nP) + kv('占用', sizeText(dataSize())) + '</div>';
    h += '<div class="small" style="margin-top:12px;line-height:1.8">' + (ok
      ? '数据存在<b>这个浏览器</b>里：换浏览器不共享，清缓存 / 无痕模式会丢。手机上建议「添加到主屏幕」后再用。'
      : '<span class="amber">⚠ 本机存储不可写</span>（无痕模式或系统限制），这次打开的记录关掉页面就没了。请改用备份文件保存。') + '</div>';
    h += '<div class="small ' + (days === null ? 'amber' : 'dim') + '" style="margin-top:6px">' + (days === null
      ? '还没备份过，建议现在导一份存到手机文件里。'
      : '上次备份：' + new Date(last).toLocaleString('zh-CN') + (days >= 7 ? '——已经 ' + days + ' 天没备份了' : '')) + '</div>';
    h += '<div class="row wrap" style="gap:8px;margin-top:14px">' +
      '<button class="btn sm pri" onclick="DESK.exportBackup()">导出备份文件</button>' +
      '<button class="btn sm ghost" onclick="DESK.importBackup()">从备份恢复</button>' +
      '<button class="btn sm ghost" onclick="DESK.copyBackupCode()">复制备份码</button>' +
      '<button class="btn sm ghost" onclick="DESK.runDiag()">划词 / 存储自检</button></div>';
    h += '<div class="small dim" style="margin-top:12px;line-height:1.85">' +
      '<b>手机 ↔ 电脑怎么同步：</b>A 设备点「导出备份文件」→ 用微信「文件传输助手」发给自己 → B 设备点「从备份恢复」选那个文件。' +
      '全程不经过服务器，也不用登录。</div>';
    h += '</div>';
    return h;
  }
  function isWX() { return /MicroMessenger/i.test(navigator.userAgent || ''); }
  function dismissWX() { S.wxTip = 1; save(); render(); }

  function last14() {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const rec = S.days[key] || { n: 0, r: 0 };
      out.push({ date: key, d: key.slice(5), n: rec.n });
    }
    return out;
  }

  /* ================= 脑库 ================= */
  function viewVault() {
    const byDir = VAULT.byDir || {};
    const rows = [
      ['01-真题', '每道题一篇：题干、四层解析、双链', byDir.q || 0],
      ['02-材料', '原文按篇抽出来，和题目互链', byDir.m || 0],
      ['03-考点', '43 个考点笔记：核心、信号、下套方式', byDir.p || 0],
      ['04-复盘', '你从这里导入的训练日志与错题本', byDir.r || 0],
      ['05–09', '模考、报告、知识、思路、疑点', byDir.rest || 0],
    ];

    let h = '<div class="wrap vault-page"><div class="vault-page-head"><span class="desk-vault-icon">' + svg(IC.vault) + '</span>' +
      '<div><h1 lang="en">Obsidian Vault</h1><p>下载 Markdown，按下方路径导入四级英语库。笔记里的双链可跳到对应的真题和考点。</p></div></div>';

    const exports = [
      ['本次训练复盘', '本次作答的正确率、错题、错因和依据句。', '04-复盘/', 'exportSession'],
      ['错题本快照', '按考点整理的全部错题和错因统计。', '04-复盘/00-错题本.md', 'exportWrong'],
      ['考点诊断', '每个考点的正确率、样本数和优先复习项。', '06-报告/', 'exportPoints'],
    ];
    h += '<div class="vault-section-head"><h2>下载 Markdown</h2>' +
      '<button class="btn sm ghost" onclick="DESK.exportAll()">全部下载</button></div><div class="vault-exports">' +
      exports.map(([title, description, destination, action]) =>
        '<section class="card vault-export"><h3>' + title + '</h3><p class="small">' + description + '</p>' +
        '<div class="vault-path"><span>' + (action === 'exportWrong' ? '改名后覆盖' : '放入') + '</span> <code>' + destination + '</code></div>' +
        '<button class="btn pri sm" onclick="DESK.' + action + '()">下载 .md' + svg(IC.download) + '</button></section>').join('') + '</div>';

    h += '<h2>脑库目录</h2><div class="card pad0"><table class="t"><thead><tr><th>目录</th><th>内容</th><th class="num">笔记</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="mono">' + r[0] + '</td><td class="dim">' + r[1] + '</td><td class="num mono">' + r[2] + '</td></tr>').join('') +
      '<tr><td class="mono">合计</td><td></td><td class="num mono" style="color:var(--acc)">' + (VAULT.total || 0) + '</td></tr>' +
      '</tbody></table></div>';

    h += '<h2>双链规则</h2><div class="card"><table class="t"><thead><tr><th>前台里的东西</th><th>库里的笔记名</th><th>例子</th></tr></thead><tbody>' +
      '<tr><td>一道题</td><td><code>卷号-题号 题型</code></td><td class="mono dim">2025_12_1-46 推断题</td></tr>' +
      '<tr><td>一个考点</td><td><code>考点号 名称</code></td><td class="mono dim">R-02 同义替换识别</td></tr>' +
      '<tr><td>原文材料</td><td><code>卷号 阅读材料1</code></td><td class="mono dim">2025-12-1 阅读材料1</td></tr>' +
      '<tr><td>一整套卷</td><td><code>卷号 试卷</code></td><td class="mono dim">2025_12_1 试卷</td></tr>' +
      '</tbody></table><div class="small dim" style="margin-top:10px">前台里每道题的「复制双链」按钮，复制的就是第一栏内容，粘到 Obsidian 任何地方都能跳转。</div></div>';

    h += '<h2>为什么这么做</h2><div class="card"><div class="small" style="line-height:1.9">' +
      '刷题网站只给你一个分数，关掉就没了；笔记本只记录，不给你反馈。' +
      '把两件事拆开：<b>前台负责高频、即时、可量化的训练</b>；<b>大脑负责长期、结构化的记忆</b>。' +
      '训练的每一次错误，都以「题 → 考点 → 材料」的形式长进图谱里，两个月后你打开图谱，看到的是自己的知识缺口，而不是一堆分数。</div></div>';

    h += '<h2>本机数据</h2><div class="card"><div class="row wrap"><div class="small grow">作答记录、错题、草稿都存在这台设备的 localStorage 里，换浏览器不同步。要带走就导 md。</div>' +
      '<button class="btn sm ghost" onclick="DESK.exportJSON()">导出原始 JSON</button></div></div>';
    h += '</div>';
    return h;
  }

  /* ================= 写作翻译 ================= */
  function viewWrite() {
    const list = QS.filter(q => q.k === writeTab);
    if (!writeSel || QMAP[writeSel] === undefined || QMAP[writeSel].k !== writeTab) writeSel = list[0] && list[0].id;
    const q = writeSel ? QMAP[writeSel] : null;

    let h = '<div class="wrap"><div style="margin-top:22px"><h1>写作 / 翻译</h1>' +
      '<div class="small" style="margin-top:6px">写作离线批改：逐句找错、给档位、给改写。翻译给自查清单与导出。</div></div>';

    h += '<div class="row" style="margin:16px 0 12px;gap:7px">' +
      '<span class="chip click ' + (writeTab === 'W' ? 'acc' : '') + '" onclick="DESK.setWriteTab(\'W\')">写作 ' + QS.filter(x => x.k === 'W').length + '</span>' +
      '<span class="chip click ' + (writeTab === 'T' ? 'acc' : '') + '" onclick="DESK.setWriteTab(\'T\')">翻译 ' + QS.filter(x => x.k === 'T').length + '</span></div>';

    h += '<div class="wgrid"><div class="plist">' + list.map(x => {
      const done = (S.write[x.id] || '').trim().length > 40;
      return '<div class="li ' + (x.id === writeSel ? '' : '') + '" style="' + (x.id === writeSel ? 'background:var(--card2);border:1px solid var(--line)' : '') + '" onclick="DESK.pickWrite(\'' + x.id + '\')">' +
        '<div class="grow"><div style="font-size:12.5px">' + paperLabel(x.p) + '</div>' +
        '<div class="small dim" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cut(x.k === 'T' ? x.st : x.st, 26)) + '</div></div>' +
        (done ? '<span class="chip ok" style="flex:0 0 auto">写</span>' : '') + '</div>';
    }).join('') + '</div>';

    h += '<div>';
    if (!q) { h += '<div class="card"><div class="empty">没有题目</div></div>'; }
    else {
      h += '<div class="card"><div class="row" style="margin-bottom:10px"><span class="chip acc">' + (q.k === 'W' ? '写作' : '翻译') + '</span>' +
        '<span class="chip">' + paperLabel(q.p) + '</span><span class="grow"></span>' +
        '<button class="btn sm ghost" onclick="DESK.copyNote(\'' + q.id + '\')">复制双链</button></div>' +
        '<div class="' + (q.k === 'W' ? 'passage' : '') + '" style="font-size:14.5px;line-height:1.9">' + esc(q.st) + '</div>';
      if (q.k === 'T') h += '<div class="small dim" style="margin-top:10px">主题：' + esc(q.tp || '—') + '</div>';

      const draft = S.write[q.id] || '';
      h += '<div class="sep"></div><textarea id="wta" placeholder="' + (q.k === 'W' ? 'Write your essay here…' : '写出你的译文…') + '" oninput="DESK.saveDraft(this.value)">' + esc(draft) + '</textarea>';
      h += '<div class="row wrap" style="margin-top:10px">' +
        '<span class="small dim" id="wcount">' + wc(draft) + ' 词</span>' +
        '<span class="grow"></span>' +
        (q.k === 'W'
          ? '<button class="btn pri" onclick="DESK.gradeEssay()">批改这篇</button>'
          : '<button class="btn" onclick="DESK.checkTrans()">自查</button>') +
        '<button class="btn ghost" onclick="DESK.clearDraft()">清空</button></div>';
      h += '<div id="wreport">' + (q.k === 'W' && S.reports && S.reports[q.id] ? reportHTML(S.reports[q.id]) : '') + '</div>';
      h += '</div>';

      if (q.k === 'T') {
        h += '<div class="card" style="margin-top:14px"><h3>翻译自查五项</h3>' +
          ['每句都有主语和谓语，没有整句照搬中文语序', '时态统一（介绍现状用现在时，回顾过去用过去时）',
            '专有名词按官方译法（如 private economy / the Yangtze River）', '数字与百分比准确，and / or 不混',
            '句子之间有连接（while / with / which），不是一堆短句'].map((x, i) =>
              '<label class="row" style="padding:5px 0;cursor:pointer;align-items:flex-start"><input type="checkbox" style="margin-top:5px" onchange="DESK.tickTrans(this,' + i + ')">' +
              '<span class="small" style="color:var(--txt)">' + x + '</span></label>').join('') + '</div>';
      }
    }
    h += '</div></div></div>';
    return h;
  }

  function reportHTML(rep) {
    const s = rep.score;
    const col = s.band >= 4 ? 'var(--ok)' : s.band >= 3 ? 'var(--amber)' : 'var(--bad)';
    let h = '<div class="sec-block"><div class="row" style="gap:14px;align-items:flex-start">' +
      '<div style="text-align:center;min-width:74px"><div style="font-size:30px;font-weight:650;color:' + col + ';line-height:1.1">' + s.total + '</div>' +
      '<div class="small dim">/ 15 分</div><div class="chip" style="margin-top:6px">' + esc(s.band) + (s.range ? ' · ' + esc(s.range) : '') + '</div></div>' +
      '<div class="grow"><div style="font-size:13.5px;color:' + col + '">' + esc(s.desc) + '</div>' +
      '<div class="small" style="margin-top:6px">' + rep.stats.wordCount + ' 词 · ' + rep.stats.sentCount + ' 句 · ' + rep.stats.paras + ' 段 · 平均句长 ' + rep.stats.avgLen.toFixed(1) + ' 词 · 连接词 ' + rep.stats.connCount + ' 处</div>' +
      '<div class="small" style="margin-top:4px">折合 <b>' + Math.round(Math.min(106.5, s.total / 15 * 106.5) * 10) / 10 + '</b> / 106.5（写作占 15%）</div></div></div>';

    if (s.deductions && s.deductions.length) {
      h += '<div class="sec-block"><div class="sec-h">扣分项</div><ul style="margin:0;padding-left:18px;font-size:12.8px;line-height:1.9">' +
        s.deductions.map(d => '<li>' + esc(d.t) + '</li>').join('') + '</ul></div>';
    }
    const iss = (rep.issues || []).filter(i => i.sev >= 2).slice(0, 12);
    if (iss.length) {
      h += '<div class="sec-block"><div class="sec-h">逐处可改（' + rep.issues.length + ' 处，列最重的 ' + iss.length + ' 处）</div>' +
        iss.map(i => '<div class="dist-item"><span class="lb" style="color:' + (i.sev >= 3 ? 'var(--bad)' : 'var(--amber)') + '">' + i.sev + '</span>' +
          '<span class="tx"><span style="color:var(--amber)">' + esc(i.text || '') + '</span> → ' + esc(i.msg || '') + '</span></div>').join('') + '</div>';
    }
    if (rep.comments && rep.comments.length) {
      h += '<div class="sec-block"><div class="sec-h">总评</div><ul style="margin:0;padding-left:18px;font-size:12.8px;line-height:1.9;color:var(--mut)">' +
        rep.comments.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
    }
    h += '<div class="sec-block"><button class="btn sm ghost" onclick="DESK.exportEssay()">导出作文 + 批改</button></div>';
    h += '</div>';
    return h;
  }

  /* ================= 导出 ================= */
  function nowStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function lastRunAsSession() {
    if (!S.runs.length) return null;
    const r = S.runs[S.runs.length - 1];
    const ans = {}, right = { n: 0 };
    const s2 = { mode: r.mode, ids: r.ids.slice(), i: 0, ans, cause: {}, t0: r.ts, right: 0, done: true, size: r.n, spent: r.dur };
    r.ids.forEach(id => {
      const rec = S.qs[id];
      if (rec) { ans[id] = rec.a; if (rec.ok) s2.right++; if (rec.cause) s2.cause[id] = rec.cause; }
    });
    return s2;
  }
  function mdSession() {
    if (!sess) {
      const last = lastRunAsSession();
      if (!last) return '# 还没有训练记录\n\n先在工作台做一组题。\n';
      sess = last;
    }
    const total = sess.ids.length, right = sess.right;
    const acc = total ? Math.round(right / total * 100) : 0;
    const pts = {};
    sess.ids.forEach(id => (QMAP[id].pt || []).forEach(p => { pts[p] = (pts[p] || 0) + 1; }));
    const wrongs = sess.ids.map(id => QMAP[id]).filter(q => q && sess.ans[q.id] !== q.a);

    let m = '---\n';
    m += 'type: "复盘"\nkind: "训练日志"\ndate: ' + today() + '\nmode: "' + modeName(sess) + '"\n';
    m += 'n: ' + total + '\nright: ' + right + '\nacc: ' + acc + '\n';
    m += 'tags:\n  - 四级/复盘\n  - 四级/训练\n---\n\n';
    m += '# 训练复盘 ' + nowStamp() + '\n\n';
    m += '## 本次数据\n\n';
    m += '- ' + total + ' 题 · 对 ' + right + ' · 正确率 **' + acc + '%** · 用时 ' + fmtDur(sess.spent || (Date.now() - sess.t0)) + '\n';
    m += '- 覆盖考点：' + Object.keys(pts).map(id => '[[' + pNote(id) + ']]').join('、') + '\n\n';

    if (wrongs.length) {
      m += '## 错题（' + wrongs.length + '）\n\n';
      wrongs.forEach(q => {
        m += '### [[' + qNote(q) + ']] ｜ 我选 ' + (sess.ans[q.id] || '—') + ' → 答案 ' + q.a + '\n\n';
        m += '- 考点：' + (q.pt || []).map(id => '[[' + pNote(id) + ']]').join('、') + '\n';
        m += '- 错因：' + (CAUSE_NAME[sess.cause[q.id]] || '未标') + '\n';
        if (q.st) m += '- 题干：' + q.st.replace(/\n/g, ' ') + '\n';
        if (q.loc) m += '- 依据句：\n\n  > ' + q.loc.replace(/\n/g, ' ') + '\n\n';
        if (q.d && q.d.length) m += '- 干扰项：' + q.d.map(d => d.l + '（' + d.t + '）').join(' · ') + '\n';
        m += '- 正确路径：' + pathOf(q) + '\n';
        m += '- 下次动作：___\n\n';
      });
    } else {
      m += '## 全对\n\n这组没有错题。把「用了多久 / 有没有靠猜」补一句，别只看正确率。\n\n';
    }
    m += '## 一句话总结\n\n- 最该改的一个动作：___\n- 下一组要注意：___\n';
    return m;
  }

  function pathOf(q) {
    if (q.k === 'R') return '题干实词 → 定位句 → 读主干方向 → 排除改范围/改主体/无中生有';
    if (q.k === 'M') return '陈述句拆「主体+动作+对象」→ 找同义改写段 → 词面像但主体不同的排除';
    if (q.k === 'C') return '判空位词性 → 词库按词性分组 → 看固定搭配 → 比语义场';
    if (q.k === 'L') return '先扫选项差异词 → 带着差异听 → 听到同义替换就落笔';
    return '题干 → 结构 → 语言';
  }

  function mdWrong() {
    const ids = Object.keys(S.wrong);
    let m = '---\ntype: "错题本"\nupdated: ' + today() + '\nn: ' + ids.length + '\ntags:\n  - 四级/复盘\n---\n\n# 错题本（' + ids.length + ' 题）\n\n';
    if (!ids.length) return m + '暂无错题。\n';
    const byPt = {};
    ids.forEach(id => { const q = QMAP[id]; if (!q) return; const k = q.pt[0] || '其他'; (byPt[k] = byPt[k] || []).push(q); });
    Object.keys(byPt).sort().forEach(pid => {
      m += '## [[' + pNote(pid) + ']]\n\n| 题目 | 卷 | 我选 | 答案 | 错因 | 次数 |\n|---|---|---|---|---|---|\n';
      byPt[pid].forEach(q => {
        const w = S.wrong[q.id] || {};
        m += '| [[' + qNote(q) + ']] | ' + paperLabel(q.p) + ' | ' + ((S.qs[q.id] || {}).a || '—') + ' | ' + q.a + ' | ' + (CAUSE_NAME[w.cause || (S.qs[q.id] || {}).cause] || '未标') + ' | ' + (w.n || 1) + ' |\n';
      });
      m += '\n';
    });
    m += '## 错因分布\n\n';
    const cc = {};
    ids.forEach(id => { const c = (S.wrong[id] || {}).cause || (S.qs[id] || {}).cause; if (c) cc[c] = (cc[c] || 0) + 1; });
    Object.keys(cc).sort((a, b) => cc[b] - cc[a]).forEach(c => { m += '- ' + CAUSE_NAME[c] + '：' + cc[c] + ' 次\n'; });
    return m;
  }

  function mdPaper() {
    if (!sess || !sess.exam) return '# 还没有套卷记录\n';
    const P = PAPER[sess.paperKey] || {};
    const qs = sess.ids.map(id => QMAP[id]);
    const obj = qs.filter(q => q.k !== 'W' && q.k !== 'T');
    const answered = obj.filter(q => sess.ans[q.id] !== undefined);
    const right = sess.right || 0;
    const self = sess.self || {};
    const score = paperScore();
    let m = '---\ntype: "套卷复盘"\ndate: ' + today() + '\npaper: "' + (P.label || sess.paperKey) + '"\n';
    m += 'right: ' + right + '\ntotal: ' + obj.length + '\nscore: ' + score + '\n';
    m += 'tags:\n  - 四级/套卷\n  - 四级/复盘\n---\n\n';
    m += '# ' + (P.label || sess.paperKey) + ' 整卷复盘\n\n';
    m += '- 客观题 **' + right + '/' + obj.length + '** · 作答 ' + answered.length + ' 题 · 估算 **' + score + ' / 710**\n';
    m += '- 用时 ' + fmtDur(sess.spent || 0) + ' · 写作自评 ' + (self.w ? Math.round(self.w * 106.5) : '未评') + ' · 翻译自评 ' + (self.t ? Math.round(self.t * 106.5) : '未评') + '\n\n';

    m += '## 分部分\n\n| 部分 | 对 / 总 | 正确率 | 双链 |\n|---|---|---|---|\n';
    [['L', '听力', 'L-09'], ['C', '选词填空', 'C-01'], ['M', '长篇匹配', 'M-01'], ['R', '仔细阅读', 'R-01']].forEach(([k, nm, pid]) => {
      const ps = obj.filter(q => q.k === k);
      if (!ps.length) return;
      const r = ps.filter(q => sess.ans[q.id] === q.a).length;
      m += '| ' + nm + ' | ' + r + ' / ' + ps.length + ' | ' + Math.round(r / ps.length * 100) + '% | [[' + pNote(pid) + ']] |\n';
    });

    const wrongs = obj.filter(q => sess.ans[q.id] !== undefined && sess.ans[q.id] !== q.a);
    m += '\n## 错题 ' + wrongs.length + ' 道\n\n';
    if (!wrongs.length) m += '全对。\n';
    else {
      m += '| 题 | 类型 | 我选 | 答案 | 考点 | 题卡 |\n|---|---|---|---|---|---|\n';
      wrongs.forEach(q => {
        m += '| ' + (q.n || '—') + ' | ' + (KIND[q.k].n + ' · ' + (q.ty || '')) + ' | ' + sess.ans[q.id] + ' | ' + q.a +
          ' | ' + (q.pt || []).map(id => '[[' + pNote(id) + ']]').join(' ') + ' | [[' + qNote(q) + ']] |\n';
      });
    }

    m += '\n## 主观题\n\n';
    const wq = qs.find(q => q.k === 'W'), tq = qs.find(q => q.k === 'T');
    if (wq) m += '### 写作\n\n- 题目：' + cut(wq.st, 160) + '\n- 我的作文：' + wc(sess.text[wq.id] || '') + ' 词\n';
    if (tq) m += '\n### 翻译\n\n- 原文：' + cut(tq.st, 120) + '\n- 我的译文：' + wc(sess.text[tq.id] || '') + ' 词\n';
    m += '\n## 这一套暴露的考点\n\n';
    const touched = {};
    wrongs.forEach(q => (q.pt || []).forEach(id => { touched[id] = (touched[id] || 0) + 1; }));
    Object.keys(touched).sort((a, b) => touched[b] - touched[a]).slice(0, 6).forEach(id => {
      m += '- [[' + pNote(id) + ']]：错 ' + touched[id] + ' 题\n';
    });
    return m;
  }

  function mdPoints() {
    let m = '---\ntype: "报告"\nkind: "考点诊断"\ndate: ' + today() + '\ntags:\n  - 四级/报告\n  - 四级/考点\n---\n\n# 考点诊断 ' + today() + '\n\n';
    const rows = PTS.map(p => ({ p, s: ptStat(p.id) })).map(x => ({ ...x, acc: x.s.s ? x.s.r / x.s.s : null }));
    const tried = rows.filter(x => x.acc != null);
    m += '## 总览\n\n- 已练考点：' + tried.length + ' / ' + PTS.length + '\n';
    m += '- 总正确率：' + (overallAcc() == null ? '—' : Math.round(overallAcc() * 100) + '%') + '\n\n';
    m += '## 最该补的三个\n\n';
    tried.sort((a, b) => a.acc - b.acc).slice(0, 3).forEach((x, i) => {
      m += (i + 1) + '. [[' + pNote(x.p.id) + ']] — ' + Math.round(x.acc * 100) + '%（' + x.s.r + '/' + x.s.s + '）\n';
      m += '   - 练法：' + x.p.judge + '\n';
    });
    m += '\n## 全表\n\n| 考点 | 真题数 | 我练过 | 正确率 |\n|---|---|---|---|\n';
    rows.sort((a, b) => (a.acc == null ? 2 : b.acc == null ? -2 : a.acc - b.acc)).forEach(x => {
      m += '| [[' + pNote(x.p.id) + ']] | ' + x.p.n + ' | ' + x.s.s + ' | ' + (x.acc == null ? '—' : Math.round(x.acc * 100) + '%') + ' |\n';
    });
    return m;
  }

  function exportAll() {
    download('四级训练复盘 ' + today() + '.md', mdSession());
    setTimeout(() => download('四级错题本 ' + today() + '.md', mdWrong()), 500);
    setTimeout(() => download('四级考点诊断 ' + today() + '.md', mdPoints()), 1000);
  }

  /* ================= 渲染 ================= */
  function showModal(html) {
    let m = document.getElementById('modal');
    if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
    m.innerHTML = html;
    m.onclick = e => { if (e.target === m) closeModal(); };
  }
  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.innerHTML = '';
  }

  function render() {
    const crumbs = {
      desk: '工作台', train: '训练', run: sess && sess.exam ? '套卷模考' : '训练中',
      paperReview: '逐题解析', brain: '考点地图', wrong: '错题本', words: '单词本',
      stats: '数据', vault: '脑库连接', write: '写作翻译',
    };
    let body = '';
    if (view === 'desk') body = viewDesk();
    else if (view === 'train') body = viewTrain();
    else if (view === 'run') body = viewRun();
    else if (view === 'paperReview') body = viewPaperReview();
    else if (view === 'brain') body = viewBrain();
    else if (view === 'wrong') body = viewWrong();
    else if (view === 'words') body = wordQuiz ? wordQuizHTML() : viewWords();
    else if (view === 'stats') body = viewStats();
    else if (view === 'vault') body = viewVault();
    else if (view === 'write') body = viewWrite();
    else body = viewDesk();

    const crumb = '<span class="crumb-prefix" lang="en">CET-4</span><span class="crumb-divider" aria-hidden="true">/</span>' +
      (view === 'desk' ? '<b lang="en">Overview</b>' : '<button class="crumb-home" type="button" onclick="DESK.go(\'desk\')" lang="en">Overview</button>' +
      '<span class="crumb-divider" aria-hidden="true">/</span><b>' + (crumbs[view] || '') + '</b>') +
      (view === 'run' && sess ? ' <span class="chip" style="margin-left:6px">' + esc(modeName(sess)) + '</span>' : '');

    const wxTip = (isWX() && !S.wxTip)
      ? '<div class="wxhint"><span class="grow">在微信里打开的。<b>记录可能被清掉</b>，也不方便加到桌面 —— 点右上角「···」→「在浏览器打开」，再从浏览器菜单「添加到主屏幕」。</span>' +
        '<button class="btn sm ghost" onclick="DESK.dismissWX()">知道了</button></div>'
      : '';
    /* 鸿蒙/部分国产浏览器长按选词会失灵 —— 主动给一个「点词即译」的开关 */
    const tapTip = (IS_TOUCH && !S.tapDict && !S.tapTip)
      ? '<div class="wxhint tap"><span class="grow">长按取词不灵？打开<b>点词即译</b>：轻点句子里的英文词就直接出中文释义' +
        (IS_HARMONY ? '（鸿蒙推荐）' : '') + '。</span>' +
        '<button class="btn sm pri" onclick="DESK.turnOnTap()">打开</button>' +
        '<button class="btn sm ghost" onclick="DESK.dismissTap()">不用</button></div>'
      : '';
    /* 窄屏保留练习中的随手查词入口。首页和脑库页使用顶栏的查词按钮。 */
    const dock = view === 'desk' || view === 'vault' ? '' :
      '<button type="button" id="wdock" onclick="DESK.search()" aria-label="查词 / 译句"><b>查</b><small>单词</small></button>';
    document.getElementById('app').innerHTML = wxTip + tapTip + '<div class="shell">' + rail() +
      '<main class="main">' + topbar(crumb) + mobileNav() + body + '</main></div>' + dock;
    if (view === 'desk') drawStudyGraph();
    const currentTab = document.querySelector('.mobilenav [aria-current="page"]');
    if (currentTab) {
      const nav = currentTab.parentElement;
      const edge = currentTab.offsetLeft + currentTab.offsetWidth;
      if (edge > nav.clientWidth) nav.scrollLeft = edge - nav.clientWidth + 16;
    }
    const wb = document.getElementById('wbar');
    if (wb) wb.classList.remove('on');
    const clock = document.getElementById('clock');
    if (clock && sess && !sess.done) clock.textContent = fmtDur(Date.now() - sess.t0);
  }

  /* ================= 对外 ================= */
  const DESK = {
    go: go,
    setMode(m) { setup.mode = m; if (m === 'module' && !setup.kind) setup.kind = 'R'; render(); },
    setKind(k) { setup.kind = k; render(); },
    setSize(n) { setup.size = n; render(); },
    startSetup(mode, size, kind) {
      setup.mode = mode;
      setup.size = size;
      if (mode === 'module') setup.kind = kind || setup.kind || 'R';
      trainTab = 'single';
      go('train');
    },
    startNow() {
      const s = buildSession(setup.mode, setup.size, { kind: setup.kind || 'R' });
      if (!s) return toast('题库里抽不到题，换个方式试试');
      sess = s; view = 'run'; render(); window.scrollTo(0, 0);
    },
    startPoint(pid, n) {
      closeModal();
      const s = buildSession('point', n || 10, { pid });
      if (!s) return toast('这个考点还没有题');
      sess = s; view = 'run'; render(); window.scrollTo(0, 0);
    },
    single(qid) {
      closeModal();
      sess = { mode: 'single', ids: [qid], i: 0, ans: {}, cause: {}, t0: Date.now(), right: 0, done: false };
      view = 'run'; render(); window.scrollTo(0, 0);
    },
    previewOne(qid) { this.single(qid); },
    quickWrong() {
      if (!Object.keys(S.wrong).length) { toast('错题本是空的，先做一组'); return this.startSetup('smart', 10); }
      this.startSetup('wrong', 10);
    },
    answer: answer,
    setCause: setCause,
    nextQ: nextQ,
    prevQ: prevQ,
    endEarly: endEarly,
    openPoint: openPoint,
    closeModal: closeModal,
    setWrongFilter(k) { wrongFilter = k; render(); },
    setWriteTab(k) { writeTab = k; writeSel = null; writeRep = null; render(); },
    pickWrite(id) { writeSel = id; writeRep = null; render(); },
    saveDraft(v) {
      if (!writeSel) return;
      S.write[writeSel] = v; save();
      const c = document.getElementById('wcount');
      if (c) c.textContent = wc(v) + ' 词';
    },
    clearDraft() { if (writeSel) { S.write[writeSel] = ''; save(); render(); } },
    gradeEssay() {
      const q = QMAP[writeSel];
      const txt = S.write[writeSel] || '';
      if (wc(txt) < 30) return toast('先写够 30 词再批改');
      if (typeof window.Essay === 'undefined') return toast('批改引擎未加载');
      let rep;
      try { rep = window.Essay.analyze(txt, { prompt: q.st, title: '' }); }
      catch (e) { return toast('批改出错：' + e.message); }
      S.reports = S.reports || {};
      S.reports[writeSel] = { score: rep.score, stats: rep.stats, issues: rep.issues.slice(0, 30), comments: rep.comments };
      save();
      const box = document.getElementById('wreport');
      if (box) box.innerHTML = reportHTML(S.reports[writeSel]);
      toast('批改完成');
    },
    tickTrans(el, i) { const q = QMAP[writeSel]; S.checks = S.checks || {}; S.checks[q.id] = S.checks[q.id] || []; S.checks[q.id][i] = el.checked; save(); },
    checkTrans() {
      const q = QMAP[writeSel];
      const txt = S.write[writeSel] || '';
      const c = S.checks && S.checks[q.id] ? S.checks[q.id].filter(Boolean).length : 0;
      toast(txt.trim().length < 20 ? '还没写译文' : '自查通过 ' + c + '/5 项，译文 ' + wc(txt) + ' 词');
    },
    trainTab(k) { trainTab = k; render(); },
    paperTab(k) { paperTab = k; trainTab = 'paper'; render(); },
    openPapers() { trainTab = 'paper'; go('train'); },
    startPaper(key, resume) { startPaper(key, !!resume); },
    resumePaper(key) { startPaper(key, true); },
    retryPaper() { if (sess && sess.exam) startPaper(sess.paperKey, false); },
    submitExam: submitExam,
    toggleCard: toggleCard,
    jumpTo: jumpTo,
    jumpPart: jumpPart,
    examText: examText,
    examSelf: examSelf,
    reviewInPaper(qid) { if (!sess) return; sess.reviewId = qid; sess.i = Math.max(0, sess.ids.indexOf(qid)); view = 'paperReview'; render(); window.scrollTo(0, 0); },
    prevReview() { if (!sess) return; const i = sess.ids.indexOf(sess.reviewId); if (i > 0) { sess.reviewId = sess.ids[i - 1]; sess.i = i - 1; render(); window.scrollTo(0, 0); } },
    nextReview() { if (!sess) return; const i = sess.ids.indexOf(sess.reviewId); if (i >= 0 && i < sess.ids.length - 1) { sess.reviewId = sess.ids[i + 1]; sess.i = i + 1; render(); window.scrollTo(0, 0); } },
    backResult() { view = 'run'; render(); window.scrollTo(0, 0); },
    exportPaper() { download('四级套卷复盘 ' + today() + '.md', mdPaper()); },
    copyPaperMd() { copyText(mdPaper(), '整卷复盘 markdown 已复制'); },
    wFilter(k) { wFilter = k; render(); },
    manualWord: manualWord,
    wordColor: wordColor,
    wordDel: wordDel,
    clearWords: clearWords,
    exportWords: exportWords,
    copyWords: copyWords,
    reviewWords: reviewWords,
    quizShow() { if (wordQuiz) { wordQuiz.show = true; render(); } },
    quizNext() {
      if (!wordQuiz) return;
      if (wordQuiz.i + 1 >= wordQuiz.list.length) { wordQuiz = null; render(); return; }
      wordQuiz.i++; wordQuiz.show = false; render();
    },
    say: say,
    closePanel: closePanel,
    exportSession() { download('四级训练复盘 ' + today() + '.md', mdSession()); },
    copySessionMd() { copyText(mdSession(), '复盘 markdown 已复制'); },
    exportWrong() { download('四级错题本 ' + today() + '.md', mdWrong()); },
    copyWrongMd() { copyText(mdWrong(), '错题本 markdown 已复制'); },
    exportPoints() { download('四级考点诊断 ' + today() + '.md', mdPoints()); },
    exportAll: exportAll,
    exportJSON() { download('cet4-desk-data ' + today() + '.json', JSON.stringify(S, null, 1), 'application/json'); },
    search: openSearchPanel,
    setTapDict(on) { setTapDict(on); },
    pickBlank(n) { pickBlank(n); },
    answerFromPicker(l) { answerFromPicker(l); },
    forceUpdate() {
      try { sessionStorage.removeItem('cet4_rel'); } catch (e) { }
      try {
        const u = new URL(location.href);
        u.searchParams.set('v', Date.now());
        location.replace(u.toString());
      } catch (e) { location.reload(); }
    },
    turnOnTap() { S.tapDict = true; S.tapTip = 1; save(); toast('已开启：轻点正文英文词即可查'); render(); },
    dismissTap() { S.tapTip = 1; save(); render(); },
    testPoint(x, y) {
      const w = wordAtPoint(x, y);
      const el = document.elementFromPoint(x, y);
      const box = document.getElementById('diagpt');
      const msg = (w ? '取到「' + w + '」' : '没取到词') + ' · 元素 ' + (el ? el.tagName.toLowerCase() : '无');
      toast(msg);
      if (box) box.textContent = msg;
      return w;
    },
    runDiag() { runDiag(); },
    pingTr() { pingTr(); },
    dismissWX() { dismissWX(); },
    closeModal() { closeModal(); },
    setImportMode(m) { importMode = m; },
    exportBackup() {
      download('四级训练数据_' + today().replace(/-/g, '') + '.json', JSON.stringify(backupPayload()), 'application/json');
      S.lastBackup = Date.now(); save(); render();
    },
    importBackup() { importMode = 'merge'; importPanel(); },
    doImportFile() { doImportFile(); },
    doImportCode() { doImportCode(); },
    copyBackupCode() { copyBackupCode(); },
    exportEssay() {
      const q = QMAP[writeSel]; if (!q) return;
      const rep = S.reports && S.reports[writeSel];
      let m = '---\ntype: "作文"\ndate: ' + today() + '\npaper: "' + q.p + '"\ntags:\n  - 四级/写作\n---\n\n';
      m += '# ' + q.p + ' 写作\n\n## 题目\n\n' + q.st + '\n\n## 我的作文\n\n' + (S.write[writeSel] || '') + '\n\n';
      if (rep) {
        m += '## 批改\n\n- 分数：' + rep.score.total + ' / 15（' + rep.score.band + '）\n- 折合：' + Math.round(Math.min(106.5, rep.score.total / 15 * 106.5) * 10) / 10 + ' / 106.5\n- 词数：' + rep.stats.wordCount + ' · 句数：' + rep.stats.sentCount + ' · 段数：' + rep.stats.paras + '\n\n';
        if (rep.score.deductions) m += '### 扣分\n\n' + rep.score.deductions.map(d => '- ' + d.t).join('\n') + '\n\n';
        if (rep.comments) m += '### 总评\n\n' + rep.comments.map(c => '- ' + c).join('\n') + '\n\n';
      }
      m += '## 双链\n\n- 原卷：[[' + q.p + ' 试卷]]\n- 考点：[[' + pNote((q.pt || [])[0] || 'W-01') + ']]\n';
      download(q.p + ' 写作 ' + today() + '.md', m);
    },
    copyText(t, msg) { copyText(t, msg); },
    copyPoint(pid) { copyText('[[' + pNote(pid) + ']]', '考点双链已复制'); },
    copyNote(qid) { const q = QMAP[qid]; if (q) copyText('[[' + qNote(q) + ']]', '题卡双链已复制'); },
    copyLinks() {
      const q = curQ(); if (!q) return;
      const t = '[[' + qNote(q) + ']] ' + (q.pt || []).map(id => '[[' + pNote(id) + ']]').join(' ');
      copyText(t, '双链已复制，粘到 Obsidian 即可');
    },
    resetAll() {
      if (!confirm('清空本机所有训练记录、错题和草稿？导出的 md 不受影响。')) return;
      localStorage.removeItem(LS); S = blankStore(); save(); render(); toast('已清空');
    },
    _state: () => ({ S, sess, view }),
    _md: () => ({ session: mdSession(), wrong: mdWrong(), points: mdPoints() }),
  };
  window.DESK = DESK;

  /* 计时 */
  setInterval(() => {
    const c = document.getElementById('clock');
    if (c && sess && !sess.done) c.textContent = fmtDur(Date.now() - sess.t0);
  }, 1000);

  /* 键盘 */
  document.addEventListener('keydown', e => {
    const panel = document.getElementById('wpanel');
    if (e.key === 'Escape' && panel?.classList.contains('on')) {
      e.preventDefault();
      closePanel(true);
      return;
    }
    if (e.target.closest?.('#wpanel')) return;
    if (view !== 'run' || !sess || sess.done) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    const q = curQ(); if (!q) return;
    const k = e.key.toUpperCase();
    if (!sess.ans[q.id]) {
      if ('ABCD'.indexOf(k) >= 0) {
        if (q.k === 'M') { /* 匹配用字母，A-O */ }
        answer(k);
      } else if (q.k === 'M' && 'ABCDEFGHIJKLMNO'.indexOf(k) >= 0) answer(k);
      else if (q.k === 'C' && 'ABCDEFGHIJKLMNO'.indexOf(k) >= 0) answer(k);
    } else if (e.key === 'Enter' || e.key === 'ArrowRight') nextQ();
    else if (e.key === 'ArrowLeft') prevQ();
  });

  if (!document.getElementById('modal')) {
    const m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m);
  }
  initSelection();
  initDictionary();
  render();

  /* ---------- PWA：manifest / 图标 / 离线缓存 ----------
     这个站点是按 ?sharecode=xxx 鉴权的，静态资源不带这个参数会 403。
     所以不能在 HTML 里写死链接，只能在运行时把当前的 query 拼上去。 */
  /* 微信内置浏览器会把整页 HTML 缓存很久 —— 这是「电脑上好了、手机还是旧版」的真正原因。
     每次打开对一次 ver.txt，版本不一致就带新参数重载一次（同一版本只重载一次，避免死循环）。 */
  const VER = window.__VER__ || '0';
  function verCheck() {
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    const q = location.search || '';
    const u = 'ver.txt' + q + (q ? '&' : '?') + '_=' + Date.now();
    fetch(u, { cache: 'no-store' })
      .then(r => (r && r.ok ? r.text() : ''))
      .then(txt => {
        const v = String(txt || '').trim().slice(0, 40);
        if (!v || v === VER) return;
        try {
          if (sessionStorage.getItem('cet4_rel') === v) return;
          sessionStorage.setItem('cet4_rel', v);
        } catch (e) { }
        try {
          const u2 = new URL(location.href);
          u2.searchParams.set('v', v);
          location.replace(u2.toString());
        } catch (e) { }
      })
      .catch(() => { });
  }

  function pwaBoot() {
    const q = location.search || '';
    try {
      const mf = document.createElement('link');
      mf.rel = 'manifest';
      mf.href = 'manifest.webmanifest' + q;
      document.head.appendChild(mf);
      const ai = document.createElement('link');
      ai.rel = 'apple-touch-icon';
      ai.href = 'icon-192.png' + q;
      document.head.appendChild(ai);
      /* 标签页 / 桌面快捷方式图标：同样要带 sharecode，不然 403 */
      const ic = document.createElement('link');
      ic.rel = 'icon';
      ic.type = 'image/png';
      ic.href = 'icon-192.png' + q;
      document.head.appendChild(ic);
    } catch (e) { }
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js' + q, { scope: './' }).catch(() => { });
      });
    }
    setTimeout(verCheck, 1500);
  }
  pwaBoot();
})();
