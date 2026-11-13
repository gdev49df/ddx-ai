/* DDX AI: чат с фото. работает через воркер ddx-ai (режим chat), ключ groq лежит только в воркере.
   история хранится на телефоне; фото в истории остаются маленькими превью. */
(function () {
  'use strict';

  // адрес воркера
  var API = 'https://ddx-ai.wsmp.workers.dev/';
  var VERSION = 'v3.0';
  var KEY = 'wchat3', KEY_V2 = 'wchat2', KEY_OLD = 'wchat', KEY_DEV = 'wchat-dev', KEY_LEFT = 'wchat-left', KEY_CODE = 'wchat-code', KEY_SUB = 'wchat-sub', WA = '77751213271';
  var MAX_IMG = 4;          // фото в одном сообщении
  var BUDGET = 440000;      // символов base64 на все фото одного запроса (воркер принимает до 600 кб всего)
  var HINTS = ['объясни, как работает инфляция', 'идея подарка до 10 000 ₸', 'план тренировок на неделю', 'что на фото? прикрепи снимок'];

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- мелкие помощники ---------- */
  // первая буква подписей интерфейса заглавная (код, ссылки и текст пользователя не трогаем)
  var NOCAP = { strong: 1, em: 1, code: 1, a: 1, pre: 1, mark: 1 };
  function cap(v) { v = String(v); return /^[a-zа-яё]/.test(v) ? v.charAt(0).toUpperCase() + v.slice(1) : v; }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'raw') return;
      if (k === 'text') el.textContent = (NOCAP[tag] || attrs.raw) ? v : cap(v);
      else if (k === 'placeholder') el.setAttribute(k, cap(v));
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { append(el, x); });
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var ICONS = {
    arrowup: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    doc: '<path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M9 12.5h6M9 16h6"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    sort: '<path d="M4.5 7h15M7.5 12h9M10.5 17h3"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3L18 18M18 6l-1.7 1.7M7.7 16.3L6 18"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    list: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    chat: '<path d="M5 6.5a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 5 13.5z"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
    share: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M6 12.5v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2.4" fill="currentColor"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
    up: '<path d="M6 14.5l6-6 6 6"/>',
    file: '<path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V8H18"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>',
    gauge: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13.5l3.5-4"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    palette: '<path d="M12 4a8 8 0 1 0 0 16c1.4 0 2-.9 2-1.8 0-1.5-1.2-1.7-1.2-2.9 0-.9.7-1.5 1.7-1.5H17a3 3 0 0 0 3-3C20 6.9 16.4 4 12 4z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="15" cy="8.5" r="1"/>',
    tag: '<path d="M4 12.2V6.5A2.5 2.5 0 0 1 6.5 4h5.7a2 2 0 0 1 1.4.6l6 6a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1-.6-1.4z"/><circle cx="8.6" cy="8.6" r="1.2"/>',
    brain: '<path d="M9.5 4.5A3 3 0 0 0 6.6 7 3.2 3.2 0 0 0 5 10a3.2 3.2 0 0 0 1.2 2.5A3.2 3.2 0 0 0 7 16a3 3 0 0 0 2.6 2.4A2.5 2.5 0 0 0 12 20V6.5a2 2 0 0 0-2.5-2z"/><path d="M14.5 4.5A3 3 0 0 1 17.4 7 3.2 3.2 0 0 1 19 10a3.2 3.2 0 0 1-1.2 2.5A3.2 3.2 0 0 1 17 16a3 3 0 0 1-2.6 2.4A2.5 2.5 0 0 1 12 20V6.5a2 2 0 0 1 2.5-2z"/>',
    plus: '<path d="M12 4.5v15M4.5 12h15"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    down: '<path d="M6 9.5l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    out: '<path d="M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9M15 8l4 4-4 4M19 12H9.5"/>',
    bolt: '<path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z"/>',
    edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5"/>',
    thumbup: '<path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-7c1.4 0 2.4 1.2 2.1 2.6L12.6 9H18a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.9 19H7"/>',
    thumbdown: '<g transform="rotate(180 12 12)"><path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-7c1.4 0 2.4 1.2 2.1 2.6L12.6 9H18a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.9 19H7"/></g>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'
  };
  function icon(name) {
    var s = document.createElement('span');
    s.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
    return s.firstChild;
  }

  // логотип: шесть треугольников, собранных в шестиугольник с зазорами (как в ddx planner)
  function logo(cls) {
    var R = 46, c = 50, gap = 3.2, pts = [], tri = '', k;
    for (k = 0; k < 6; k++) { var a0 = (Math.PI / 3) * k - Math.PI / 2; pts.push([c + R * Math.cos(a0), c + R * Math.sin(a0)]); }
    for (k = 0; k < 6; k++) {
      var a = pts[k], b = pts[(k + 1) % 6], mid = (Math.PI / 3) * (k + 0.5) - Math.PI / 2;
      var dx = Math.cos(mid) * gap, dy = Math.sin(mid) * gap;
      var p = [[c + dx, c + dy], [a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy]];
      var gx = (p[0][0] + p[1][0] + p[2][0]) / 3, gy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      tri += '<polygon points="' + p.map(function (q) { return (gx + (q[0] - gx) * 0.8).toFixed(1) + ',' + (gy + (q[1] - gy) * 0.8).toFixed(1); }).join(' ') + '"/>';
    }
    var s = document.createElement('span');
    s.innerHTML = '<svg class="' + (cls || 'logo') + '" viewBox="0 0 100 100" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round">' + tri + '</svg>';
    return s.firstChild;
  }

  /* ---------- состояние ---------- */
  // S.chats: чаты, S.projects: папки с общим контекстом, S.cur: открытый чат (null: новый, ещё не создан)
  var S = { chats: [], projects: [], cur: null, pendingProject: null, open: {}, settings: { name: '', about: '', style: 'normal', extra: '', memOn: true, memory: [] } };
  var atts = [], busy = false, busyChat = null, thinkEl = null, errEl = null, lastLeft = null, subCode = '', sub = null;
  var device = ls.get(KEY_DEV);
  if (!device) { device = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); ls.set(KEY_DEV, device); }

  var curChat = function () { return S.cur ? S.chats.filter(function (c) { return c.id === S.cur; })[0] || null : null; };
  var projectById = function (id) { return id ? S.projects.filter(function (p) { return p.id === id; })[0] || null : null; };
  var curMsgs = function () { var c = curChat(); return c ? c.msgs : []; };

  function cleanMsgs(list) {
    return (Array.isArray(list) ? list : []).filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
      .map(function (m) { return { id: uid(), at: +m.at || 0, fb: m.fb === 'up' || m.fb === 'down' ? m.fb : '', role: m.role, text: String(m.text != null ? m.text : (m.content || '')), thumbs: Array.isArray(m.thumbs) ? m.thumbs : [], files: Array.isArray(m.files) ? m.files.filter(function (f) { return f && f.name; }).map(function (f) { return { name: String(f.name), text: String(f.text || '') }; }) : [] }; });
  }
  function load() {
    var d = null;
    try { d = JSON.parse(ls.get(KEY) || 'null'); } catch (e) { d = null; }
    if (d && Array.isArray(d.chats)) {
      S.chats = d.chats.map(function (c) {
        return { id: c.id || uid(), title: String(c.title || 'чат'), pinned: !!c.pinned, project: c.project || null, created: c.created || Date.now(), updated: c.updated || Date.now(), ord: typeof c.ord === 'number' ? c.ord : null, msgs: cleanMsgs(c.msgs) };
      });
      S.projects = (Array.isArray(d.projects) ? d.projects : []).map(function (p) { return { id: p.id || uid(), name: String(p.name || 'проект'), instructions: String(p.instructions || ''), created: p.created || Date.now(), ord: typeof p.ord === 'number' ? p.ord : null }; });
      S.settings = Object.assign(S.settings, d.settings || {});
      S.cur = S.chats.some(function (c) { return c.id === d.cur; }) ? d.cur : null;
      S.open = d.open && typeof d.open === 'object' ? d.open : {};
    } else {
      // перенос из прошлых версий, где был один общий чат
      var old = [];
      try { old = JSON.parse(ls.get(KEY_V2) || 'null') || JSON.parse(ls.get(KEY_OLD) || '[]') || []; } catch (e2) { old = []; }
      var msgs = cleanMsgs(old);
      if (msgs.length) {
        var first = msgs.filter(function (m) { return m.role === 'user'; })[0];
        var c0 = { id: uid(), title: makeTitle(first ? first.text : ''), pinned: false, project: null, created: Date.now(), updated: Date.now(), msgs: msgs };
        S.chats = [c0]; S.cur = c0.id;
      }
    }
    try { var l = JSON.parse(ls.get(KEY_LEFT) || 'null'); if (l && l.limit) { lastLeft = l; refreshLeft(); } } catch (e3) { /* нет данных */ }
    subCode = ls.get(KEY_CODE) || '';
    try { sub = subCode ? JSON.parse(ls.get(KEY_SUB) || 'null') : null; } catch (e4) { sub = null; }
  }
  function pack(stripThumbs) {
    return JSON.stringify({
      v: 3, cur: S.cur, open: S.open, settings: S.settings, projects: S.projects,
      chats: S.chats.slice(0, 150).map(function (c) {
        return { id: c.id, title: c.title, pinned: c.pinned, project: c.project, created: c.created, updated: c.updated, ord: c.ord == null ? null : c.ord,
          msgs: c.msgs.slice(-80).map(function (m) { return { at: m.at || 0, fb: m.fb || '', role: m.role, text: m.text, thumbs: stripThumbs ? [] : (m.thumbs || []), files: (m.files || []).map(function (f) { return { name: f.name, text: stripThumbs ? '' : f.text }; }) }; }) };
      })
    });
  }
  function save() {
    refreshSide(); if (typeof schedulePush === 'function') schedulePush();
    if (ls.set(KEY, pack(false))) return;
    // память переполнена: сначала убираем превью фото
    if (!ls.set(KEY, pack(true))) toast('не хватает памяти: удали старые чаты');
  }
  function dayStr() { return new Date().toISOString().slice(0, 10); }
  function makeTitle(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return 'фото';
    return t.length > 42 ? t.slice(0, 40).trim() + '…' : t;
  }
  function when(ts) {
    var d = new Date(ts), n = new Date(), day = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var diff = Math.round((day(n) - day(d)) / 86400000);
    if (diff <= 0) return 'сегодня';
    if (diff === 1) return 'вчера';
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  /* ---------- markdown без innerHTML ---------- */
  // формулы: модель иногда пишет latex, а у нас простой текст, поэтому переводим в обычные символы
  var SYM = { cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', infty: '∞', pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', omega: 'ω', phi: 'φ', varphi: 'φ', epsilon: 'ε', rho: 'ρ', tau: 'τ', sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', ldots: '…', cdots: '…', dots: '…', circ: '°', degree: '°', angle: '∠', perp: '⊥', parallel: '∥', neg: '¬', land: '∧', lor: '∨', sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', log: 'log', ln: 'ln', lg: 'lg', lim: 'lim', max: 'max', min: 'min', operatorname: '' };
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', '−': '⁻' };
  var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', k: 'ₖ', m: 'ₘ', p: 'ₚ', t: 'ₜ', '−': '₋' };
  function mapAll(str, map) { var o = '', k; for (k = 0; k < str.length; k++) { if (!map[str[k]]) return null; o += map[str[k]]; } return o; }
  function tex(src) {
    var t = String(src), prev, n = 0;
    t = t.replace(/\\(left|right|big|Big|bigg|Bigg)\b\s*/g, '').replace(/\\[,;:! ]|\\quad|\\qquad/g, ' ');
    t = t.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|operatorname|mathbb|boldsymbol)\{([^{}]*)\}/g, '$1');
    t = t.replace(/(\d)\s*(\\[dt]?frac)/g, '$1 $2');
    do {   // дроби и корни изнутри наружу
      prev = t;
      t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (m, a, b) { var w = function (x) { return /^[\w.,−-]+$/.test(x.trim()) ? x.trim() : '(' + x.trim() + ')'; }; return w(a) + '/' + w(b); });
      t = t.replace(/\\sqrt\s*\[(\d+)\]\s*\{([^{}]*)\}/g, function (m, k, a) { return (k === '3' ? '∛' : k === '4' ? '∜' : k + '√') + (/^[\w.]+$/.test(a) ? a : '(' + a + ')'); });
      t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, function (m, a) { return '√' + (/^[\w.]+$/.test(a) ? a : '(' + a + ')'); });
    } while (t !== prev && ++n < 8);
    t = t.replace(/\\([A-Za-z]+)/g, function (m, w) { return SYM.hasOwnProperty(w) ? SYM[w] : w; });
    t = t.replace(/\^\s*\{([^{}]*)\}|\^\s*([A-Za-z0-9+\-])/g, function (m, a, b) { var v = a != null ? a : b, u = mapAll(v, SUP); return u || (v.length === 1 ? '^' + v : '^(' + v + ')'); });
    t = t.replace(/_\s*\{([^{}]*)\}|_\s*([A-Za-z0-9])/g, function (m, a, b) { var v = a != null ? a : b, u = mapAll(v, SUB); return u || '_' + (v.length === 1 ? v : '(' + v + ')'); });
    return t.replace(/[{}]/g, '').replace(/\\/g, '').replace(/ {2,}/g, ' ').trim();
  }
  function mathText(text) {
    return text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g, function (m, a, b, c, d) {
      var body = a != null ? a : b != null ? b : c != null ? c : d;
      if (d != null && !/[\\^_=]/.test(body)) return m;      // не формула, а доллары в тексте
      if (d != null && (/^\s|\s$/.test(body))) return m;
      return tex(body);
    });
  }
  function mdInline(text, into) {
    text = mathText(text);
    text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<)]+)/).forEach(function (part) {
      if (!part) return;
      var m;
      if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) into.append(h('strong', { text: part.slice(2, -2) }));
      else if (/^\*[^*]+\*$/.test(part)) into.append(h('em', { text: part.slice(1, -1) }));
      else if (/^`[^`]+`$/.test(part)) into.append(h('code', { text: part.slice(1, -1) }));
      else if ((m = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part))) into.append(h('a', { href: m[2], target: '_blank', rel: 'noopener noreferrer', text: m[1] }));
      else if (/^https?:\/\//.test(part)) into.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer', text: part }));
      else into.append(part);
    });
    return into;
  }

  /* ---------- файлы, копирование, подсветка кода ---------- */
  function saveFile(name, text, mime) {
    try {
      var file = new File([text], name, { type: mime || 'text/plain' });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(function () { /* отменили */ }); return; }
    } catch (e0) { /* без File */ }
    var url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    var a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('файл «' + name + '» сохранён');
  }
  function copyText(text, btn) {
    var done = function () {
      if (!btn) { toast('скопировано'); return; }
      var old = btn.cloneNode(true); btn.replaceChildren(icon('check'), h('span', { text: 'скопировано' })); btn.classList.add('pop');
      setTimeout(function () { btn.classList.remove('pop'); btn.replaceChildren.apply(btn, Array.prototype.slice.call(old.childNodes)); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('не получилось скопировать'); });
    else { try { var t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); done(); } catch (e) { toast('копирование недоступно'); } }
  }
  var EXT = { js: 'js', ts: 'ts', py: 'py', json: 'json', html: 'html', css: 'css', sh: 'sh', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', cs: 'cs', go: 'go', rs: 'rs', php: 'php', kt: 'kt', swift: 'swift', yaml: 'yml', md: 'md', xml: 'xml' };
  var LANG_ALIAS = { javascript: 'js', jsx: 'js', node: 'js', mjs: 'js', typescript: 'ts', tsx: 'ts', python: 'py', python3: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', csharp: 'cs', 'c#': 'cs', 'c++': 'cpp', golang: 'go', rust: 'rs', kotlin: 'kt', yml: 'yaml', markdown: 'md', htm: 'html', svg: 'xml', postgres: 'sql', mysql: 'sql', sqlite: 'sql', jsonc: 'json' };
  var KW = {
    js: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false void yield static get set delete',
    ts: 'const let var function return if else for while do switch case break continue new class extends implements interface type enum import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false void public private protected readonly static abstract as keyof namespace declare',
    py: 'def class return if elif else for while in not and or is None True False import from as with try except finally raise pass break continue lambda yield global nonlocal async await self print',
    sh: 'if then else elif fi for while do done case esac function in echo cd ls rm cp mv mkdir cat grep sudo export source npm npx pip git curl exit return',
    sql: 'select from where group by order having join left right inner outer full on as and or not null insert into values update set delete create table drop alter add index primary key foreign references distinct limit offset union all case when then else end like in is exists count sum avg min max desc asc default unique',
    c: 'int long short float double char void bool boolean string var val let fun func fn function return if else for foreach while do switch case break continue new class struct enum interface extends implements public private protected static final const abstract override virtual using namespace import package from null nil true false this self try catch finally throw throws defer go chan range map type mut impl trait pub use match async await in is as',
    json: 'true false null', css: '', html: '', xml: ''
  };
  function langKey(l) {
    l = String(l || '').toLowerCase().trim(); l = LANG_ALIAS[l] || l;
    if (KW[l] != null) return l;
    return /^(java|cpp|cs|go|rs|php|kt|swift|dart|scala|rb|ruby|lua|r)$/.test(l) ? 'c' : '';
  }
  var HL_RX = {};
  function hlRx(k) {
    if (HL_RX[k]) return HL_RX[k];
    var com = k === 'py' || k === 'sh' ? '#[^\\n]*' : k === 'sql' ? '--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/' : k === 'css' ? '\\/\\*[\\s\\S]*?\\*\\/' : k === 'html' || k === 'xml' ? '<!--[\\s\\S]*?-->' : k === 'json' ? '(?!)' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    var str = (k === 'py' ? '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|' : '') + '"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'' + (k === 'js' || k === 'ts' ? '|`(?:\\\\.|[^`\\\\])*`' : '');
    var parts = ['(' + com + ')'];
    if (k === 'json') parts.push('("(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:))'); else parts.push('(?!)()');
    parts.push('(' + str + ')');
    parts.push(k === 'html' || k === 'xml' ? '(<\\/?[A-Za-z][\\w:-]*|\\/?>)' : k === 'css' ? '([.#][A-Za-z_-][\\w-]*)' : '(?!)()');
    parts.push('(-?\\b\\d+(?:\\.\\d+)?(?:px|rem|em|vh|vw|ms|s|%)?)');
    var kw = KW[k] || ''; parts.push(kw ? '(\\b(?:' + kw.split(' ').join('|') + ')\\b)' : '(?!)()');
    return (HL_RX[k] = new RegExp(parts.join('|'), k === 'sql' ? 'gi' : 'g'));
  }
  var HL_CLS = ['', 'c', 'p', 's', 't', 'n', 'k'];
  function highlight(code, lang) {
    var k = langKey(lang), el = h('code');
    if (!k || code.length > 12000) { el.textContent = code; return el; }
    var rx = hlRx(k), last = 0, m;
    rx.lastIndex = 0;
    while ((m = rx.exec(code))) {
      if (!m[0]) { rx.lastIndex++; continue; }
      var g = 1; while (g < 7 && m[g] == null) g++;
      if (m.index > last) el.append(code.slice(last, m.index));
      el.append(h('span', { class: 'tk-' + HL_CLS[g], text: m[0], raw: 1 }));
      last = m.index + m[0].length;
    }
    if (last < code.length) el.append(code.slice(last));
    return el;
  }
  function blk(label, body, actions) {
    return h('div', { class: 'blk' }, h('div', { class: 'bhead' }, h('span', { class: 'blabel', text: label, raw: 1 }), h('span', { class: 'bact' }, actions)), body);
  }
  function bbtn(ic, label, fn) {
    var b = h('button', { class: 'bbtn', type: 'button', 'aria-label': label }, icon(ic), h('span', { text: label }));
    b.addEventListener('click', function () { fn(b); }); return b;
  }
  function plainCell(t) { return String(t).replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*([^*]+)\*/g, '$1'); }
  function toCsv(head, body) {
    var q = function (v) { v = plainCell(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [head].concat(body).map(function (r) { return head.map(function (_, j) { return q(r[j] || ''); }).join(';'); }).join('\r\n');
  }
  function codeBlock(code, lang) {
    var k = langKey(lang), name = String(lang || '').trim().toLowerCase();
    var label = name && !/^(text|txt|plain|plaintext)$/.test(name) ? name : 'код', ext = EXT[LANG_ALIAS[name] || name] || EXT[k] || 'txt';
    return blk(label, h('pre', null, highlight(code, lang)), [
      bbtn('copy', 'копировать', function (b) { copyText(code, b); }),
      bbtn('download', 'скачать', function () { saveFile('code.' + ext, code, 'text/plain'); })
    ]);
  }
  function tableBlock(head, body, tbl) {
    return blk('таблица', tbl, [
      bbtn('copy', 'копировать', function (b) { copyText([head].concat(body).map(function (r) { return head.map(function (_, j) { return plainCell(r[j] || ''); }).join('\t'); }).join('\n'), b); }),
      bbtn('download', 'скачать', function () { saveFile('table.csv', toCsv(head, body), 'text/csv'); })
    ]);
  }
  function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function mdBlock(text) {
    var root = h('div', { class: 'md' }), lines = String(text || '').replace(/\r/g, '').split('\n'), i = 0, list = null, ordered = false;
    while (i < lines.length) {
      var line = lines[i].trim(), m;
      if (/^```/.test(line)) {
        var lang = line.replace(/^```+/, '').trim().split(/\s+/)[0] || '', code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
        i++; list = null;
        root.append(codeBlock(code.join('\n'), lang));
        continue;
      }
      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].indexOf('-') >= 0) {
        var head = cells(line), body = []; i += 2; list = null;
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { body.push(cells(lines[i])); i++; }
        var thead = h('tr'), tbody = h('tbody');
        head.forEach(function (c) { thead.append(mdInline(c, h('th'))); });
        body.forEach(function (r) { var tr = h('tr'); head.forEach(function (_, j) { tr.append(mdInline(r[j] || '', h('td'))); }); tbody.append(tr); });
        root.append(tableBlock(head, body, h('div', { class: 'tbl' }, h('table', null, h('thead', null, thead), tbody))));
        continue;
      }
      i++;
      var li = /^(?:[-*•]\s+|(\d+)[.)]\s+)(.*)$/.exec(line);
      if (li) {
        var ord = !!li[1];
        if (!list || ordered !== ord) { list = h(ord ? 'ol' : 'ul'); ordered = ord; root.append(list); }
        list.append(mdInline(li[2], h('li')));
        continue;
      }
      list = null;
      if (!line) continue;
      if ((m = /^#{1,6}\s+(.*)$/.exec(line))) { root.append(mdInline(m[1].replace(/\*\*/g, ''), h('p', { class: 'md-h' }))); continue; }
      if (/^[-*_]{3,}$/.test(line)) continue;
      if ((m = /^>\s?(.*)$/.exec(line))) { root.append(mdInline(m[1], h('p', { class: 'md-q' }))); continue; }
      root.append(mdInline(line, h('p')));
    }
    return root;
  }

  // текст ответа проявляется слово за словом: каждое слово плавно выходит из размытия
  function streamWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) { if (!walker.currentNode.parentElement.closest('pre, .bhead')) nodes.push(walker.currentNode); }
    var total = nodes.reduce(function (n, t) { return n + (t.nodeValue.match(/\S+/g) || []).length; }, 0);
    var step = Math.min(0.05, 4 / Math.max(total, 1)), n = 0;
    nodes.forEach(function (t) {
      var frag = document.createDocumentFragment();
      t.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement('span');
        w.className = 'w'; w.textContent = part; w.style.animationDelay = (0.1 + n++ * step).toFixed(2) + 's';
        frag.appendChild(w);
      });
      t.replaceWith(frag);
    });
  }

  /* ---------- отрисовка ---------- */
  var chat = $('#chat'), hero = $('#hero'), ta = $('#t'), sendBtn = $('#send');

  /* ---------- аватар, zip-экспорт, языки ---------- */
  function avEl(cls) {
    var a = S.settings.avatar, nm = (S.settings.fullName || S.settings.name || (acct && acct.user && acct.user.login) || '').trim();
    var s = h('span', { class: 'sava' + (cls ? ' ' + cls : '') });
    if (a) { s.classList.add('img'); s.style.backgroundImage = 'url(' + a + ')'; } else s.textContent = (nm || 'D').charAt(0).toUpperCase();
    return s;
  }
  function pickAvatar(done) {
    var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 10 * 1048576) { toast('Файл больше 10 МБ'); return; }
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var n = 192, cv = document.createElement('canvas'), s = Math.min(img.width, img.height), cx = cv.getContext('2d');
        cv.width = cv.height = n; cx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, n, n);
        URL.revokeObjectURL(url); S.settings.avatar = cv.toDataURL('image/jpeg', .85); save(); refreshSide(); if (done) done(); toast('Фото обновлено');
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('Не удалось открыть фото'); };
      img.src = url;
    });
    document.body.append(inp); inp.click();
  }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], cen = [], off = 0, T = [], n, k, cc;
    for (n = 0; n < 256; n++) { cc = n; for (k = 0; k < 8; k++) cc = cc & 1 ? 0xEDB88320 ^ (cc >>> 1) : cc >>> 1; T[n] = cc >>> 0; }
    var crc = function (b) { var x = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) x = T[(x ^ b[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
    files.forEach(function (f) {
      var nm = enc.encode(f.name), d = enc.encode(f.text), cr = crc(d);
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, cr, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, d);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, cr, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + d.length;
    });
    var csz = cen.reduce(function (a, b) { return a + b.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function saveBlob(name, blob) {
    try {
      var file = new File([blob], name, { type: blob.type });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(function () { /* отменили */ }); return; }
    } catch (e0) { /* без File */ }
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('Файл «' + name + '» сохранён');
  }
  function exportMemory() {
    var st = S.settings, mem = st.memory || [], prof = [];
    prof.push('# Профиль', '');
    if (st.fullName) prof.push('- Полное имя: ' + st.fullName);
    if (st.name) prof.push('- Как обращаться: ' + st.name);
    if (st.role) prof.push('- Чем занимается: ' + st.role);
    if (st.about) prof.push('- О себе: ' + st.about);
    if (st.extra) prof.push('', '## Свои правила', '', st.extra);
    var facts = ['# Память', ''].concat(mem.length ? mem.map(function (t) { return '- ' + t; }) : ['Пока пусто.']);
    saveBlob('ddx-ai-memory.zip', zipStore([{ name: 'profile.md', text: prof.join('\n') + '\n' }, { name: 'memory.md', text: facts.join('\n') + '\n' }]));
  }
  var LANGS = [['ru', 'Русский', 'Russian'], ['kk', 'Қазақша', 'Kazakh'], ['en', 'English', 'English'], ['uk', 'Українська', 'Ukrainian'], ['be', 'Беларуская', 'Belarusian'], ['uz', 'Oʻzbekcha', 'Uzbek'],
    ['ky', 'Кыргызча', 'Kyrgyz'], ['tg', 'Тоҷикӣ', 'Tajik'], ['az', 'Azərbaycanca', 'Azerbaijani'], ['ka', 'ქართული', 'Georgian'], ['hy', 'Հայերեն', 'Armenian'], ['tr', 'Türkçe', 'Turkish'],
    ['de', 'Deutsch', 'German'], ['fr', 'Français', 'French'], ['es', 'Español', 'Spanish'], ['it', 'Italiano', 'Italian'], ['pt', 'Português', 'Portuguese'], ['pl', 'Polski', 'Polish'],
    ['nl', 'Nederlands', 'Dutch'], ['cs', 'Čeština', 'Czech'], ['ro', 'Română', 'Romanian'], ['hu', 'Magyar', 'Hungarian'], ['bg', 'Български', 'Bulgarian'], ['sr', 'Српски', 'Serbian'],
    ['el', 'Ελληνικά', 'Greek'], ['sv', 'Svenska', 'Swedish'], ['da', 'Dansk', 'Danish'], ['fi', 'Suomi', 'Finnish'], ['no', 'Norsk', 'Norwegian'], ['he', 'עברית', 'Hebrew'],
    ['ar', 'العربية', 'Arabic'], ['fa', 'فارسی', 'Persian'], ['hi', 'हिन्दी', 'Hindi'], ['bn', 'বাংলা', 'Bangla'], ['ur', 'اردو', 'Urdu'], ['th', 'ไทย', 'Thai'],
    ['vi', 'Tiếng Việt', 'Vietnamese'], ['id', 'Indonesia', 'Indonesian'], ['ms', 'Melayu', 'Malay'], ['fil', 'Filipino', 'Filipino'], ['zh-CN', '中文（简体）', 'Chinese (Simplified)'],
    ['zh-TW', '中文（繁體）', 'Chinese (Traditional)'], ['ja', '日本語', 'Japanese'], ['ko', '한국어', 'Korean'], ['mn', 'Монгол', 'Mongolian']];
  function langOf(code) { return LANGS.filter(function (l) { return l[0] === code; })[0] || null; }
  function openUiLang(back) {
    var cur = window.I18N ? I18N.get() : 'ru';
    var list = h('div', { class: 'langs one' }, Object.keys(I18N.langs).map(function (k) {
      var b = h('button', { type: 'button', class: 'lang' + (k === cur ? ' on' : ''), 'data-notr': '1' }, h('b', { text: I18N.langs[k], raw: 1 }));
      b.addEventListener('click', function () { if (k === cur) { back(); return; } I18N.set(k); });
      return b;
    }));
    openSheet([backLink(back), h('h2', { text: 'Язык интерфейса' }), h('p', { class: 'cap', text: 'Язык кнопок и подсказок. Ответы ИИ зависят от языка твоих сообщений и от настройки «Язык ответов».' }), list]);
  }
  function openLangPicker(back) {
    var q = field('input', { type: 'search', placeholder: 'Поиск языков', 'aria-label': 'поиск языков' }), grid = h('div', { class: 'langs' });
    var cur = S.settings.lang || 'auto';
    var fill = function () {
      var s = q.value.trim().toLowerCase(); grid.replaceChildren();
      [['auto', 'Как в сообщении', 'Автоматически']].concat(LANGS).filter(function (l) { return !s || (l[1] + ' ' + l[2]).toLowerCase().indexOf(s) >= 0; }).forEach(function (l) {
        var b = h('button', { type: 'button', class: 'lang' + (l[0] === cur ? ' on' : '') }, h('b', { text: l[1], raw: 1 }), h('span', { text: l[2], raw: 1 }));
        b.addEventListener('click', function () { S.settings.lang = l[0]; save(); toast('Язык ответов: ' + l[1]); back(); });
        grid.append(b);
      });
      if (!grid.children.length) grid.append(h('p', { class: 'cap', text: 'Ничего не найдено' }));
    };
    q.addEventListener('input', fill); fill();
    openSheet([backLink(back), h('h2', { text: 'Выберите язык' }), h('div', { class: 'sw-find big' }, icon('search'), q), grid], true);
    if (!wide()) setTimeout(function () { q.focus(); }, 350);
  }

  /* ---------- предпросмотр файла (справа, пол-окна) ---------- */
  var pvEl = null;
  function closePreview() {
    if (!pvEl) return; var p = pvEl; pvEl = null; document.body.classList.remove('fpv-on');
    p.classList.add('out'); setTimeout(function () { p.remove(); }, 260);
  }
  function openPreview(f) {
    var text = String(f.text || ''), name = f.name || 'файл';
    if (pvEl) { pvEl.remove(); pvEl = null; }
    var cp = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'копировать' }, icon('copy')); cp.addEventListener('click', function () { copyText(text, cp); });
    var dl = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'скачать' }, icon('download')); dl.addEventListener('click', function () { saveFile(name, text, 'text/plain'); });
    var x = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'закрыть' }, icon('close')); x.addEventListener('click', closePreview);
    var body = h('pre', { class: 'fpv-text' }); body.textContent = text || 'Содержимое недоступно (файл не сохранён в чате).';
    pvEl = h('aside', { class: 'fpv' },
      h('div', { class: 'fpv-head' }, icon('file'), h('div', { class: 'fpv-t' }, h('b', { text: name, raw: 1 }), h('em', { text: text.length + ' символов' })), cp, dl, x),
      h('div', { class: 'fpv-body' }, body));
    document.body.append(pvEl); document.body.classList.add('fpv-on');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pvEl && !palEl) closePreview(); });

  function msgEl(m, fresh) {
    var el;
    if (m.role === 'user') {
      el = h('div', { class: 'msg me' });
      var pics = m.full && m.full.length ? m.full : m.thumbs;
      if (pics && pics.length) {
        var grid = h('div', { class: 'pics' + (pics.length === 1 ? ' one' : '') });
        pics.forEach(function (src) { grid.append(h('img', { src: src, alt: 'фото', onclick: function () { viewPhoto(src); } })); });
        el.append(grid);
      }
      if (m.files && m.files.length) el.append(h('div', { class: 'fchips' }, m.files.map(function (f) { var c = h('button', { class: 'fchip', type: 'button' }, icon('file'), h('span', { text: f.name, raw: 1 })); c.addEventListener('click', function () { openPreview(f); }); return c; })));
      if (m.text) el.append(h('p', { text: m.text, raw: 1 }));
      if (m.text) { var eb = h('button', { class: 'medit', type: 'button', 'aria-label': 'изменить' }, icon('edit')); eb.addEventListener('click', function (e) { e.stopPropagation(); editMsg(m, el); }); el.append(eb); }
      if (fresh) el.classList.add('rise');
    } else {
      el = h('div', { class: 'msg ai' }, mdBlock(m.text));
      var ib = function (ic, label, fn) { var b = h('button', { class: 'ab', type: 'button', 'aria-label': label, title: label }, icon(ic)); b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); }); return b; };
      var copy = ib('copy', 'копировать', function (b) {
        var done = function () { b.replaceChildren(icon('check')); b.classList.add('pop'); setTimeout(function () { b.classList.remove('pop'); }, 700); setTimeout(function () { b.replaceChildren(icon('copy')); }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, function () { toast('не получилось скопировать'); });
        else toast('копирование недоступно');
      });
      var up = ib('thumbup', 'хороший ответ', function () { setFb(m.fb === 'up' ? '' : 'up'); });
      var down = ib('thumbdown', 'плохой ответ', function () { setFb(m.fb === 'down' ? '' : 'down'); });
      var setFb = function (v) { m.fb = v; save(); up.classList.toggle('on', v === 'up'); down.classList.toggle('on', v === 'down'); if (v) toast(v === 'up' ? 'Спасибо за оценку' : 'Спасибо, учту'); };
      up.classList.toggle('on', m.fb === 'up'); down.classList.toggle('on', m.fb === 'down');
      var cc = curChat(), isLast = !!(cc && cc.msgs[cc.msgs.length - 1] === m);
      var again = isLast ? ib('refresh', 'повторить', function () {
        var c2 = curChat(); if (!c2 || busy) { toast('дождись ответа или нажми стоп'); return; }
        if (c2.msgs[c2.msgs.length - 1] !== m) return;
        c2.msgs.pop(); save(); renderAll(); request();
      }) : null;
      var shr = ib('share', 'поделиться', function () { shareText(m.text, 'ответ DDX AI'); });
      var when = m.at ? (function () { var d = new Date(m.at), now = new Date(), loc = window.I18N ? I18N.locale() : 'ru-RU', tm = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
        return d.toDateString() === now.toDateString() ? tm : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ', ' + tm; })() : '';
      el.append(h('div', { class: 'msg-actions' }, copy, up, down, again, shr, when ? h('span', { class: 'mtime', text: when, raw: 1, 'data-notr': '1' }) : null));
      if (fresh) { el.classList.add('fresh'); streamWords(el); if (m.text.length > 700) el.classList.add('plain'); }
    }
    return el;
  }


  // правка своего сообщения: всё после него убирается, ответ пишется заново
  function editMsg(m, el) {
    if (busy) { toast('дождись ответа или нажми стоп'); return; }
    var c = curChat(); if (!c || el.classList.contains('editing')) return;
    var before = Array.prototype.slice.call(el.childNodes);
    var box = h('textarea', { class: 'editbox', rows: '1', 'aria-label': 'изменить сообщение' }); box.value = m.text;
    var fit = function () { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 260) + 'px'; };
    var stop = function () { el.classList.remove('editing'); el.replaceChildren.apply(el, before); };
    var ok = h('button', { class: 'btn solid', type: 'button', text: 'Отправить' }), no = h('button', { class: 'btn', type: 'button', text: 'Отмена' });
    no.addEventListener('click', stop);
    ok.addEventListener('click', function () {
      var t = box.value.trim(); if (!t) return;
      var i = c.msgs.indexOf(m); if (i < 0) return;
      m.text = t; c.msgs.length = i + 1; c.updated = Date.now();
      if (i === 0) c.title = makeTitle(t);
      save(); renderAll(); toBottom(true); request();
    });
    box.addEventListener('input', fit);
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') stop(); });
    el.classList.add('editing'); el.replaceChildren(box, h('div', { class: 'editbtns' }, no, ok));
    fit(); box.focus(); box.setSelectionRange(box.value.length, box.value.length);
  }

  // шапка показывает название открытого чата и проект
  // приветствие на пустом чате: зависит от времени суток
  function pickGreeting() {
    var hr = new Date().getHours(), nm = (S.settings.name || '').trim(), L;
    if (hr < 5 || hr >= 23) L = ['привет, ночная сова', 'не спится? давай помозгуем', 'ночью думается лучше всего: что обсудим?', 'ночная сова на связи, помозгуем?'];
    else if (hr < 11) L = ['доброе утро, соня', 'доброе утро! с чего начнём?', 'утро: самое время помозгуем', 'привет! кофе уже был? помозгуем?'];
    else if (hr < 17) L = ['помозгуем?', 'добрый день! что разберём?', 'чем помочь сегодня?', 'привет! над чем думаем?'];
    else L = ['добрый вечер! что обсудим?', 'вечер: помозгуем?', 'привет! как день прошёл?', 'чем займёмся вечером?'];
    if (nm) L.push('привет, ' + nm + '! помозгуем?');
    return L[Math.floor(Math.random() * L.length)];
  }
  var greet = '';
  function updateHeader() {
    var c = curChat(), pr = projectById(c ? c.project : S.pendingProject);
    $('#title').textContent = c ? c.title : 'DDX AI'; $('#title').classList.toggle('is-brand', !c);
    var has = !!(c && c.msgs.length); $('#more').style.display = '';
    $('#kicker').textContent = pr ? pr.name : (c ? 'Чат' : 'Личный помощник');
    var capText = cap(pr
      ? 'проект «' + pr.name + '»: чат учитывает его контекст. спроси что угодно или пришли фото.'
      : (greet || (greet = pickGreeting())) + ' спроси что угодно или пришли фото.');
    var capEl = $('#hero-cap');
    if (capEl.getAttribute('data-t') !== capText) {
      capEl.setAttribute('data-t', capText); capEl.replaceChildren();
      capText.split(' ').forEach(function (w, i) { capEl.append(h('span', { class: 'cw', style: 'animation-delay:' + (180 + i * 55) + 'ms', text: w, raw: 1 }), ' '); });
    }
  }
  function showHero() { hero.hidden = !!(curMsgs().length || thinkEl); }

  /* ---------- черновики: недописанный текст у каждого чата свой ---------- */
  var KEY_DRAFT = 'wchat-drafts', drafts = {}, draftKey = null;
  try { drafts = JSON.parse(ls.get(KEY_DRAFT) || '{}') || {}; } catch (eD) { drafts = {}; }
  function dKey() { return S.cur || ('new' + (S.pendingProject || '')); }
  function storeDraft() {
    if (draftKey == null) return;
    var v = ta.value;
    if (v.trim()) drafts[draftKey] = v; else delete drafts[draftKey];
    try { ls.set(KEY_DRAFT, JSON.stringify(drafts)); } catch (eS) { /* нет места */ }
  }
  function loadDraft() {
    var k = dKey(); if (k === draftKey) return;
    storeDraft(); draftKey = k;
    ta.value = drafts[k] || ''; grow(); syncSend();
  }
  function renderAll() {
    closeFind(); thinkEl = null; errEl = null; loadDraft();
    chat.replaceChildren();
    curMsgs().forEach(function (m) { chat.append(msgEl(m, false)); });
    updateHeader(); showSkillbar();
    if (busy && busyChat && busyChat === S.cur) setThinking(true, true);
    showHero(); showLeft();
  }
  function toBottom(smooth) { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

  function hm(ts) { return new Date(ts).toLocaleTimeString(window.I18N ? I18N.locale() : 'ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  // окно в 12 часов закончилось: лимит снова полный
  function refreshLeft() {
    if (!lastLeft || !lastLeft.limit) return;
    var now = Date.now();
    if (lastLeft.full && now > lastLeft.full) { lastLeft.left = lastLeft.limit; lastLeft.reset = lastLeft.full = 0; }
    else if (lastLeft.left <= 0 && lastLeft.reset && now > lastLeft.reset) { lastLeft.left = 1; lastLeft.reset = 0; }
    else return;
    ls.set(KEY_LEFT, JSON.stringify(lastLeft));
  }
  // когда показывать «восстановится в»: при нуле — ближайший слот, иначе полное восстановление
  function backAt() { return !lastLeft ? 0 : (lastLeft.left <= 0 ? lastLeft.reset : lastLeft.full) || 0; }
  function setLeft(j, plan) { lastLeft = { day: dayStr(), left: j.left, limit: j.limit || (lastLeft ? lastLeft.limit : 0) || 0, plan: plan || j.plan || 'free', reset: j.reset || 0, full: j.full || 0 }; ls.set(KEY_LEFT, JSON.stringify(lastLeft)); }
  function showLeft() {
    refreshLeft();
    var el = $('#left');
    if (!lastLeft) { el.hidden = true; return; }
    el.hidden = false;
    var paid = sub && lastLeft.plan && lastLeft.plan !== 'free';
    el.textContent = cap(paid ? 'тариф ' + sub.plan + ': осталось ' : 'сообщений в окне 12 часов: осталось ') + lastLeft.left + (lastLeft.limit ? ' из ' + lastLeft.limit : '') + (backAt() ? ' · восстановится в ' + hm(backAt()) : '');
    el.classList.toggle('warn', lastLeft.left <= 0);
  }

  function setThinking(on, quiet) {
    if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    if (on) {
      thinkEl = h('div', { class: 'msg ai thinking' + (quiet ? '' : ' rise'), role: 'status' }, logo('logo think'), h('span', { text: 'думаю…' }));
      chat.append(thinkEl);
      if (!quiet) toBottom(true);
    }
    showHero();
  }
  function clearError() { if (errEl) { errEl.remove(); errEl = null; } }
  function showError(text, plans) {
    clearError();
    errEl = h('div', { class: 'msg err rise' }, h('p', { text: text }),
      h('div', { class: 'err-btns' },
        h('button', { class: 'btn', type: 'button', onclick: function () { if (!busy) request(); } }, h('span', { text: 'повторить' })),
        plans ? h('button', { class: 'btn solid', type: 'button', onclick: openPlans }, h('span', { text: 'тарифы' })) : null));
    chat.append(errEl);
    toBottom(true);
  }

  /* ---------- листы, уведомления, просмотр фото ---------- */
  var sheet = $('#sheet'), panel = $('#sheet-panel');
  var paneHost = null;   // на компьютере настройки открываются окном с разделами: внутренние экраны рисуются в правой части
  function openSheet(nodes, tall) {
    if (paneHost) {
      paneHost.replaceChildren.apply(paneHost, nodes.filter(function (n) { return n && !(n.classList && n.classList.contains('back')); }));
      paneHost.scrollTop = 0; paneHost.classList.remove('swap'); void paneHost.offsetWidth; paneHost.classList.add('swap'); return;
    }
    panel.classList.remove('swin');
    panel.replaceChildren.apply(panel, nodes.filter(Boolean));
    panel.classList.toggle('tall', !!tall);
    panel.scrollTop = 0;
    sheet.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('show'); }); });
  }
  function closeSheet() {
    paneHost = null;
    sheet.classList.remove('show'); document.body.classList.remove('lock');
    setTimeout(function () { if (!sheet.classList.contains('show')) sheet.hidden = true; }, 540);
  }
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
  // свайп вниз закрывает шторку (телефон)
  (function () {
    var y0 = 0, dy = 0, t0 = 0, on = false, ok = false;
    panel.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || window.innerWidth >= 900) return;
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); on = true; ok = panel.scrollTop <= 0;
    }, { passive: true });
    panel.addEventListener('touchmove', function (e) {
      if (!on) return;
      var d = e.touches[0].clientY - y0;
      if (!ok) { if (panel.scrollTop <= 0 && d > 0) { ok = true; y0 = e.touches[0].clientY; d = 0; } else return; }
      if (d <= 0) { dy = 0; panel.style.transform = ''; return; }
      dy = d; panel.style.transition = 'none'; panel.style.transform = 'translateY(' + d + 'px)';
      sheet.style.opacity = String(Math.max(0, 1 - d / 500));
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    var end = function () {
      if (!on) return; on = false;
      var fast = dy > 40 && (Date.now() - t0) < 250;
      panel.style.transition = ''; sheet.style.opacity = '';
      if (dy > 110 || fast) { closeSheet(); setTimeout(function () { panel.style.transform = ''; }, 600); panel.style.transform = 'translateY(100%)'; }
      else panel.style.transform = '';
      dy = 0;
    };
    panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
  })();
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); closeView(); } });

  var toastTimer = 0;
  function toast(text) {
    var t = $('#toast'); t.textContent = cap(text); t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  var viewEl = null;
  function viewPhoto(src) {
    closeView();
    viewEl = h('div', { class: 'view', role: 'dialog', 'aria-modal': 'true', onclick: closeView },
      h('img', { src: src, alt: 'фото' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'закрыть' }, icon('close')));
    document.body.append(viewEl);
  }
  function closeView() { if (viewEl) { viewEl.remove(); viewEl = null; } }

  // кнопка, которой нужно нажать дважды (для необратимых действий)
  function twice(label, sure, fn, cls) {
    var b = h('button', { class: 'btn block opt' + (cls ? ' ' + cls : ''), type: 'button' }, h('span', { text: label }), icon('trash')), armed = false;
    b.addEventListener('click', function () {
      if (!armed) { armed = true; b.firstChild.textContent = cap(sure); setTimeout(function () { armed = false; b.firstChild.textContent = cap(label); }, 3500); return; }
      fn();
    });
    return b;
  }
  function backLink(fn) { return h('button', { class: 'link back', type: 'button', text: '← Назад', onclick: fn }); }
  function field(tag, attrs) { return h(tag, Object.assign({ class: tag === 'textarea' ? 'area' : 'field', autocomplete: 'off', autocapitalize: 'off' }, attrs)); }
  var byUpdated = function (a, b) { return b.updated - a.updated; };

  /* ---------- чаты, проекты, закрепление ---------- */
  function newChat(projectId) {
    greet = '';
    S.cur = null; S.pendingProject = projectId || null; clearError(); atts = []; renderAtts();
    save(); renderAll(); syncSend(); window.scrollTo(0, 0);
    if (!coarse) ta.focus();
  }
  function openChat(id) { S.cur = id; S.pendingProject = null; save(); renderAll(); requestAnimationFrame(function () { toBottom(false); }); }
  function ensureChat() {
    var c = curChat();
    if (c) return c;
    c = { id: uid(), title: 'новый чат', pinned: false, project: S.pendingProject || null, created: Date.now(), updated: Date.now(), msgs: [] };
    S.chats.unshift(c); S.cur = c.id; S.pendingProject = null;
    return c;
  }
  function deleteChat(c) {
    S.chats = S.chats.filter(function (x) { return x.id !== c.id; }); goneAdd(c.id);
    if (S.cur === c.id) S.cur = null;
    save(); renderAll();
  }

  function chatRow(c) {
    var pr = projectById(c.project);
    var main = h('button', { class: 'row-main', type: 'button', onclick: function () { openChat(c.id); closeSheet(); } },
      h('span', { class: 'row-t', text: c.title, raw: 1 }), h('span', { class: 'row-m', text: (pr ? pr.name + ' · ' : '') + when(c.updated) }));
    var more = h('button', { class: 'row-more', type: 'button', 'aria-label': 'действия' }, icon('more'));
    more.addEventListener('click', function () { chatMenu(c); });
    return h('div', { class: 'row' + (c.id === S.cur ? ' cur' : '') }, c.pinned ? h('span', { class: 'row-pin' }, icon('pin')) : null, main, more);
  }
  function folderRow(p, box) {
    var chats = S.chats.filter(function (c) { return c.project === p.id; }).sort(byUpdated);
    var ch = h('span', { class: 'ch' + (S.open[p.id] ? ' open' : '') }, icon('down'));
    var main = h('button', { class: 'row-main', type: 'button' }, h('span', { class: 'fi' }, icon('folder')),
      h('span', { class: 'row-t', text: p.name }), h('span', { class: 'row-m', text: String(chats.length) }), ch);
    var kids = h('div', { class: 'kids' });
    var fill = function () {
      kids.replaceChildren();
      chats.forEach(function (c) { kids.append(chatRow(c)); });
      if (!chats.length) kids.append(h('p', { class: 'cap', text: 'пока пусто' }));
      kids.append(h('button', { class: 'link', type: 'button', text: '+ новый чат в проекте', onclick: function () { newChat(p.id); closeSheet(); } }));
    };
    main.addEventListener('click', function () {
      S.open[p.id] = !S.open[p.id]; save();
      ch.classList.toggle('open', S.open[p.id]); kids.hidden = !S.open[p.id];
    });
    fill(); kids.hidden = !S.open[p.id];
    var more = h('button', { class: 'row-more', type: 'button', 'aria-label': 'проект' }, icon('more'));
    more.addEventListener('click', function () { projectForm(p); });
    box.append(h('div', { class: 'row folder' }, main, more), kids);
  }

  var wide = function () { return window.matchMedia && matchMedia('(min-width: 900px)').matches; };

  /* ---------- поиск по всему: чаты, проекты, Skills и действия (как командная палитра) ---------- */
  var palEl = null;
  function closeSearch() {
    if (!palEl) return; var p = palEl; palEl = null; p.classList.add('out'); setTimeout(function () { p.remove(); }, 200);
    document.body.classList.remove('lock');
  }
  function openSearch(tabKey) {
    if (palEl) { closeSearch(); return; }
    closeSheet(); closePop();
    var tab = tabKey || 'all', sel = 0, rows = [];
    var input = field('input', { type: 'text', placeholder: 'Поиск', 'aria-label': 'поиск', enterkeyhint: 'search' });
    var list = h('div', { class: 'pal-list' });
    var x = h('button', { class: 'pal-x', type: 'button', 'aria-label': 'закрыть' }, icon('close')); x.addEventListener('click', closeSearch);
    var TABS = [['all', 'Все'], ['chats', 'Чаты'], ['projects', 'Проекты'], ['skills', 'Skills']];
    var tabBox = h('div', { class: 'pal-tabs' }, TABS.map(function (t) {
      var b = h('button', { type: 'button', class: t[0] === tab ? 'on' : '', 'data-k': t[0], text: t[1] }); b.addEventListener('click', function () { tab = t[0]; render(); input.focus(); }); return b;
    }));
    var go = function (fn) { return function () { closeSearch(); setDrawer(false); fn(); }; };
    var hl = function (txt, q) {
      var el = h('span', { class: 'pal-t' }), i = q ? txt.toLowerCase().indexOf(q) : -1;
      if (i < 0) { el.textContent = txt; return el; }
      el.append(txt.slice(0, i), h('mark', { class: 'hl', text: txt.slice(i, i + q.length), raw: 1 }), txt.slice(i + q.length)); return el;
    };
    var snippet = function (c, q) {
      for (var i = 0; i < c.msgs.length; i++) { var t = c.msgs[i].text || '', at = t.toLowerCase().indexOf(q); if (at >= 0) { var a = Math.max(0, at - 24); return (a ? '…' : '') + t.slice(a, a + 70).replace(/\s+/g, ' '); } }
      return '';
    };
    var render = function () {
      var q = input.value.trim().toLowerCase(), groups = [];
      tabBox.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === tab); });
      var chats = S.chats.slice().sort(byUpdated).filter(function (c) { return !q || c.title.toLowerCase().indexOf(q) >= 0 || c.msgs.some(function (m) { return (m.text || '').toLowerCase().indexOf(q) >= 0; }); });
      if (tab === 'all' || tab === 'chats') {
        groups.push([q ? 'Чаты' : 'Недавние', chats.slice(0, q ? 12 : 8).map(function (c) {
          var pr = projectById(c.project), sn = q ? snippet(c, q) : '';
          return { ic: c.pinned ? 'pin' : 'chat', t: c.title, q: q, sub: sn || (pr ? pr.name : ''), run: go(function () { openChat(c.id); }) };
        })]);
      }
      if (tab === 'all' || tab === 'projects') {
        var ps = S.projects.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
        if (ps.length && (q || tab === 'projects')) groups.push(['Проекты', ps.map(function (p) { return { ic: 'folder', t: p.name, q: q, sub: S.chats.filter(function (c) { return c.project === p.id; }).length + ' чатов', run: go(function () { S.open[p.id] = true; newChat(p.id); }) }; })]);
      }
      if (tab === 'all' || tab === 'skills') {
        var ks = skillList().filter(function (k) { return !q || k.cmd.indexOf(q.replace(/^\//, '')) >= 0 || k.name.toLowerCase().indexOf(q) >= 0; });
        if (ks.length && (q || tab === 'skills')) groups.push(['Skills', ks.map(function (k) { return { ic: 'bolt', t: '/' + k.cmd, q: '', sub: k.desc, run: go(function () { ta.value = '/' + k.cmd + ' '; grow(); syncSend(); storeDraft(); ta.focus(); }) }; })]);
      }
      if (tab === 'all') {
        var acts = [['edit', 'Новая сессия', function () { newChat(null); }], ['folder', 'Новый проект', function () { projectForm(null); }], ['bolt', 'Skills', function () { wide() ? openSettingsWin('skills') : openSkills(); }],
          ['brain', 'Память', function () { wide() ? openSettingsWin('memory') : openMemory(); }], ['star', 'Тарифы', function () { wide() ? openSettingsWin('plans') : openPlans(); }], ['gear', 'Настройки', openMenu]]
          .filter(function (a) { return !q || a[1].toLowerCase().indexOf(q) >= 0; }).map(function (a) { return { ic: a[0], t: a[1], q: q, sub: '', run: go(a[2]) }; });
        if (acts.length) groups.push(['Действия', acts]);
      }
      list.replaceChildren(); rows = [];
      groups.forEach(function (g) {
        if (!g[1].length) return;
        list.append(h('p', { class: 'pal-h', text: g[0] }));
        g[1].forEach(function (it) {
          var idx = rows.length, r = h('button', { class: 'pal-r', type: 'button', style: idx < 9 ? 'animation-delay:' + (idx * 22) + 'ms' : '' }, icon(it.ic), h('span', { class: 'pal-m' }, hl(it.t, it.q), it.sub ? h('em', { text: it.sub, raw: 1 }) : null), h('span', { class: 'pal-go' }, icon('chev')));
          r.addEventListener('click', it.run); r.addEventListener('pointermove', function () { if (sel !== idx) { sel = idx; mark(); } });
          rows.push(r); list.append(r);
        });
      });
      if (!rows.length) list.append(h('p', { class: 'pal-empty', text: 'Ничего не нашлось' }));
      sel = 0; mark();
    };
    var mark = function () { rows.forEach(function (r, i) { r.classList.toggle('sel', i === sel); }); if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' }); };
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (rows.length) { sel = (sel + 1) % rows.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (rows.length) { sel = (sel - 1 + rows.length) % rows.length; mark(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) rows[sel].click(); }
      else if (e.key === 'Tab') { e.preventDefault(); var i = TABS.map(function (t) { return t[0]; }).indexOf(tab); tab = TABS[(i + (e.shiftKey ? 3 : 1)) % 4][0]; render(); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
    });
    var hint = function (k, t) { return h('span', { class: 'pal-hint' }, h('i', { text: t }), h('kbd', { text: k })); };
    palEl = h('div', { class: 'pal' }, h('div', { class: 'pal-box' },
      h('div', { class: 'pal-top' }, input, x), tabBox, list,
      h('div', { class: 'pal-foot' }, hint('Esc', 'Закрыть'), hint('↑ ↓', 'Выбрать'), hint('Enter', 'Открыть'), hint('Tab', 'Сменить тип'))));
    palEl.addEventListener('pointerdown', function (e) { if (e.target === palEl) closeSearch(); });
    document.body.append(palEl); document.body.classList.add('lock');
    render(); setTimeout(function () { input.focus(); }, 30);
  }
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openSearch(); } });

  var sideUI = null;
  function refreshSide() { if (sideUI) sideUI.fill(); }
  // после действия над чатом: на телефоне вернуться к списку, на компьютере закрыть окно (список слева уже виден)
  function listsHome() { closeSheet(); refreshSide(); }

  function listUI() {
    var list = h('div', { class: 'stack' });
    var input = field('input', { type: 'search', placeholder: 'поиск по чатам', 'aria-label': 'поиск', enterkeyhint: 'search' });
    var fill = function () {
      var q = input.value.trim().toLowerCase();
      list.replaceChildren();
      if (q) {
        var found = S.chats.filter(function (c) { return c.title.toLowerCase().indexOf(q) >= 0 || c.msgs.some(function (m) { return m.text.toLowerCase().indexOf(q) >= 0; }); }).sort(byUpdated);
        list.append(h('p', { class: 'label sect', text: 'найдено: ' + found.length }));
        found.forEach(function (c) { list.append(chatRow(c)); });
        return;
      }
      var pinned = S.chats.filter(function (c) { return c.pinned; }).sort(byUpdated);
      if (pinned.length) { list.append(h('p', { class: 'label sect', text: 'закреплённые' })); pinned.forEach(function (c) { list.append(chatRow(c)); }); }
      list.append(h('p', { class: 'label sect', text: 'проекты' }));
      if (!S.projects.length) list.append(h('p', { class: 'cap', text: 'проект это папка для чатов с общим контекстом: например «работа» или «учёба».' }));
      S.projects.slice().sort(function (a, b) { return b.created - a.created; }).forEach(function (p) { folderRow(p, list); });
      var rest = S.chats.filter(function (c) { return !c.pinned && !c.project; }).sort(byUpdated);
      list.append(h('p', { class: 'label sect', text: 'чаты' }));
      if (!rest.length) list.append(h('p', { class: 'cap', text: S.chats.length ? 'остальные чаты лежат в проектах или закреплены' : 'пока нет чатов. напиши первый вопрос.' }));
      rest.forEach(function (c) { list.append(chatRow(c)); });
    };
    input.addEventListener('input', fill);
    fill();
    return {
      input: input, fill: fill, list: list,
      top: h('div', { class: 'two' },
        h('button', { class: 'btn solid', type: 'button', text: 'новый чат', onclick: function () { newChat(null); closeSheet(); } }),
        h('button', { class: 'btn', type: 'button', text: 'новый проект', onclick: function () { projectForm(null); } })),
      search: h('div', { class: 'searchbox' }, input)
    };
  }
  function openChats() { if (wide()) { if (sideUI) sideUI.show(); } else setDrawer(true); }
  // постоянная панель слева на широком экране (на телефоне это выезжающая панель): плоский список как в claude

  /* ---------- выезжающая панель на телефоне ---------- */
  var scrimEl = h('div', { class: 'scrim' });
  document.body.append(scrimEl);
  function setDrawer(open) {
    var side = $('#side');
    side.classList.remove('drag'); scrimEl.classList.remove('drag');
    side.style.transform = ''; side.style.visibility = ''; scrimEl.style.opacity = '';
    side.classList.toggle('open', !!open && !wide()); scrimEl.classList.toggle('show', !!open && !wide());
  }
  scrimEl.addEventListener('click', function () { setDrawer(false); });
  (function swipe() {
    var side = $('#side'), x0 = 0, y0 = 0, t0 = 0, start = null, mode = null, last = 0, W = 320;
    var clamp = function (v) { return Math.max(0, Math.min(W, v)); };
    document.addEventListener('touchstart', function (e) {
      mode = null; start = null;
      if (wide() || e.touches.length > 1 || !sheet.hidden) return;
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); W = side.offsetWidth || 320;
      if (side.classList.contains('open')) start = 'close';
      else if (!e.target.closest || !e.target.closest('pre, table, .blk, textarea, input, .atts, .pics')) start = 'open';
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!start) return;
      var t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (!mode) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (start === 'open' && dx > 0) mode = 'open'; else if (start === 'close' && dx < 0) mode = 'close'; else { start = null; return; }
          side.classList.add('drag'); scrimEl.classList.add('drag'); scrimEl.classList.add('show');
        } else return;
      }
      last = clamp(mode === 'open' ? dx : W + dx);
      side.style.visibility = 'visible'; side.style.transform = 'translateX(' + (last - W) + 'px)'; scrimEl.style.opacity = String(last / W);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    var end = function () {
      if (!mode) return;
      var fast = Date.now() - t0 < 280, dir = mode;
      var open = fast ? dir === 'open' : last > W * 0.45;
      mode = null; start = null; setDrawer(open);
    };
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  })();

  var ordCmp = function (fb) { return function (a, b) { var x = a.ord != null, y = b.ord != null; if (x && y) return a.ord - b.ord; if (x) return 1; if (y) return -1; return fb(a, b); }; };
  var SORTS = [['upd', 'Последняя активность'], ['new', 'Дата создания'], ['abc', 'По алфавиту']];
  var sortMode = function () { var m = S.settings.sort; return SORTS.some(function (s) { return s[0] === m; }) ? m : 'upd'; };
  var sortCmp = function (a, b) { var m = sortMode(); if (m === 'new') return b.created - a.created; if (m === 'abc') return String(a.title).localeCompare(String(b.title), 'ru'); return b.updated - a.updated; };
  var bySide = ordCmp(sortCmp), byProj = ordCmp(function (a, b) { return b.created - a.created; });
  function buildSide() {
    var side = $('#side');
    var input = field('input', { type: 'search', placeholder: 'поиск по чатам', 'aria-label': 'поиск', enterkeyhint: 'search' });
    var searchBox = h('div', { class: 'ssearch' }, input); searchBox.hidden = true;
    var body = h('div', { class: 'sbody' });
    var foot = h('div', { class: 'sfoot' });
    var nav = function (ic, label, fn, cls) {
      var b = h('button', { class: 'snav' + (cls ? ' ' + cls : ''), type: 'button' }, icon(ic), h('span', { text: label })); b.addEventListener('click', fn); return b;
    };
    var showSearch = function () { setDrawer(false); openSearch(); };
    var srow = function (c, pin) {
      var more = h('button', { class: 'srow-more', type: 'button', 'aria-label': 'действия' }, icon('more'));
      more.addEventListener('click', function (e) { e.stopPropagation(); chatMenu(c); });
      var main = h('button', { class: 'srow-main', type: 'button', title: c.title }, pin ? icon('chat') : null, h('span', { text: c.title, raw: 1 }));
      main.addEventListener('click', function () { openChat(c.id); closeSheet(); setDrawer(false); });
      var rw = h('div', { class: 'srow' + (c.id === S.cur ? ' cur' : ''), 'data-id': c.id }, main, more); return rw;
    };
    var sortTool = function () {
      var b = h('button', { class: 'stool', type: 'button', 'aria-label': 'сортировка', title: 'Сортировка' }, icon('sort'));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var old = document.querySelector('.smenu'); if (old) { old.remove(); return; }
        var m = h('div', { class: 'smenu' }, h('p', { class: 'smt', text: 'Сортировка' }));
        SORTS.forEach(function (s) {
          var o = h('button', { class: 'smo' + (sortMode() === s[0] ? ' on' : ''), type: 'button' }, h('span', { text: s[1] }), sortMode() === s[0] ? icon('check') : null);
          o.addEventListener('click', function (ev) { ev.stopPropagation(); S.settings.sort = s[0]; save(); m.remove(); fill(); });
          m.append(o);
        });
        var r = b.getBoundingClientRect(), sr = $('#side').getBoundingClientRect();
        m.style.top = (r.bottom - sr.top + 6) + 'px'; m.style.right = Math.max(8, sr.right - r.right) + 'px';
        $('#side').append(m);
        setTimeout(function () { document.addEventListener('click', function f() { m.remove(); document.removeEventListener('click', f); }); }, 0);
      });
      return b;
    };
    var section = function (key, label, items, tool) {
      var off = !!S.open['s-' + key];
      var head = h('button', { class: 'shead', type: 'button' }, h('span', { text: label }), h('span', { class: 'ch' + (off ? '' : ' open') }, icon('down')));
      var box = h('div', { class: 'sitems', 'data-zone': key }); box.hidden = off;
      items.forEach(function (n) { box.append(n); });
      head.addEventListener('click', function () {
        S.open['s-' + key] = !S.open['s-' + key]; save();
        box.hidden = !!S.open['s-' + key]; head.lastChild.classList.toggle('open', !S.open['s-' + key]);
      });
      return [tool ? h('div', { class: 'shrow' }, head, tool) : head, box];
    };
    var fill = function () {
      var q = input.value.trim().toLowerCase();
      body.replaceChildren();
      var add = function (pair) { pair.forEach(function (n) { body.append(n); }); };
      if (q) {
        var found = S.chats.filter(function (c) { return c.title.toLowerCase().indexOf(q) >= 0 || c.msgs.some(function (m) { return m.text.toLowerCase().indexOf(q) >= 0; }); }).sort(byUpdated);
        var box = h('div', { class: 'sitems' }, h('p', { class: 'shead static', text: 'найдено: ' + found.length }));
        found.forEach(function (c) { box.append(srow(c, false)); });
        body.append(box);
      } else {
        var pinned = S.chats.filter(function (c) { return c.pinned; }).sort(bySide);
        if (pinned.length) add(section('pin', 'закреплённые', pinned.map(function (c) { return srow(c, true); })));
        var projs = S.projects.slice().sort(byProj).map(function (p) {
          var chats = S.chats.filter(function (c) { return c.project === p.id; }).sort(bySide);
          var kids = h('div', { class: 'skids', 'data-zone': 'p:' + p.id }); kids.hidden = !S.open[p.id];
          chats.forEach(function (c) { kids.append(srow(c, false)); });
          kids.append(h('button', { class: 'snew', type: 'button', text: '+ чат в проекте', onclick: function () { newChat(p.id); closeSheet(); setDrawer(false); } }));
          var ch = h('span', { class: 'ch' + (S.open[p.id] ? ' open' : '') }, icon('down'));
          var main = h('button', { class: 'srow-main', type: 'button' }, icon('folder'), h('span', { text: p.name, raw: 1 }), ch);
          main.addEventListener('click', function () { S.open[p.id] = !S.open[p.id]; save(); kids.hidden = !S.open[p.id]; ch.classList.toggle('open', !!S.open[p.id]); });
          var more = h('button', { class: 'srow-more', type: 'button', 'aria-label': 'проект' }, icon('more'));
          more.addEventListener('click', function (e) { e.stopPropagation(); projectForm(p); });
          return h('div', { class: 'sproj', 'data-pid': p.id }, h('div', { class: 'srow', 'data-pid': p.id }, main, more), kids);
        });
        if (projs.length) add(section('proj', 'проекты', projs));
        var rest = S.chats.filter(function (c) { return !c.pinned && !c.project; }).sort(bySide);
        if (rest.length || (projs.length && S.chats.length)) add(section('rec', 'недавние', rest.map(function (c) { return srow(c, false); }), sortTool()));
        else if (!S.chats.length) body.append(h('p', { class: 'cap', text: 'пока нет чатов. напиши первый вопрос.' }));
      }
      var nm = (S.settings.name || '').trim();
      var prof = h('button', { class: 'sprof', type: 'button', 'aria-label': 'профиль' },
        avEl(),
        h('span', { class: 'sid' }, h('b', { text: (acct && acct.user && (nm || acct.user.login)) || nm || 'DDX AI', raw: 1 }), h('em', { text: (sub ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Free') + (acct ? ' · аккаунт' : ''), raw: 1 })),
        h('span', { class: 'schev' }, icon('down')));
      prof.addEventListener('click', function (e) { e.stopPropagation(); openProfile(); });
      foot.replaceChildren(prof,
        h('button', { class: 'spill', type: 'button', onclick: function () { newChat(null); closeSheet(); setDrawer(false); } }, icon('plus'), h('span', { text: 'новый чат' })));
    };
    // перетаскивание мышью: чаты меняют порядок и переезжают между списками и проектами, проекты меняют порядок
    (function () {
      var drag = null, ghost = null, tgt = null, swallow = false;
      var clear = function () { body.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-zone').forEach(function (n) { n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-zone'); }); };
      var chatOf = function (id) { return S.chats.filter(function (c) { return c.id === id; })[0]; };
      var stop = function () {
        clearTimeout(drag && drag.timer);
        if (ghost) ghost.remove(); ghost = null; clear();
        if (drag && drag.row) drag.row.classList.remove('dragging');
        document.body.classList.remove('sdrag'); drag = null; tgt = null;
      };
      var start = function () {
        drag.on = true; ghost = drag.row.cloneNode(true); ghost.classList.add('sghost'); ghost.style.width = drag.row.offsetWidth + 'px';
        document.body.append(ghost); drag.row.classList.add('dragging'); document.body.classList.add('sdrag');
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* без вибрации */ } }
      };
      body.addEventListener('pointerdown', function (e) {
        if (e.button > 0 || input.value.trim()) return;
        var row = e.target.closest && e.target.closest('.srow[data-id], .srow[data-pid]');
        if (!row || e.target.closest('.srow-more')) return;
        drag = { row: row, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType === 'touch', kind: row.getAttribute('data-id') ? 'chat' : 'proj', timer: 0 };
        if (drag.touch) drag.timer = setTimeout(function () { if (drag && !drag.on) start(); }, 380);
      });
      window.addEventListener('pointermove', function (e) {
        if (!drag) return;
        if (!drag.on) {
          var d = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
          if (drag.touch) { if (d > 9) stop(); } else if (d > 6) start();
          if (!drag || !drag.on) return;
        }
        ghost.style.left = (e.clientX - 24) + 'px'; ghost.style.top = (e.clientY - 20) + 'px';
        var br = body.getBoundingClientRect();
        if (e.clientY < br.top + 44) body.scrollTop -= 9; else if (e.clientY > br.bottom - 44) body.scrollTop += 9;
        clear(); tgt = null;
        var el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return;
        if (drag.kind === 'chat') {
          var r = el.closest('.srow[data-id]');
          if (r && r !== drag.row) { var rc = r.getBoundingClientRect(), bf = e.clientY < rc.top + rc.height / 2; r.classList.add(bf ? 'drop-before' : 'drop-after'); tgt = { t: 'row', row: r, before: bf }; return; }
          var ph = el.closest('.srow[data-pid]');
          if (ph) { ph.classList.add('drop-into'); tgt = { t: 'zone', zone: 'p:' + ph.getAttribute('data-pid') }; return; }
          var z = el.closest('[data-zone]');
          if (z) { z.classList.add('drop-zone'); tgt = { t: 'zone', zone: z.getAttribute('data-zone') }; }
        } else {
          var pr = el.closest('.sproj');
          if (pr && pr !== drag.row.parentNode) { var pc = pr.firstChild.getBoundingClientRect(), pb = e.clientY < pc.top + pc.height / 2; pr.firstChild.classList.add(pb ? 'drop-before' : 'drop-after'); tgt = { t: 'proj', el: pr, before: pb }; }
        }
      });
      var finish = function () {
        if (!drag) return;
        var on = drag.on, t = tgt, d = drag;
        if (on) { swallow = true; setTimeout(function () { swallow = false; }, 60); }
        stop();
        if (!on || !t) return;
        var changed = false;
        if (d.kind === 'chat') {
          var c = chatOf(d.row.getAttribute('data-id')); if (!c) return;
          var zone = t.t === 'row' ? t.row.parentNode.getAttribute('data-zone') : t.zone;
          if (!zone) return;
          var ids = t.t === 'row' ? Array.prototype.map.call(t.row.parentNode.querySelectorAll('.srow[data-id]'), function (n) { return n.getAttribute('data-id'); }) : (function () { var zn = body.querySelector('[data-zone="' + zone + '"]'); return zn ? Array.prototype.map.call(zn.querySelectorAll('.srow[data-id]'), function (n) { return n.getAttribute('data-id'); }) : []; })();
          ids = ids.filter(function (x) { return x !== c.id; });
          if (zone === 'pin' && !c.pinned && S.chats.filter(function (x) { return x.pinned; }).length >= lim().pins) { limitToast('На тарифе ' + planWord() + ' можно закрепить до ' + lim().pins + ' чатов'); return; }
          if (zone === 'pin') c.pinned = true;
          else if (zone === 'rec') { c.pinned = false; c.project = null; }
          else if (zone.indexOf('p:') === 0) { c.pinned = false; c.project = zone.slice(2); S.open[c.project] = true; }
          var at = t.t === 'row' ? ids.indexOf(t.row.getAttribute('data-id')) + (t.before ? 0 : 1) : ids.length;
          ids.splice(at, 0, c.id);
          ids.forEach(function (id, i) { var x = chatOf(id); if (x) x.ord = i; });
          changed = true;
        } else if (t.t === 'proj') {
          var pid = d.row.getAttribute('data-pid'), list = Array.prototype.map.call(body.querySelectorAll('.sproj'), function (n) { return n.getAttribute('data-pid'); }).filter(function (x) { return x !== pid; });
          list.splice(list.indexOf(t.el.getAttribute('data-pid')) + (t.before ? 0 : 1), 0, pid);
          list.forEach(function (id, i) { var p = projectById(id); if (p) p.ord = i; });
          changed = true;
        }
        if (changed) { save(); fill(); body.classList.add('reflow'); setTimeout(function () { body.classList.remove('reflow'); }, 450); }
      };
      window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', stop);
      document.addEventListener('click', function (e) { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
      document.addEventListener('touchmove', function (e) { if (drag && drag.on && e.cancelable) e.preventDefault(); }, { passive: false });
    })();
    input.addEventListener('input', fill);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; searchBox.hidden = true; fill(); } });
    side.append(
      h('div', { class: 'side-brand' }, logo('logo'), h('span', { text: 'DDX AI' }),
        h('button', { class: 'ssearch-btn', type: 'button', 'aria-label': 'поиск', onclick: showSearch }, icon('search'))),
      h('div', { class: 'snavs' },
        nav('plus', 'новый чат', function () { newChat(null); closeSheet(); setDrawer(false); }, 'snav-new'),
        nav('search', 'поиск', showSearch, 'snav-search'),
        nav('folder', 'новый проект', function () { setDrawer(false); projectForm(null); }),
        nav('user', 'персонализация', function () { setDrawer(false); openPersonal(); }),
        nav('star', 'тарифы', function () { setDrawer(false); openPlans(); })),
      searchBox, body, foot);
    sideUI = { input: input, fill: fill, show: showSearch };
  }

  /* ---------- экспорт, «поделиться», поиск в чате ---------- */
  function chatText(c) {
    return '# ' + c.title + '\n\n' + c.msgs.map(function (m) {
      return (m.role === 'user' ? '**я:** ' : '**DDX AI:** ') + (m.files && m.files.length ? '[файл: ' + m.files.map(function (f) { return f.name; }).join(', ') + '] ' : '') + (m.thumbs && m.thumbs.length ? '[фото] ' : '') + m.text;
    }).join('\n\n');
  }
  function shareText(text, title) {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) { navigator.share({ title: title || 'DDX AI', text: text }).catch(function () { /* отменили */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('скопировал: поделиться можно вставкой'); }, function () { toast('не получилось поделиться'); });
    else toast('поделиться тут нельзя');
  }
  function exportChat(c) {
    var name = (c.title || 'чат').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50) + '.md';
    saveFile(name, chatText(c), 'text/markdown');
  }

  var findBar = null, marks = [], markAt = 0;
  function clearMarks() {
    marks.forEach(function (mk) { var p = mk.parentNode; if (!p) return; p.replaceChild(document.createTextNode(mk.textContent), mk); p.normalize(); });
    marks = []; markAt = 0;
  }
  function closeFind() { clearMarks(); if (findBar) { findBar.remove(); findBar = null; } }
  function openFind() {
    if (findBar) { findBar.querySelector('input').focus(); return; }
    var inp = field('input', { type: 'search', placeholder: 'найти в чате', 'aria-label': 'найти в чате', enterkeyhint: 'search' });
    var cnt = h('span', { class: 'fcnt', text: '' });
    var go = function (d) {
      if (!marks.length) return;
      marks[markAt].classList.remove('cur'); markAt = (markAt + d + marks.length) % marks.length;
      marks[markAt].classList.add('cur'); marks[markAt].scrollIntoView({ block: 'center', behavior: 'smooth' }); cnt.textContent = (markAt + 1) + ' из ' + marks.length;
    };
    var run = function () {
      clearMarks();
      var q = inp.value.trim().toLowerCase();
      if (q.length < 2) { cnt.textContent = ''; return; }
      chat.querySelectorAll('.msg:not(.err)').forEach(function (box) {
        var w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null), nodes = [], n;
        while ((n = w.nextNode())) nodes.push(n);
        nodes.forEach(function (node) {
          var low = node.nodeValue.toLowerCase(), at = low.indexOf(q), pos = 0, cur = node, parts = [];
          if (at < 0) return;
          if (node.parentNode.closest && node.parentNode.closest('.msg-actions, .bhead, .medit')) return;
          while (at >= 0) { parts.push([at, at + q.length]); at = low.indexOf(q, at + q.length); }
          for (var i = parts.length - 1; i >= 0; i--) {
            var tail = cur.splitText(parts[i][0]); tail.splitText(q.length);
            var mk = h('mark', { class: 'hl' }); tail.parentNode.replaceChild(mk, tail); mk.append(tail);
            marks.unshift(mk);
          }
          pos = 0;
        });
      });
      if (!marks.length) { cnt.textContent = 'Нет совпадений'; return; }
      markAt = marks.length - 1; go(1);
    };
    var btn = function (ic, label, fn) { var b = h('button', { class: 'fbtn', type: 'button', 'aria-label': label }, icon(ic)); b.addEventListener('click', fn); return b; };
    findBar = h('div', { class: 'findbar' }, inp, cnt, btn('up', 'предыдущее', function () { go(-1); }), btn('down', 'следующее', function () { go(1); }), btn('close', 'закрыть', closeFind));
    inp.addEventListener('input', run);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.stopPropagation(); closeFind(); } });
    document.querySelector('.bar').append(findBar);
    inp.focus();
  }

  function chatMenu(c) {
    var opt = function (label, ic, fn) { var b = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: label }), icon(ic)); b.addEventListener('click', fn); return b; };
    var pr = projectById(c.project);
    openSheet([
      backLink(function () { listsHome(); }),
      h('h2', { text: c.title }),
      h('p', { class: 'cap', text: (pr ? 'проект «' + pr.name + '» · ' : '') + c.msgs.length + ' сообщ.' }),
      h('div', { class: 'form' },
        opt(c.pinned ? 'открепить' : 'закрепить', 'pin', function () { togglePin(c); listsHome(); }),
        opt('переименовать', 'edit', function () { renameChat(c); }),
        opt(pr ? 'перенести в другой проект' : 'в проект', 'folder', function () { moveChat(c); }),
        opt('экспорт в файл', 'file', function () { exportChat(c); }),
        opt('поделиться чатом', 'share', function () { shareText(chatText(c), c.title); }),
        twice('удалить чат', 'точно удалить? нажми ещё раз', function () { deleteChat(c); listsHome(); }, 'danger'))
    ]);
  }
  function renameChat(c) {
    var inp = field('input', { type: 'text', maxlength: '60', value: c.title, 'aria-label': 'название чата' });
    var ok = function () { var t = inp.value.trim(); if (t) { c.title = t.slice(0, 60); save(); updateHeader(); } listsHome(); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
    openSheet([backLink(function () { chatMenu(c); }), h('h2', { text: 'название' }),
      h('div', { class: 'form' }, inp, h('button', { class: 'btn solid block', type: 'button', text: 'сохранить', onclick: ok }))]);
  }
  function moveChat(c) {
    var box = h('div', { class: 'form' });
    var put = function (label, id) {
      var on = (c.project || null) === id;
      var b = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: label }), on ? icon('check') : icon(id ? 'folder' : 'list'));
      b.addEventListener('click', function () { c.project = id; save(); updateHeader(); listsHome(); });
      box.append(b);
    };
    put('без проекта', null);
    S.projects.forEach(function (p) { put(p.name, p.id); });
    box.append(h('button', { class: 'btn block ghost', type: 'button', text: '+ новый проект', onclick: function () { projectForm(null, c); } }));
    openSheet([backLink(function () { chatMenu(c); }), h('h2', { text: 'в проект' }), box]);
  }
  // p: существующий проект или null (создание); moveIn: чат, который сразу положить в новый проект
  function projectForm(p, moveIn) {
    if (!p && S.projects.length >= lim().projects) { limitToast('На тарифе ' + planWord() + ' можно создать до ' + lim().projects + ' проектов'); return; }
    var name = field('input', { type: 'text', maxlength: '40', placeholder: 'название проекта', value: p ? p.name : '', 'aria-label': 'название проекта' });
    var instr = field('textarea', { rows: '5', maxlength: '800', placeholder: 'о чём проект и как отвечать в нём. например: «готовлюсь к экзамену по трудовому праву, объясняй с примерами»', 'aria-label': 'контекст проекта' });
    instr.value = p ? p.instructions : '';
    var ok = function () {
      var n = name.value.trim(); if (!n) { name.focus(); return; }
      if (p) { p.name = n.slice(0, 40); p.instructions = instr.value.trim(); }
      else { p = { id: uid(), name: n.slice(0, 40), instructions: instr.value.trim(), created: Date.now() }; S.projects.push(p); S.open[p.id] = true; if (moveIn) moveIn.project = p.id; }
      save(); updateHeader(); listsHome();
    };
    var nodes = [backLink(function () { listsHome(); }), h('h2', { text: p ? 'проект' : 'новый проект' }),
      h('div', { class: 'form' }, name, instr,
        h('p', { class: 'cap', text: 'этот текст добавляется к каждому чату проекта, чтобы ии помнил контекст.' }),
        h('button', { class: 'btn solid block', type: 'button', text: 'сохранить', onclick: ok }))];
    if (p) nodes[2].append(twice('удалить проект', 'точно удалить? чаты останутся', function () {
      S.chats.forEach(function (c) { if (c.project === p.id) c.project = null; });
      S.projects = S.projects.filter(function (x) { return x.id !== p.id; }); goneAdd(p.id); save(); updateHeader(); listsHome();
    }, 'danger'));
    openSheet(nodes);
  }

  /* ---------- персонализация и настройки ---------- */
  var STYLES = [['short', 'коротко'], ['normal', 'обычно'], ['long', 'подробно']];
  // варианты ответов: [значение, подпись, что сказать ИИ]
  var PERS = [
    ['style', 'Длина ответов', [['short', 'Коротко', 'Отвечай максимально коротко.'], ['normal', 'Обычно', ''], ['long', 'Подробно', 'Отвечай подробно, с пояснениями и примерами.']]],
    ['tone', 'Тон', [['', 'Авто', ''], ['friendly', 'Дружелюбный', 'Тон: дружелюбный и тёплый.'], ['business', 'Деловой', 'Тон: деловой, без лишней болтовни.'], ['humor', 'С юмором', 'Тон: живой, с лёгким юмором.'], ['strict', 'Строгий', 'Тон: строгий и точный, без вольностей.']]],
    ['level', 'Уровень объяснений', [['', 'Авто', ''], ['simple', 'Попроще', 'Объясняй простыми словами, как новичку, без сложных терминов.'], ['pro', 'Для профи', 'Пользователь разбирается в теме: можно использовать термины и не разжёвывать основы.']]],
    ['address', 'Обращение', [['', 'Авто', ''], ['ty', 'На «ты»', 'Обращайся к пользователю на «ты».'], ['vy', 'На «вы»', 'Обращайся к пользователю на «вы».']]],
    ['lang', 'Язык ответов', [['', 'Как в вопросе', ''], ['ru', 'Русский', 'Всегда отвечай на русском.'], ['kk', 'Қазақша', 'Всегда отвечай на казахском языке.'], ['en', 'English', 'Always reply in English.']]],
    ['format', 'Оформление', [['', 'Авто', ''], ['plain', 'Простой текст', 'Пиши простым текстом без заголовков и таблиц.'], ['rich', 'Со структурой', 'Структурируй ответы: заголовки, списки и таблицы там, где это помогает.']]],
    ['emoji', 'Эмодзи', [['', 'Авто', ''], ['none', 'Не нужны', 'Не используй эмодзи.'], ['some', 'Иногда', 'Эмодзи изредка уместны.'], ['lots', 'Чаще', 'Используй эмодзи охотно.']]]
  ];
  function openPersonal() {
    if (wide() && !paneHost) { openSettingsWin('pers'); return; }
    var st = S.settings, pick = {};
    PERS.forEach(function (g) { pick[g[0]] = st[g[0]] != null ? st[g[0]] : (g[0] === 'style' ? 'normal' : ''); });
    var name = field('input', { type: 'text', maxlength: '40', placeholder: 'Как к тебе обращаться', value: st.name || '', 'aria-label': 'имя' });
    var role = field('input', { type: 'text', maxlength: '80', placeholder: 'Кто ты: студент, юрист, дизайнер…', value: st.role || '', 'aria-label': 'чем занимаешься' });
    var about = field('textarea', { rows: '3', maxlength: '500', placeholder: 'Что интересно, что важно знать обо мне', 'aria-label': 'о тебе' });
    var extra = field('textarea', { rows: '4', maxlength: '600', placeholder: 'Свои правила: например «без воды», «примеры из жизни», «в конце давай короткий итог»', 'aria-label': 'свои инструкции' });
    about.value = st.about || ''; extra.value = st.extra || '';
    var blocks = PERS.map(function (g) {
      var row = h('div', { class: 'pills' }, g[2].map(function (o) {
        var b = h('button', { type: 'button', class: 'pill' + (pick[g[0]] === o[0] ? ' on' : ''), text: o[1], raw: 1 });
        b.addEventListener('click', function () { pick[g[0]] = o[0]; row.querySelectorAll('.pill').forEach(function (x) { x.classList.toggle('on', x === b); }); });
        return b;
      }));
      return h('div', { class: 'pgroup' }, h('p', { class: 'label', text: g[1] }), row);
    });
    var ok = function () {
      var next = { name: name.value.trim(), role: role.value.trim(), about: about.value.trim(), extra: extra.value.trim() };
      PERS.forEach(function (g) { next[g[0]] = pick[g[0]]; });
      S.settings = Object.assign({}, S.settings, next);
      save(); closeSheet(); toast('Сохранено');
    };
    var reset = twice('Сбросить настройки', 'Точно сбросить? Нажми ещё раз', function () {
      var keep = { memOn: S.settings.memOn, memory: S.settings.memory };
      S.settings = Object.assign({ name: '', about: '', style: 'normal', extra: '' }, keep); save(); closeSheet(); toast('Сброшено');
    }, 'danger');
    openSheet([
      h('div', { class: 'shead2' }, (function () { var x = h('button', { class: 'round-x', type: 'button', 'aria-label': 'назад' }, icon('close')); x.addEventListener('click', function () { if (wide()) closeSheet(); else openMenu(); }); return x; })(), h('h2', { text: 'Персонализация' }), h('span', { class: 'sp' })),
      h('p', { class: 'cap', text: 'ИИ учитывает это во всех чатах. Хранится только на твоём устройстве и отправляется вместе с вопросом.' }),
      h('p', { class: 'glabel', text: 'Обо мне' }),
      h('div', { class: 'form' }, name, role, about),
      h('p', { class: 'glabel', text: 'Как отвечать' }),
      h('div', { class: 'group pad pgroups' }, blocks),
      h('p', { class: 'glabel', text: 'Свои правила' }),
      h('div', { class: 'form' }, extra),
      h('button', { class: 'btn solid block', type: 'button', text: 'Сохранить', onclick: ok }),
      reset
    ], true);
  }
  // поиск по прошлым чатам: берём пару чатов, где встречаются слова из последнего вопроса
  function pastChatsNote(c) {
    var last = null; (c.msgs || []).forEach(function (m) { if (m.role === 'user') last = m; });
    var words = ((last && last.text || '').toLowerCase().match(/[\p{L}\d]{5,}/gu) || []).slice(0, 8);
    if (!words.length) return '';
    var hits = [];
    S.chats.forEach(function (o) {
      if (o.id === c.id) return;
      var best = null, score = 0;
      o.msgs.slice(-12).forEach(function (m) { var t = (m.text || '').toLowerCase(), s = 0; words.forEach(function (w) { if (t.indexOf(w.slice(0, -1)) >= 0) s++; }); if (s > score) { score = s; best = m; } });
      if (score) hits.push({ s: score, t: o.title, x: String(best.text).replace(/\s+/g, ' ').slice(0, 110) });
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    return hits.length ? 'Из прошлых чатов пользователя (используй, только если уместно): ' + hits.slice(0, 3).map(function (x) { return '«' + x.t + '»: ' + x.x; }).join(' | ').slice(0, 420) : '';
  }
  function buildInstructions(c, extra) {
    var st = S.settings, out = [];
    if (st.name) out.push('Пользователя зовут ' + st.name + '.');
    if (st.role) out.push('Чем занимается пользователь: ' + st.role + '.');
    if (st.about) out.push('О пользователе: ' + st.about);
    PERS.forEach(function (g) {
      var v = st[g[0]] != null ? st[g[0]] : (g[0] === 'style' ? 'normal' : '');
      g[2].forEach(function (o) { if (o[0] === v && o[2]) out.push(o[2]); });
    });
    if (st.extra) out.push('Пожелания пользователя к ответам: ' + st.extra);
    if (st.lang && st.lang !== 'auto' && langOf(st.lang)) out.push('Всегда отвечай на языке: ' + langOf(st.lang)[2] + '.');
    if (st.chatSearch && c) { var pc = pastChatsNote(c); if (pc) out.push(pc); }
    if (st.memOn !== false && st.memory && st.memory.length) out.push('Память о пользователе (учитывай, но не упоминай без повода): ' + st.memory.join('; ').slice(0, 700));
    var pr = projectById(c ? c.project : null);
    if (pr) out.push('Этот чат лежит в проекте «' + pr.name + '».' + (pr.instructions ? ' Контекст и правила проекта: ' + pr.instructions : ''));
    var tail = '\nНе используй latex и знаки доллара для формул: пиши математику обычным текстом и символами (², √, ·, ×, ≤, дроби через /). Ты ассистент DDX AI. Не называй, кто тебя создал и обучил, какая за тобой модель, компания или провайдер. На такие вопросы отвечай, что ты ассистент DDX AI и подробностей об устройстве не раскрываешь.';
    tail += extra || '';
    return out.join('\n').slice(0, 1990 - tail.length) + tail;
  }


  /* ---------- тарифы ---------- */
  // что даёт каждый тариф (сообщения считает воркер, остальное проверяет приложение)
  var LIMITS = {
    free: { photos: 2, files: 1, chars: 6000, projects: 2, pins: 3, memory: 15, skills: 2 },
    pro: { photos: 3, files: 2, chars: 10000, projects: 10, pins: 10, memory: 45, skills: 8 },
    max: { photos: 4, files: 3, chars: 15000, projects: 1e9, pins: 1e9, memory: 90, skills: 1e9 },
    ultra: { photos: 4, files: 3, chars: 15000, projects: 1e9, pins: 1e9, memory: 90, skills: 1e9 }
  };
  function lim() { return LIMITS[sub && LIMITS[sub.plan] ? sub.plan : 'free']; }
  function planWord() { return sub ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Free'; }
  function limitToast(text) { toast(text + '. Больше на другом тарифе'); }
  function togglePin(c) {
    if (!c.pinned && S.chats.filter(function (x) { return x.pinned; }).length >= lim().pins) { limitToast('На тарифе ' + planWord() + ' можно закрепить до ' + lim().pins + ' чатов'); return false; }
    c.pinned = !c.pinned; save(); return true;
  }
  var PLANS = [
    { id: 'free', name: 'free', price: 0, line: '12 сообщений каждые 12 часов' },
    { id: 'pro', name: 'pro', price: 1090, limit: 40 },
    { id: 'max', name: 'max', price: 5990, limit: 120, badge: 'популярный', hot: true },
    { id: 'ultra', name: 'ultra', price: 11990, limit: 300, badge: 'выгодно' }
  ];
  var money = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  function featureRows(id) {
    var L = LIMITS[id], big = function (n) { return n >= 1e9; }, rows = [
      'Фото: до ' + L.photos + ' в сообщении',
      'Файлы: до ' + L.files + ' по ' + money(L.chars) + ' символов',
      big(L.projects) ? 'Проекты без ограничений' : 'Проекты: до ' + L.projects,
      big(L.pins) ? 'Закреплённые чаты без ограничений' : 'Закреплённые чаты: до ' + L.pins,
      'Память: до ' + L.memory + ' записей',
      big(L.skills) ? 'Skills без ограничений' : 'Skills: до ' + L.skills
    ];
    return h('div', { class: 'feat' }, rows.map(function (t) { return h('p', { class: 'plan-l dim' }, icon('check'), h('span', { text: t })); }));
  }
  // цена «набегает» от нуля
  function countUp(el) {
    var to = parseInt(el.textContent.replace(/\s/g, ''), 10) || 0, t0 = performance.now(), dur = 650;
    if (!to || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    (function tick(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(to * e);
      if (k < 1) requestAnimationFrame(tick); else el.textContent = money(to);
    })(t0);
  }
  // подсветка карточки за курсором
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest && e.target.closest('.plan'); if (!c) return;
    var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  function openPlans(period) {
    if (wide() && !paneHost) { openSettingsWin('plans'); return; }
    var year = period === 'year';
    var plansBox = h('div', { class: 'plans' }), segBtns = [];
    var cards = function () {
      var made = PLANS.map(function (p, i) {
        var cur = sub ? sub.plan === p.id : p.id === 'free', k = year ? 10 : 1, total = p.price * k;
        var msg = 'Здравствуйте! Хочу купить тариф DDX AI ' + p.name + ' на ' + (year ? 'год' : 'месяц') + ' (' + money(total) + ' ₸).';
        var perMsg = p.limit ? '≈ ' + (total / (p.limit * 60 * (year ? 12 : 1))).toFixed(1).replace('.', ',') + ' ₸ за сообщение' : '';
        var priceRow = p.price
          ? h('div', { class: 'plan-p' }, h('b', { text: money(total) }), h('i', { text: '₸' }), h('em', { text: year ? 'в год' : 'в месяц' }),
              year ? h('s', { text: money(p.price * 12) + ' ₸' }) : null)
          : h('div', { class: 'plan-p' }, h('b', { text: '0' }), h('i', { text: '₸' }), h('em', { text: 'навсегда' }));
        var PI = { free: 'chat', pro: 'bolt', max: 'star', ultra: 'brain' };
        return h('div', { class: 'plan ' + p.id + (cur ? ' cur' : '') + (p.hot ? ' hot' : ''), style: 'animation-delay:' + (i * 70) + 'ms' },
          h('div', { class: 'plan-h' }, h('span', { class: 'plan-n' }, h('span', { class: 'plan-ic' }, icon(PI[p.id] || 'star')), h('span', { text: p.name })),
            h('span', { class: 'plan-tags' }, p.badge ? h('span', { class: 'plan-tag soft', text: p.badge }) : null, cur ? h('span', { class: 'plan-tag', text: 'у тебя' }) : null)),
          priceRow,
          h('p', { class: 'plan-l' }, icon('check'), h('span', { text: p.limit ? p.limit + ' сообщений каждые 12 часов' : p.line })),
          h('i', { class: 'plan-sep' }),
          featureRows(p.id),
          perMsg ? h('p', { class: 'plan-l dim' }, icon('check'), h('span', { text: perMsg })) : null,
          year && p.price ? h('p', { class: 'plan-save', text: '2 месяца в подарок' }) : null,
          p.price ? (cur ? h('span', { class: 'btn block buy now', text: 'Твой тариф' }) : h('a', { class: 'btn solid block buy', href: 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Перейти на ' + p.name })) : null);
      });
      plansBox.replaceChildren.apply(plansBox, made);
      made.forEach(function (card) { var b = card.querySelector('.plan-p b'); if (b) countUp(b); });
    };
    var seg = h('div', { class: 'seg two' }, [['month', 'месяц'], ['year', 'год']].map(function (x) {
      var b = h('button', { type: 'button', class: (x[0] === 'year') === year ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () {
        year = x[0] === 'year'; segBtns.forEach(function (o, j) { o.classList.toggle('on', (j === 1) === year); }); cards();
      });
      segBtns.push(b); return b;
    }));
    cards();
    var code = field('input', { type: 'text', placeholder: 'Код активации', 'aria-label': 'код активации', autocapitalize: 'characters', spellcheck: 'false' });
    var note = h('p', { class: 'cap', text: 'после оплаты в ватсап пришлют код. введи его здесь.' });
    var go = h('button', { class: 'btn', type: 'button', text: 'активировать' });
    go.addEventListener('click', function () {
      var v = code.value.trim().toUpperCase(); if (!v) return;
      go.disabled = true; note.textContent = 'проверяю…';
      fetch(API, { method: 'POST', headers: authHdr(), body: JSON.stringify({ mode: 'sub', device: device, code: v }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          go.disabled = false;
          if (x.ok && x.j.plan) {
            subCode = v; sub = { plan: x.j.plan, period: x.j.period, exp: x.j.exp };
            ls.set(KEY_CODE, subCode); ls.set(KEY_SUB, JSON.stringify(sub));
            setLeft(x.j);
            showLeft(); refreshSide(); toast('Тариф ' + x.j.plan + ' включён'); openPlans(sub.period);
          } else note.textContent = x.j.error === 'expired' ? 'этот тариф уже закончился' : x.j.error === 'used' ? (x.j.detail || 'этот код уже привязан к другому аккаунту') : x.j.error === 'mode' ? 'воркер ещё не обновлён: задеплой worker/full-worker.js' : 'такого кода нет. проверь, что ввёл его без ошибок';
        }, function () { go.disabled = false; note.textContent = 'нет связи с воркером'; });
    });
    var off = null;
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Тарифы' }),
      seg,
      plansBox,
      h('p', { class: 'label', text: 'уже купил' }),
      h('div', { class: 'row-in' }, code, go), note, off], true);
  }

  function backupData() { return JSON.parse(pack(false)); }
  function exportAll() {
    saveFile('ddx-ai-копия-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(backupData()), 'application/json');
  }
  function importAll(file) {
    file.text().then(function (t) {
      var d = JSON.parse(t), n = 0;
      if (!d || !Array.isArray(d.chats)) throw new Error('bad');
      var have = {}; S.chats.forEach(function (c) { have[c.id] = 1; });
      d.chats.forEach(function (c) {
        if (!c || !c.id || have[c.id]) return;
        S.chats.push({ id: String(c.id), title: String(c.title || 'Чат'), pinned: !!c.pinned, project: c.project || null, created: c.created || Date.now(), updated: c.updated || Date.now(), msgs: cleanMsgs(c.msgs) }); n++;
      });
      var hp = {}; S.projects.forEach(function (p) { hp[p.id] = 1; });
      (Array.isArray(d.projects) ? d.projects : []).forEach(function (p) { if (p && p.id && !hp[p.id]) S.projects.push({ id: String(p.id), name: String(p.name || 'Проект'), instructions: String(p.instructions || ''), created: p.created || Date.now() }); });
      save(); renderAll(); closeSheet(); toast(n ? 'Добавлено чатов: ' + n : 'Новых чатов в копии нет');
    }).catch(function () { toast('Это не копия DDX AI'); });
  }
  var importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  document.body.append(importInput);
  importInput.addEventListener('change', function () { if (importInput.files[0]) importAll(importInput.files[0]); importInput.value = ''; });

  function grow2(label, ic, value, fn, cls) {
    var b = h('button', { class: 'grow' + (cls ? ' ' + cls : ''), type: 'button' }, icon(ic), h('span', { class: 'gl', text: label }), value ? h('span', { class: 'gv', text: value }) : null, fn ? icon('chev') : null);
    if (fn) b.addEventListener('click', fn); else b.disabled = true;
    return b;
  }

  /* ---------- аккаунт и облако ---------- */
  var KEY_ACCT = 'wchat-acct', KEY_CLOUD = 'wchat-cloud', KEY_SYNC = 'wchat-lastsync', acct = null;
  try { acct = JSON.parse(ls.get(KEY_ACCT) || 'null'); } catch (eA) { acct = null; }
  if (acct && !acct.token) acct = null;
  var cloudBase = Number(ls.get(KEY_CLOUD)) || 0, lastSync = Number(ls.get(KEY_SYNC)) || 0, pushT = 0, syncing = false;
  function authHdr() { var o = { 'Content-Type': 'application/json' }; if (acct && acct.token) o.Authorization = 'Bearer ' + acct.token; return o; }
  function api(path, body, method) {
    return fetch(API.replace(/\/+$/, '') + path, { method: method || (body ? 'POST' : 'GET'), headers: authHdr(), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, st: r.status, j: j }; }); });
  }
  function goneAdd(id) {
    var g = S.settings.gone || (S.settings.gone = {}); g[id] = Date.now();
    var keys = Object.keys(g); if (keys.length > 300) keys.sort(function (a, b) { return g[a] - g[b]; }).slice(0, keys.length - 300).forEach(function (k) { delete g[k]; });
  }
  var blank = function (v) { return v == null || v === '' || (Array.isArray(v) && !v.length); };
  // слияние двух копий: чаты и проекты по id (новее побеждает), память и skills складываются, удалённое не воскресает
  function mergeData(a, b, preferCloud) {
    var sa = a.settings || {}, sb = b.settings || {}, gone = Object.assign({}, sb.gone || {}, sa.gone || {}), st = {};
    var union = function (la, lb, pickNew) {
      var m = {}; (lb || []).concat(la || []).forEach(function (x) { if (!x || !x.id || gone[x.id]) return; var o = m[x.id]; if (!o || !pickNew || (x.updated || 0) >= (o.updated || 0)) m[x.id] = x; });
      return Object.keys(m).map(function (k) { return m[k]; });
    };
    Object.keys(Object.assign({}, sb, sa)).forEach(function (k) {
      if (k === 'memory' || k === 'skills' || k === 'gone' || k === 'stick') return;
      st[k] = preferCloud ? (blank(sb[k]) ? sa[k] : sb[k]) : (blank(sa[k]) ? sb[k] : sa[k]);
    });
    var seen = {}; st.memory = (sa.memory || []).concat(sb.memory || []).filter(function (t) { if (seen[t]) return false; seen[t] = 1; return true; });
    var sk = {}; (sb.skills || []).concat(sa.skills || []).forEach(function (k) { sk[k.cmd] = k; }); st.skills = Object.keys(sk).map(function (k) { return sk[k]; });
    st.gone = gone;
    var chats = union(a.chats, b.chats, true).sort(function (x, y) { return (y.updated || 0) - (x.updated || 0); });
    var cur = chats.some(function (c) { return c.id === a.cur; }) ? a.cur : (chats.some(function (c) { return c.id === b.cur; }) ? b.cur : null);
    return { v: 3, cur: cur, open: Object.assign({}, b.open || {}, a.open || {}), settings: st, projects: union(a.projects, b.projects, false), chats: chats };
  }
  function packForCloud() {
    var o = JSON.parse(pack(true));
    o.chats.sort(function (x, y) { return y.updated - x.updated; });
    var txt = JSON.stringify(o);
    while (txt.length > 850000 && o.chats.length > 1) { o.chats.pop(); txt = JSON.stringify(o); }
    return txt;
  }
  function markSync() { lastSync = Date.now(); ls.set(KEY_SYNC, String(lastSync)); }
  function applyCloud(jsonStr, updated) {
    var cloud = null; try { cloud = JSON.parse(jsonStr); } catch (e) { return; }
    if (!cloud) return;
    var local = JSON.parse(pack(false)), fresh = !local.chats.length && !local.projects.length;
    ls.set(KEY, JSON.stringify(mergeData(local, cloud, fresh)));
    load(); cloudBase = updated; ls.set(KEY_CLOUD, String(updated)); renderAll(); refreshSide();
  }
  function dropAcct(msg) {
    acct = null; cloudBase = 0; ls.set(KEY_ACCT, ''); ls.set(KEY_CLOUD, '0');
    subCode = ''; sub = null; ls.set(KEY_CODE, ''); ls.set(KEY_SUB, 'null'); lastLeft = null; showLeft(); refreshSide();
    if (msg) toast(msg);
  }
  function pushNow(retry) {
    if (!acct) return Promise.resolve();
    if (syncing) { schedulePush(); return Promise.resolve(); }
    syncing = true;
    return api('/ai/put', { json: packForCloud(), base: cloudBase }).then(function (x) {
      if (x.ok) { cloudBase = x.j.updated; ls.set(KEY_CLOUD, String(cloudBase)); markSync(); return; }
      if (x.st === 409 && !retry) { syncing = false; applyCloud(x.j.json, x.j.updated); return pushNow(true); }
      if (x.st === 401) dropAcct('Сессия закончилась, войди снова');
      else if (x.st === 413) toast('данных слишком много для облака');
    }, function () { /* нет сети: повторим при следующем сохранении */ }).then(function () { syncing = false; });
  }
  function schedulePush() { if (!acct) return; clearTimeout(pushT); pushT = setTimeout(function () { pushNow(false); }, 2500); }
  // забрать облако: при входе и при возвращении в приложение
  function syncDown(quiet) {
    if (!acct) return Promise.resolve();
    return api('/ai/get').then(function (x) {
      if (x.st === 401) { dropAcct('Сессия закончилась, войди снова'); return; }
      if (!x.ok) { if (!quiet) toast(x.j.detail || 'облако пока недоступно'); return; }
      if (x.j.sub && x.j.sub.code) {
        subCode = x.j.sub.code; sub = { plan: x.j.sub.plan, period: x.j.sub.period, exp: x.j.sub.exp };
        ls.set(KEY_CODE, subCode); ls.set(KEY_SUB, JSON.stringify(sub)); refreshSide();
      }
      if (x.j.json && x.j.updated !== cloudBase) { applyCloud(x.j.json, x.j.updated); markSync(); return pushNow(false); }
      if (!x.j.json) return pushNow(false);
      markSync();
    }, function () { if (!quiet) toast('нет связи с воркером'); });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && acct && !busy) syncDown(true); });

  function openAuth(mode) {
    mode = mode || 'in';
    var login = field('input', { type: 'text', placeholder: 'логин (латиница, цифры)', 'aria-label': 'логин', maxlength: '24', autocomplete: 'username', spellcheck: 'false' });
    var pass = field('input', { type: 'password', placeholder: 'пароль (от 6 символов)', 'aria-label': 'пароль', maxlength: '100', autocomplete: mode === 'in' ? 'current-password' : 'new-password' });
    var nm = field('input', { type: 'text', placeholder: 'как тебя зовут', 'aria-label': 'имя', maxlength: '24', autocomplete: 'name' });
    var err = h('p', { class: 'cap auth-err', text: '' });
    var go = h('button', { class: 'btn solid block', type: 'button', text: mode === 'in' ? 'Войти' : 'Создать аккаунт' });
    var seg = h('div', { class: 'seg two' }, ['in', 'up'].map(function (k) {
      var b = h('button', { type: 'button', class: k === mode ? 'on' : '', text: k === 'in' ? 'Вход' : 'Регистрация' }); b.addEventListener('click', function () { if (k !== mode) openAuth(k); }); return b;
    }));
    var submit = function () {
      var l = login.value.trim().toLowerCase(), p = pass.value;
      if (!l || !p) { err.textContent = 'введи логин и пароль'; return; }
      go.disabled = true; err.textContent = 'минуту…';
      api(mode === 'in' ? '/auth/login' : '/auth/register', mode === 'in' ? { login: l, password: p } : { login: l, password: p, name: nm.value.trim() }).then(function (x) {
        go.disabled = false;
        if (x.ok && x.j.token) {
          acct = { token: x.j.token, user: x.j.user }; ls.set(KEY_ACCT, JSON.stringify(acct));
          if (!S.settings.name && x.j.user && (x.j.user.name || x.j.user.login)) S.settings.name = x.j.user.name || x.j.user.login;
          save(); closeSheet(); toast(mode === 'in' ? 'Ты вошёл' : 'Аккаунт создан'); refreshSide(); syncDown(false);
        } else err.textContent = x.st === 503 ? 'аккаунты на сервере ещё не включены (нужна база D1)' : (x.j.detail || 'не получилось, попробуй ещё раз');
      }, function () { go.disabled = false; err.textContent = 'нет связи с воркером'; });
    };
    go.addEventListener('click', submit);
    [login, pass, nm].forEach(function (f) { f.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); }); });
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Аккаунт' }),
      h('p', { class: 'cap', text: 'С аккаунтом чаты, память, Skills и тариф доступны на всех твоих устройствах.' }),
      seg,
      h('div', { class: 'form' }, login, pass, mode === 'up' ? nm : null, err, go)
    ], true);
  }
  /* ---------- смена имени и пароля ---------- */
  function openRename() {
    var inp = field('input', { type: 'text', placeholder: 'как тебя зовут', 'aria-label': 'имя', maxlength: '24', autocomplete: 'name', value: (S.settings.name || (acct && acct.user && (acct.user.name || acct.user.login)) || '') });
    inp.value = S.settings.name || (acct && acct.user && (acct.user.name || acct.user.login)) || '';
    var ok = h('button', { class: 'btn solid block', type: 'button', text: 'Сохранить' });
    var go = function () {
      var v = inp.value.trim().slice(0, 24); if (!v) { toast('Введи имя'); return; }
      S.settings.name = v; if (acct && acct.user) acct.user.name = v;
      try { ls.set('wchat-acct', JSON.stringify(acct)); } catch (e0) { /* ok */ }
      save(); renderAll(); if (acct) api('/auth/name', { name: v }).then(function () {}, function () {});
      closeSheet(); toast('Имя изменено');
    };
    ok.addEventListener('click', go); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    openSheet([h('h2', { text: 'Изменить имя' }), h('div', { class: 'group solo' }, inp), ok]);
    setTimeout(function () { inp.focus(); inp.select(); }, 350);
  }
  function openPassword() {
    var old = field('input', { type: 'password', placeholder: 'Текущий пароль', 'aria-label': 'текущий пароль', maxlength: '100', autocomplete: 'current-password' });
    var nw = field('input', { type: 'password', placeholder: 'Новый пароль (от 6 символов)', 'aria-label': 'новый пароль', maxlength: '100', autocomplete: 'new-password' });
    var nw2 = field('input', { type: 'password', placeholder: 'Повтори новый пароль', 'aria-label': 'повтор пароля', maxlength: '100', autocomplete: 'new-password' });
    var err = h('p', { class: 'cap err', text: '' });
    var ok = h('button', { class: 'btn solid block', type: 'button', text: 'Изменить пароль' });
    var go = function () {
      err.textContent = '';
      if (!old.value) { err.textContent = 'Введи текущий пароль'; return; }
      if (nw.value.length < 6) { err.textContent = 'Новый пароль: от 6 символов'; return; }
      if (nw.value !== nw2.value) { err.textContent = 'Пароли не совпадают'; return; }
      if (nw.value === old.value) { err.textContent = 'Новый пароль совпадает с текущим'; return; }
      ok.disabled = true; ok.textContent = 'меняю…';
      api('/auth/password', { password: old.value, newPassword: nw.value }).then(function (x) {
        ok.disabled = false; ok.textContent = 'Изменить пароль';
        if (x.ok) { closeSheet(); toast('Пароль изменён'); return; }
        err.textContent = x.st === 401 ? 'Текущий пароль неверный' : (x.j && x.j.detail) || 'Не получилось, попробуй ещё раз';
      }, function () { ok.disabled = false; ok.textContent = 'Изменить пароль'; err.textContent = 'Нет связи с сервером'; });
    };
    ok.addEventListener('click', go); nw2.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    openSheet([h('h2', { text: 'Изменить пароль' }), h('div', { class: 'group solo stack' }, old, nw, nw2), err, ok]);
  }

  var JOBS = ['Студент', 'Юрист', 'Разработчик', 'Дизайнер', 'Предприниматель', 'Учитель', 'Маркетолог', 'Менеджер', 'Бухгалтер', 'Инженер', 'Врач', 'Писатель', 'Исследователь', 'Другое'];
  function dateRu(t) { return new Date(t).toLocaleString(window.I18N ? I18N.locale() : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' г.,', ' г.,'); }
  function openDelete() {
    var pw = field('input', { type: 'password', placeholder: 'Пароль', 'aria-label': 'пароль', autocomplete: 'current-password' });
    var err = h('p', { class: 'cap err', text: '' });
    var ok = h('button', { class: 'btn block danger', type: 'button', text: 'Удалить аккаунт навсегда' });
    ok.addEventListener('click', function () {
      if (!pw.value) { err.textContent = 'Введи пароль'; return; }
      ok.disabled = true;
      api('/auth/delete', { password: pw.value }).then(function (x) {
        ok.disabled = false;
        if (x.ok) { dropAcct('Аккаунт удалён'); closeSheet(); return; }
        err.textContent = x.st === 401 ? 'Пароль неверный' : (x.j && x.j.detail) || 'Не получилось';
      }, function () { ok.disabled = false; err.textContent = 'Нет связи с сервером'; });
    });
    openSheet([backLink(openAccount), h('h2', { text: 'Удалить аккаунт' }), h('p', { class: 'cap', text: 'Аккаунт и копия данных в облаке удалятся. Чаты на этом устройстве останутся. Тариф, привязанный к аккаунту, пропадёт вместе с ним.' }), h('div', { class: 'group solo stack' }, pw), err, ok]);
  }
  function openAccount() {
    if (wide() && !paneHost) { openSettingsWin('account'); return; }
    if (!acct) { openAuth('in'); return; }
    var st = S.settings, u = acct.user || {};
    var saveSoft = function () { save(); renderAll(); };
    var avBtn = h('button', { class: 'avbtn', type: 'button', 'aria-label': 'сменить фото' }, avEl('big'));
    avBtn.addEventListener('click', function () { pickAvatar(openAccount); });
    var avDel = st.avatar ? (function () { var b = h('button', { class: 'link', type: 'button', text: 'Убрать фото' }); b.addEventListener('click', function () { delete st.avatar; save(); refreshSide(); openAccount(); }); return b; })() : null;
    var full = field('input', { type: 'text', maxlength: '60', value: st.fullName || '', placeholder: 'Полное имя', 'aria-label': 'полное имя' });
    var nick = field('input', { type: 'text', maxlength: '24', value: st.name || u.name || '', placeholder: 'Как к тебе обращаться', 'aria-label': 'как обращаться' });
    var job = h('select', { class: 'field sel', 'aria-label': 'чем занимаешься' }, [h('option', { value: '', text: 'Не выбрано' })].concat(JOBS.map(function (j) { return h('option', { value: j, text: j }); })));
    job.value = JOBS.indexOf(st.role) >= 0 ? st.role : (st.role ? '' : '');
    var about = field('textarea', { rows: '3', maxlength: '500', placeholder: 'Что важно знать обо мне', 'aria-label': 'о тебе' }); about.value = st.about || '';
    full.addEventListener('change', function () { st.fullName = full.value.trim(); saveSoft(); });
    nick.addEventListener('change', function () { var v = nick.value.trim().slice(0, 24); if (!v) return; st.name = v; if (acct.user) acct.user.name = v; try { ls.set('wchat-acct', JSON.stringify(acct)); } catch (e0) { /* ok */ } saveSoft(); api('/auth/name', { name: v }).then(function () {}, function () {}); });
    job.addEventListener('change', function () { st.role = job.value; save(); });
    about.addEventListener('change', function () { st.about = about.value.trim(); save(); });
    var rowIn = function (title, desc, ctl) { return h('div', { class: 'grow2' }, h('div', { class: 'gtxt' }, h('b', { text: title }), desc ? h('span', { text: desc }) : null), ctl); };
    var when = lastSync ? new Date(lastSync).toLocaleTimeString(window.I18N ? I18N.locale() : 'ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'ещё не было';
    var syncBtn = h('button', { class: 'btn block', type: 'button', text: 'Синхронизировать сейчас' });
    syncBtn.addEventListener('click', function () { syncBtn.disabled = true; syncBtn.textContent = 'синхронизирую…'; syncDown(false).then(function () { toast('Готово'); openAccount(); }); });
    var all = twice('Выйти на всех устройствах', 'Точно выйти везде? Нажми ещё раз', function () {
      api('/auth/logout-all', {}).then(function () {}, function () {}); dropAcct('Ты вышел на всех устройствах'); closeSheet();
    }, 'danger');
    var out = twice('Выйти из аккаунта', 'Точно выйти? Нажми ещё раз', function () {
      api('/auth/logout', {}).then(function () {}, function () {}); dropAcct('Ты вышел из аккаунта'); closeSheet();
    }, 'danger');
    var sess = h('div', { class: 'sess' }, h('p', { class: 'cap', text: 'Загружаю…' }));
    var loadSess = function () {
      api('/auth/sessions', {}).then(function (x) {
        sess.replaceChildren();
        var list = (x.j && x.j.sessions) || [];
        if (!x.ok || !list.length) { sess.append(h('p', { class: 'cap', text: 'Не получилось загрузить список' })); return; }
        sess.append(h('div', { class: 'ssr sshead' }, h('span', { text: 'Устройство' }), h('span', { text: 'Местоположение' }), h('span', { text: 'Создано' }), h('span', { text: 'Обновлено' }), h('span')));
        list.forEach(function (s) {
          var end = s.current ? h('span') : (function () { var b = h('button', { class: 'sess-x', type: 'button', 'aria-label': 'завершить сеанс', title: 'Завершить сеанс' }, icon('close')); b.addEventListener('click', function () { b.disabled = true; api('/auth/session-end', { id: s.id }).then(loadSess); }); return b; })();
          sess.append(h('div', { class: 'ssr' },
            h('span', { class: 'sd' }, h('b', { text: s.device, raw: 1 }), s.current ? h('i', { class: 'now', text: 'Текущий' }) : null),
            h('span', { class: 'sm', text: s.place || '—', raw: 1 }), h('span', { class: 'sm', text: dateRu(s.created) }), h('span', { class: 'sm', text: dateRu(s.last) }), end));
        });
        if (list.length > 1) {
          var others = h('button', { class: 'btn', type: 'button', text: 'Завершить все остальные' });
          others.addEventListener('click', function () { others.disabled = true; api('/auth/sessions-end-others', {}).then(loadSess); });
          sess.append(h('div', { class: 'sfoot2' }, others));
        }
      }, function () { sess.replaceChildren(h('p', { class: 'cap', text: 'Нет связи с сервером' })); });
    };
    loadSess();
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Профиль' }),
      h('div', { class: 'group acc2' },
        rowIn('Фото профиля', 'PNG, JPEG или WebP, до 10 МБ.', h('div', { class: 'avwrap' }, avBtn, avDel)),
        rowIn('Полное имя', '', full),
        rowIn('Как к тебе обращаться?', '', nick),
        rowIn('Чем ты занимаешься?', '', job),
        h('div', { class: 'grow2 col' }, h('div', { class: 'gtxt' }, h('b', { text: 'О себе' }), h('span', { text: 'ИИ учитывает это во всех чатах.' })), about)),
      h('p', { class: 'glabel', text: 'Аккаунт' }),
      h('div', { class: 'group' },
        rowIn('Логин', '', h('span', { class: 'gv', text: '@' + u.login, raw: 1 })),
        grow2('Изменить пароль', 'edit', '', openPassword)),
      h('p', { class: 'glabel', text: 'Синхронизация' }),
      h('div', { class: 'group' }, h('div', { class: 'grow' }, icon('download'), h('span', { class: 'gl', text: 'Последняя' }), h('span', { class: 'gv', text: when }))),
      syncBtn,
      h('p', { class: 'cap', text: 'Чаты, проекты, память и Skills копируются в облако сами. Фото чатов в облако не уходят, только текст.' }),
      h('p', { class: 'glabel', text: 'Активные сессии' }),
      sess,
      h('div', { class: 'group solo' }, out, all),
      h('div', { class: 'group solo' }, grow2('Удалить аккаунт', 'trash', '', openDelete, 'dangerrow'))
    ], true);
  }

  /* ---------- окно настроек на компьютере: слева разделы, справа содержимое ---------- */
  var swSec = 'general';
  function openUsage() {
    if (wide() && !paneHost) { openSettingsWin('usage'); return; }
    var L = lim(), big = function (n) { return n >= 1e9; };
    var planName = sub ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Free';
    var used = null, total = lastLeft && lastLeft.limit ? lastLeft.limit : 0;
    if (total) used = Math.max(0, Math.min(total, total - lastLeft.left));
    var pct = total ? Math.round(used / total * 100) : 0;
    refreshLeft(); total = lastLeft && lastLeft.limit ? lastLeft.limit : 0; used = total ? Math.max(0, Math.min(total, total - lastLeft.left)) : null; pct = total ? Math.round(used / total * 100) : 0;
    var reset = backAt() ? 'Восстановится в ' + hm(backAt()) : 'Скользящее окно: сообщение освобождается через 12 часов';
    var status = !total ? 'Данные появятся после первого сообщения.' : pct >= 100 ? 'Лимит исчерпан. Он обновится после сброса, или можно перейти на тариф выше.' : pct >= 80 ? 'Лимит почти исчерпан. Запаса хватит ненадолго.' : 'Всё идёт по плану. К сбросу у тебя ещё должен остаться запас.';
    var bar = function (p, warn) { return h('div', { class: 'ubar' + (warn ? ' warn' : '') }, h('i', { style: 'width:' + Math.max(p > 0 ? 2 : 0, Math.min(100, p)) + '%' })); };
    var row = function (title, sub2, p, right, warn) {
      return h('div', { class: 'urow' }, h('div', { class: 'ul' }, h('b', { text: title }), sub2 ? h('span', { text: sub2 }) : null), bar(p, warn), h('em', { class: 'ur', text: right }));
    };
    var lim2 = function (title, now, max) { var inf = big(max); var p = inf ? 0 : Math.round(now / max * 100); return row(title, inf ? now + ' · без ограничений' : now + ' из ' + max, p, inf ? '∞' : p + '%', !inf && p >= 80); };
    var pinned = S.chats.filter(function (x) { return x.pinned; }).length;
    var up = h('button', { class: 'btn solid block', type: 'button', text: sub ? 'Сменить тариф' : 'Улучшить тариф' }); up.addEventListener('click', function () { openPlans(); });
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', {}, h('span', { text: 'Твоё использование' }), h('span', { class: 'utag', text: planName })),
      h('p', { class: 'ustat', text: status }),
      h('div', { class: 'ugroup' },
        row('Сообщения за 12 часов', reset + (total ? ' · осталось ' + lastLeft.left + ' из ' + total : ''), pct, total ? pct + '%' : '—', pct >= 80)),
      h('p', { class: 'glabel', text: 'Лимиты тарифа' }),
      h('div', { class: 'ugroup' },
        lim2('Проекты', S.projects.length, L.projects),
        lim2('Закреплённые чаты', pinned, L.pins),
        lim2('Записи в памяти', ((S.settings.memory || []).length), L.memory),
        lim2('Skills', ((S.settings.skills || []).length), L.skills)),
      h('p', { class: 'glabel', text: 'В одном сообщении' }),
      h('div', { class: 'group' },
        grow2('Фото', 'image', 'до ' + L.photos, null),
        grow2('Файлы', 'file', 'до ' + L.files + ' по ' + money(L.chars) + ' символов', null)),
      up
    ], true);
  }
  function privText(title, paras) {
    openSheet([backLink(openData), h('h2', { text: title })].concat(paras.map(function (t) { return h('p', { class: 'cap ptxt', text: t }); })), true);
  }
  function openFilesManage() {
    var items = [], n = 0;
    S.chats.forEach(function (c) { c.msgs.forEach(function (m) {
      (m.files || []).forEach(function (f) { items.push([c.title, f.name, 'file']); });
      (m.thumbs || []).forEach(function () { n++; });
    }); });
    var list = h('div', { class: 'group' });
    if (!items.length && !n) list.append(h('p', { class: 'cap pad', text: 'Загруженных файлов и фото нет.' }));
    items.slice(0, 60).forEach(function (x) { list.append(h('div', { class: 'grow' }, icon('file'), h('span', { class: 'gl', text: x[1], raw: 1 }), h('span', { class: 'gv', text: x[0], raw: 1 }))); });
    if (n) list.append(h('div', { class: 'grow' }, icon('image'), h('span', { class: 'gl', text: 'Фото в чатах' }), h('span', { class: 'gv', text: String(n) })));
    var del = twice('Удалить все вложения', 'Точно удалить? Нажми ещё раз', function () {
      S.chats.forEach(function (c) { c.msgs.forEach(function (m) { m.files = []; m.thumbs = []; }); }); save(); toast('Вложения удалены'); openFilesManage();
    }, 'danger');
    openSheet([backLink(openData), h('h2', { text: 'Загруженные файлы' }), h('p', { class: 'cap', text: 'Файлы и фото хранятся только внутри чатов на этом устройстве (и в облачной копии, если ты вошёл в аккаунт). Сами сообщения останутся.' }), list].concat(items.length || n ? [h('div', { class: 'group solo' }, del)] : []), true);
  }
  function openFeedback() {
    var up = 0, down = 0;
    S.chats.forEach(function (c) { c.msgs.forEach(function (m) { if (m.fb === 'up') up++; else if (m.fb === 'down') down++; }); });
    var reset = twice('Сбросить оценки', 'Точно сбросить? Нажми ещё раз', function () {
      S.chats.forEach(function (c) { c.msgs.forEach(function (m) { m.fb = ''; }); }); save(); renderAll(); toast('Оценки сброшены'); openFeedback();
    }, 'danger');
    openSheet([backLink(openData), h('h2', { text: 'Ваши отзывы' }),
      h('p', { class: 'cap', text: 'Оценки ответов («хороший» и «плохой») сохраняются только у тебя и никуда не отправляются.' }),
      h('div', { class: 'group' }, h('div', { class: 'grow' }, icon('thumbup'), h('span', { class: 'gl', text: 'Хороший ответ' }), h('span', { class: 'gv', text: String(up) })), h('div', { class: 'grow' }, icon('thumbdown'), h('span', { class: 'gl', text: 'Плохой ответ' }), h('span', { class: 'gv', text: String(down) }))),
      up + down ? h('div', { class: 'group solo' }, reset) : null], true);
  }
  function openData() {
    if (wide() && !paneHost) { openSettingsWin('data'); return; }
    var del = twice('Удалить все чаты', 'Точно удалить? Нажми ещё раз', function () {
      S.chats.forEach(function (c) { goneAdd(c.id); }); S.chats = []; S.cur = null; S.pendingProject = null; save(); clearError(); renderAll(); toast('Чаты удалены');
    }, 'danger');
    var act = function (label, text, fn, ext) {
      var b = h('button', { class: 'btn', type: 'button' }, h('span', { text: text }), ext ? icon('share') : null); b.addEventListener('click', fn);
      return h('div', { class: 'grow2 one' }, h('div', { class: 'gtxt' }, h('b', { text: label })), b);
    };
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Конфиденциальность' }),
      h('p', { class: 'cap ptxt', text: 'DDX AI хранит чаты, память и настройки на твоём устройстве. Если ты вошёл в аккаунт, их копия лежит в облаке. Подробнее о том, как мы работаем с данными, — ниже.' }),
      h('div', { class: 'group' },
        grow2('Как мы защищаем ваши данные', 'lock', '', function () { privText('Как мы защищаем ваши данные', [
          'Чаты, память, Skills и настройки хранятся в памяти браузера на твоём устройстве. Без входа в аккаунт на наш сервер они не попадают.',
          'Если ты вошёл в аккаунт, копия данных хранится в облаке и привязана к нему. Пароль хранится в виде хеша, а не открытым текстом.',
          'Все запросы идут по защищённому соединению (HTTPS). Ключи сервиса ИИ хранятся только на сервере и в приложение не попадают.',
          'Ты можешь в любой момент сохранить копию чатов в файл, завершить сессии на других устройствах или удалить аккаунт вместе с облачной копией.']); }),
        grow2('Как мы используем ваши данные', 'doc', '', function () { privText('Как мы используем ваши данные', [
          'Текст твоего сообщения, прикреплённые файлы и фото отправляются сервису ИИ только для того, чтобы получить ответ.',
          'Память и инструкции добавляются к запросу, чтобы ответы подходили именно тебе. Выключить память можно ниже или в разделе «Память».',
          'Мы не продаём данные, не показываем рекламу и не используем твои чаты для обучения моделей.',
          'Счётчик сообщений в окне 12 часов привязан к аккаунту, коду активации или устройству. Содержимое чатов в нём не хранится.']); })),
      h('h2', { class: 'ph2', text: 'Предпочтения' }),
      h('div', { class: 'group' },
        swRow('Использовать память', 'Добавлять сохранённые факты о тебе к ответам.', swSwitch('memOn', true)),
        swRow('Учитывать прошлые чаты', 'Брать подходящие фрагменты из других чатов, когда это уместно.', swSwitch('chatSearch', false))),
      h('h2', { class: 'ph2', text: 'Ваши данные' }),
      h('div', { class: 'group' },
        act('Экспортировать данные', 'Экспортировать данные', exportAll),
        act('Загрузить копию', 'Загрузить', function () { importInput.click(); }),
        act('Загруженные файлы', 'Управлять', openFilesManage),
        act('Ваши отзывы', 'Управлять', openFeedback),
        act('Настройки памяти', 'Управлять', function () { openMemory(); })),
      h('div', { class: 'group solo' }, del)
    ], true);
  }
  function openGeneral() {
    if (wide() && !paneHost) { openSettingsWin('general'); return; }
    var cur = (window.WTheme && WTheme.mode()) || 'dark';
    var seg = h('div', { class: 'seg3' }, [['auto', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(function (x) {
      var b = h('button', { type: 'button', class: x[0] === cur ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () { WTheme.set(x[0], true); seg.querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); }); });
      return b;
    }));
    openSheet([
      h('h2', { text: 'Общее' }),
      h('p', { class: 'glabel', text: 'Внешний вид' }),
      h('div', { class: 'group' }, h('div', { class: 'grow' }, icon('palette'), h('span', { class: 'gl', text: 'Тема' }), seg)),
      h('p', { class: 'glabel', text: 'Язык' }),
      h('div', { class: 'group' }, grow2('Язык интерфейса', 'gear', window.I18N ? I18N.langs[I18N.get()] : 'Русский', function () { openUiLang(openGeneral); }), grow2('Язык ответов', 'chat', (langOf(S.settings.lang) ? langOf(S.settings.lang)[1] : 'Как в сообщении'), function () { openLangPicker(openGeneral); })),
      h('p', { class: 'cap', text: 'На каком языке ИИ отвечает. По умолчанию он отвечает на том языке, на котором ты пишешь.' }),
      h('p', { class: 'foot', text: 'DDX AI ' + VERSION, raw: 1 })
    ], true);
  }
  function openSettingsWin(sec) {
    swSec = sec || swSec || 'general';
    var secs = [['general', 'Общее', 'gear', openGeneral], ['account', 'Аккаунт', 'user', function () { if (acct) openAccount(); else openAuth('in'); }], ['pers', 'Персонализация', 'palette', openPersonal],
      ['caps', 'Возможности', 'spark', openCaps], ['memory', 'Память', 'brain', openMemory], ['skills', 'Skills', 'bolt', openSkills], ['plans', 'Тарифы', 'star', function () { openPlans(); }], ['usage', 'Использование', 'gauge', openUsage], ['data', 'Конфиденциальность', 'lock', openData]];
    var content = h('div', { class: 'sw-content' }), nav = h('div', { class: 'sw-nav' }), find = field('input', { type: 'search', placeholder: 'Поиск', 'aria-label': 'поиск по настройкам' });
    var btns = secs.map(function (x) {
      var b = h('button', { class: 'sw-item', type: 'button', 'data-k': x[0] }, icon(x[2]), h('span', { text: x[1] }));
      b.addEventListener('click', function () { show(x[0]); }); return b;
    });
    var show = function (k) {
      swSec = k; paneHost = content;
      btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
      secs.filter(function (x) { return x[0] === k; })[0][3]();
    };
    find.addEventListener('input', function () {
      var q = find.value.trim().toLowerCase();
      btns.forEach(function (b) { b.hidden = !!q && b.textContent.toLowerCase().indexOf(q) < 0; });
    });
    var x = h('button', { class: 'round-x', type: 'button', 'aria-label': 'закрыть' }, icon('close')); x.addEventListener('click', closeSheet);
    nav.append(h('div', { class: 'sw-find' }, icon('search'), find), h('p', { class: 'glabel', text: 'Предпочтения' }));
    btns.slice(0, 5).forEach(function (b) { nav.append(b); }); nav.append(h('p', { class: 'glabel', text: 'Приложение' })); btns.slice(5).forEach(function (b) { nav.append(b); });
    var win = h('div', { class: 'sw' }, h('div', { class: 'sw-head' }, h('h2', { text: 'Настройки' }), x), h('div', { class: 'sw-body' }, nav, content));
    paneHost = null; openSheet([win], false); panel.classList.add('swin');
    show(swSec);
  }
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openMenu(); } });

  function openMenu() {
    if (wide()) { openSettingsWin(); return; }
    var cur = (window.WTheme && WTheme.mode()) || 'dark';
    var close = h('button', { class: 'round-x', type: 'button', 'aria-label': 'закрыть' }, icon('close')); close.addEventListener('click', closeSheet);
    var themes = h('div', { class: 'themes' }, [['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Системная']].map(function (x) {
      var b = h('button', { type: 'button', class: 'theme' + (x[0] === cur ? ' on' : '') },
        h('span', { class: 'tp ' + x[0] }, h('i'), h('i'), h('u')), h('span', { class: 'tl', text: x[1] }));
      b.addEventListener('click', function () { WTheme.set(x[0], true); themes.querySelectorAll('.theme').forEach(function (o) { o.classList.toggle('on', o === b); }); });
      return b;
    }));
    var nm = (S.settings.name || '').trim();
    var planName = sub ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Free';
    var usage = lastLeft ? 'Осталось ' + lastLeft.left + (lastLeft.limit ? ' из ' + lastLeft.limit : '') : '';
    var up = h('button', { class: 'grow accent', type: 'button' }, icon('plus'), h('span', { class: 'gl', text: sub ? 'Сменить тариф' : 'Улучшить тариф' })); up.addEventListener('click', function () { openPlans(); });
    var del = twice('Удалить все чаты', 'Точно удалить? Нажми ещё раз', function () {
      S.chats.forEach(function (c) { goneAdd(c.id); }); S.chats = []; S.cur = null; S.pendingProject = null; save(); clearError(); renderAll(); closeSheet();
    }, 'danger');
    openSheet([
      h('div', { class: 'shead2' }, close, h('h2', { text: 'Настройки' }), h('span', { class: 'sp' })),
      h('div', { class: 'group acc' },
        h('div', { class: 'acc-top' }, avEl('big'),
          h('div', { class: 'acc-t' }, h('b', { text: nm || 'DDX AI', raw: 1 }), h('span', { text: 'Тариф ' + planName + (sub ? (sub.period === 'year' ? ' · год' : ' · месяц') : '') }))), up),
      h('p', { class: 'glabel', text: 'Аккаунт' }),
      h('div', { class: 'group' },
        acct ? grow2('Аккаунт', 'user', '@' + (acct.user && acct.user.login || ''), openAccount) : grow2('Войти или создать аккаунт', 'user', '', function () { openAuth('in'); }),
        grow2('Персонализация', 'user', nm || '', openPersonal),
        grow2('Память', 'brain', (S.settings.memory || []).length ? String((S.settings.memory || []).length) : '', openMemory),
        grow2('Skills', 'bolt', skillList().length ? String(skillList().length) : '', openSkills),
        grow2('Тариф', 'star', planName, function () { openPlans(); }),
        grow2('Использование', 'gauge', usage, openUsage)),
      h('p', { class: 'glabel', text: 'Внешний вид' }), h('div', { class: 'group pad' }, themes),
      h('p', { class: 'glabel', text: 'Данные' }),
      h('div', { class: 'group' },
        grow2('Конфиденциальность', 'lock', '', openData),
        grow2('Сохранить копию чатов', 'download', '', exportAll),
        grow2('Загрузить копию', 'share', '', function () { importInput.click(); })),
      h('div', { class: 'group solo' }, del),
      h('p', { class: 'foot center', text: 'DDX AI ' + VERSION, raw: 1 })
    ], true);
  }

  /* ---------- память ---------- */
  var memTimer = 0;
  function memNotice() {
    var bar = $('#membar'); clearTimeout(memTimer);
    var x = h('button', { class: 'sk-x', type: 'button', 'aria-label': 'закрыть' }, icon('close'));
    var closeIt = function () { bar.classList.add('out'); setTimeout(function () { if (bar.classList.contains('out')) { bar.hidden = true; bar.classList.remove('out'); measure(); } }, 260); clearTimeout(memTimer); };
    x.addEventListener('click', function (e) { e.stopPropagation(); closeIt(); });
    var t = h('button', { class: 'mem-t', type: 'button' }, icon('brain'), h('span', { text: 'Память обновлена' }));
    t.addEventListener('click', function () { closeIt(); openMemory(); });
    bar.classList.remove('out'); bar.hidden = false; bar.replaceChildren(t, x); measure();
    memTimer = setTimeout(closeIt, 7000);
  }
  function addMemory(t, auto, quiet) {
    var m = S.settings.memory || (S.settings.memory = []);
    t = String(t || '').trim().slice(0, 200);
    if (!t) return false;
    if (m.indexOf(t) >= 0) { if (!auto && !quiet) toast('Это уже в памяти'); return false; }
    if (m.length >= lim().memory) { if (quiet) return false; limitToast('На тарифе ' + planWord() + ' в памяти до ' + lim().memory + ' записей'); return false; }
    m.push(t); save(); if (auto && !quiet) memNotice(); return true;
  }
  function swSwitch(key, def) {
    var st = S.settings, on = (st[key] == null ? def : st[key]);
    var b = h('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-label': key }, h('i'));
    b.addEventListener('click', function () { st[key] = !(st[key] == null ? def : st[key]); b.classList.toggle('on', st[key]); save(); });
    return b;
  }
  function swRow(title, desc, sw) { return h('div', { class: 'grow2' }, h('div', { class: 'gtxt' }, h('b', { text: title }), h('span', { text: desc })), sw); }
  function openCaps() {
    if (wide() && !paneHost) { openSettingsWin('caps'); return; }
    var st = S.settings;
    var sel = function (opts, val, fn) {
      var s = h('select', { class: 'sel' }); opts.forEach(function (o) { var op = h('option', { value: String(o[0]), text: o[1] }); if (String(o[0]) === String(val)) op.selected = true; s.append(op); });
      s.addEventListener('change', function () { fn(s.value); save(); }); return s;
    };
    var hours = []; for (var i = 0; i < 24; i++) { var t = (i < 10 ? '0' : '') + i + ':00'; hours.push([t, t]); }
    var breakSel = sel([[0, '—'], [30, '30 минут'], [60, '1 час'], [120, '2 часа'], [180, '3 часа']], st.breakMin || 0, function (v) { st.breakMin = +v; });
    if (!st.quietDays) st.quietDays = [false, false, false, false, false, false, false];
    var dn = ['В', 'П', 'В', 'С', 'Ч', 'П', 'С'], dt = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    var days = h('div', { class: 'qdays' }, dn.map(function (n, i) {
      var b = h('button', { class: 'qd' + (st.quietDays[i] ? ' on' : ''), type: 'button', text: n, title: dt[i], raw: 1 });
      b.addEventListener('click', function () { st.quietDays[i] = !st.quietDays[i]; b.classList.toggle('on', st.quietDays[i]); save(); }); return b;
    }));
    var from = sel(hours, st.quietFrom || '22:00', function (v) { st.quietFrom = v; }), to = sel(hours, st.quietTo || '07:00', function (v) { st.quietTo = v; });
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Возможности' }),
      h('div', { class: 'group' },
        swRow('Память', 'Использовать сохранённые факты о тебе в ответах.', swSwitch('memOn', true)),
        swRow('Прошлые чаты', 'Брать подходящие фрагменты из других чатов.', swSwitch('chatSearch', false)),
        swRow('Названия чатов', 'Автоматически придумывать название по первому сообщению.', swSwitch('autoTitle', true)),
        swRow('Отправка по Enter', 'На компьютере Enter отправляет, Shift+Enter — новая строка.', swSwitch('enterSend', true))),
      h('h2', { class: 'ph2', text: 'Время и фокус' }),
      h('div', { class: 'group' },
        h('div', { class: 'grow2' }, h('div', { class: 'gtxt' }, h('b', { text: 'Напоминания о перерывах' }), h('span', { text: 'Напомним сделать перерыв, если ты долго общаешься с ИИ. Можно отключить в любой момент.' })), breakSel),
        h('div', { class: 'grow2 qrow' }, h('div', { class: 'gtxt' }, h('b', { text: 'Тихие часы' }), h('span', { text: 'Выбери дни и время, когда отправка сообщений отключена. Можно отменить или изменить в любой момент.' }), days, h('div', { class: 'qtime' }, h('span', { text: 'С' }), from, h('span', { text: 'до' }), to))))
    ], true);
  }
  function openMemory() {
    if (wide() && !paneHost) { openSettingsWin('memory'); return; }
    var st = S.settings, list = h('div', { class: 'group memlist' }), cnt = h('span', { class: 'fcnt' });
    var fill = function () {
      list.replaceChildren();
      var m = st.memory || [];
      if (!m.length) list.append(h('p', { class: 'cap pad', text: 'Пока пусто. Напиши, например: «запомни, что я учусь на юриста».' }));
      m.forEach(function (t, i) {
        var x = h('button', { class: 'mem-x', type: 'button', 'aria-label': 'забыть' }, icon('close')); x.addEventListener('click', function () { m.splice(i, 1); save(); fill(); });
        list.append(h('div', { class: 'mem' }, h('span', { text: t, raw: 1 }), x));
      });
      cnt.textContent = m.length + ' из ' + lim().memory;
    };
    var on = h('button', { class: 'switch' + (st.memOn !== false ? ' on' : ''), type: 'button', role: 'switch', 'aria-label': 'память' }, h('i'));
    on.addEventListener('click', function () { st.memOn = st.memOn === false; on.classList.toggle('on', st.memOn !== false); save(); });
    var inp = field('input', { type: 'text', maxlength: '200', placeholder: 'Что запомнить', 'aria-label': 'что запомнить' });
    var add = h('button', { class: 'btn', type: 'button', text: 'Добавить' });
    var go = function () { if (addMemory(inp.value)) { inp.value = ''; fill(); } };
    add.addEventListener('click', go); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    fill();
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Память' }),
      h('p', { class: 'cap', text: 'DDX AI учитывает это во всех чатах. Ещё можно написать в чате: «запомни, что …».' }),
      h('div', { class: 'group sw3' },
        swRow('Поиск и использование чатов', 'Разрешить искать нужные сведения в прошлых чатах.', swSwitch('chatSearch', false)),
        swRow('Создание памяти на основе чатов', 'Разрешить формировать память на основе твоих чатов.', on),
        swRow('Включать в память деликатные темы', 'Разрешить сохранять сведения на деликатные темы, например о здоровье или религиозных убеждениях.', swSwitch('memSens', false))),
      h('div', { class: 'group' }, h('div', { class: 'grow2' }, h('div', { class: 'gtxt' }, h('b', { text: 'Экспорт памяти' }), h('span', { text: 'Скачай память в виде архива .zip с файлами Markdown.' })), (function () { var e = h('button', { class: 'btn', type: 'button', text: 'Экспортировать' }); e.addEventListener('click', exportMemory); return e; })())),
      h('div', { class: 'memhead' }, h('p', { class: 'glabel', text: 'Что я помню' }), cnt),
      list,
      h('div', { class: 'row-in' }, inp, add),
      twice('Очистить память', 'Точно очистить? Нажми ещё раз', function () { st.memory = []; save(); fill(); toast('Память очищена'); }, 'danger')
    ], true);
  }


  /* ---------- навыки: готовые инструкции из файла .txt / .md ---------- */
  var SK_MAX = 3500;
  function skillList() { return S.settings.skills || (S.settings.skills = []); }
  function skillByCmd(cmd) { cmd = String(cmd || '').toLowerCase(); return skillList().filter(function (k) { return k.cmd === cmd && !k.off; })[0] || null; }
  function skillAny(cmd) { return skillList().filter(function (k) { return k.cmd === cmd; })[0] || null; }
  function cleanCmd(x) { return String(x || '').replace(/^\/+/, '').toLowerCase().replace(/[^\p{L}\d_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32); }
  // формат файла: первая строка «/команда» (или command: в шапке ---), дальше сама инструкция
  function parseSkill(text, fileName) {
    var t = String(text).replace(/^﻿/, '').replace(/\r/g, '').trim(), meta = {}, body = t, fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t);
    if (fm) {
      fm[1].split('\n').forEach(function (ln) { var m = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(ln); if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, ''); });
      body = fm[2].trim();
    }
    var cmd = meta.command || meta.cmd || meta.trigger || '';
    if (!cmd) { var f = /^[#\s]*(\/[^\s]+)[ \t]*(?:\n([\s\S]*))?$/.exec(body); if (f) { cmd = f[1]; body = (f[2] || '').trim(); } }
    if (!cmd) cmd = String(fileName || '').replace(/\.[^.]+$/, '');
    cmd = cleanCmd(cmd);
    if (!cmd || cmd === 'off') throw new Error('cmd');
    if (!body) throw new Error('empty');
    return { id: uid(), cmd: cmd, name: (meta.name || '').slice(0, 40) || cmd, desc: (meta.description || body.split('\n')[0]).slice(0, 90), text: body.slice(0, SK_MAX), cut: body.length > SK_MAX, at: Date.now() };
  }
  function addSkillFiles(files) {
    var list = Array.prototype.slice.call(files || []), done = 0, last = '';
    Promise.all(list.map(function (f) {
      return f.text().then(function (t) {
        var k = parseSkill(t, f.name), old = skillAny(k.cmd), arr = skillList();
        if (old) { k.id = old.id; k.off = old.off; arr[arr.indexOf(old)] = k; }
        else { if (arr.length >= lim().skills) { limitToast('На тарифе ' + planWord() + ' до ' + lim().skills + ' skills'); return; } arr.push(k); }
        done++; last = '/' + k.cmd; if (k.cut) toast('skill длинный: взял первые ' + SK_MAX + ' символов');
      }, function () { /* прочитаем ниже */ }).then(null, function (e) { toast(e && e.message === 'cmd' ? 'в файле нет команды: первой строкой напиши /имя' : e && e.message === 'empty' ? 'в файле нет инструкции' : 'не получилось прочитать «' + f.name + '»'); });
    })).then(function () { if (done) { save(); toast(done === 1 ? 'skill ' + last + ' добавлен' : 'skills добавлено: ' + done); } if (sheet.classList.contains('show')) openSkills(); });
  }
  // навык сработает на то сообщение, где в любом месте написана его команда; на следующее уже нет
  function skillOf(c, text) {
    var rx = /(^|\s)\/([^\s\/]+)(?=\s|$)/g, m;
    text = String(text || '');
    while ((m = rx.exec(text))) {
      var k = skillByCmd(m[2]);
      if (k) return { skill: k, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim(), inline: true };
    }
    return null;
  }
  function setStick(c, k) {
    var st = S.settings.stick || (S.settings.stick = {});
    if (k) st[c.id] = k.id; else delete st[c.id];
    save(); showSkillbar();
  }
  function showSkillbar() {
    var c = curChat(), id = c && (S.settings.stick || {})[c.id], k = id && skillList().filter(function (x) { return x.id === id; })[0], bar = $('#skillbar');
    if (!k) { bar.hidden = true; bar.replaceChildren(); measure(); return; }
    var x = h('button', { class: 'sk-x', type: 'button', 'aria-label': 'выключить skill' }, icon('close')); x.addEventListener('click', function () { setStick(c, null); toast('навык выключен'); });
    bar.hidden = false; bar.replaceChildren(icon('bolt'), h('span', { text: 'skill /' + k.cmd, raw: 1 }), x); measure();
  }
  var skillPop = null;
  function closeSkillPop() { if (skillPop) { skillPop.remove(); skillPop = null; } }
  function skillHint() {
    var m = /(^|\s)\/([^\s\/]*)$/.exec(ta.value);
    if (!m) { closeSkillPop(); return; }
    var q = m[2].toLowerCase(), items = skillList().filter(function (k) { return k.cmd.indexOf(q) === 0; }).map(function (k) { return [k.cmd, k.desc]; });
    if (!items.length) { closeSkillPop(); return; }
    closeSkillPop();
    skillPop = h('div', { class: 'popmenu up skillpop', role: 'menu' }, items.slice(0, 5).map(function (it) {
      var b = h('button', { class: 'pi', type: 'button' }, icon('bolt'), h('span', { class: 'sk-t' }, h('b', { text: '/' + it[0], raw: 1 }), h('em', { text: it[1], raw: 1 })));
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); ta.value = ta.value.slice(0, m.index + m[1].length) + '/' + it[0] + ' '; closeSkillPop(); grow(); syncSend(); storeDraft(); ta.focus(); });
      return b;
    }));
    var r = $('#composer').getBoundingClientRect();
    skillPop.style.left = Math.max(10, r.left + 12) + 'px'; skillPop.style.width = Math.min(r.width - 24, 420) + 'px'; skillPop.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    document.body.append(skillPop);
  }
  document.addEventListener('pointerdown', function (e) { if (skillPop && !skillPop.contains(e.target) && e.target !== ta) closeSkillPop(); });

  function ago(ts) {
    if (!ts) return 'давно';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'только что'; if (m < 60) return m + ' мин назад';
    var hr = Math.round(m / 60); if (hr < 24) return hr + ' ч назад';
    return Math.round(hr / 24) + ' дн назад';
  }
  function openSkill(k, tab) {
    tab = tab || 'ov';
    var back = h('button', { class: 'skback', type: 'button' }, icon('chev'), h('span', { text: 'Ваши Skills' })); back.addEventListener('click', openSkills);
    var on = h('button', { class: 'switch' + (k.off ? '' : ' on'), type: 'button', role: 'switch', 'aria-label': 'включить skill' }, h('i'));
    on.addEventListener('click', function () { k.off = !k.off; on.classList.toggle('on', !k.off); save(); });
    var tryIt = h('button', { class: 'btn solid', type: 'button' }, icon('chat'), h('span', { text: 'Попробовать в чате' }));
    tryIt.addEventListener('click', function () { if (k.off) { k.off = false; save(); } closeSheet(); ta.value = '/' + k.cmd + ' '; grow(); syncSend(); storeDraft(); ta.focus(); });
    var tabs = h('div', { class: 'sk-tabs' }, [['ov', 'Обзор'], ['src', 'Содержимое']].map(function (x) {
      var b = h('button', { type: 'button', class: x[0] === tab ? 'on' : '', text: x[1] }); b.addEventListener('click', function () { if (x[0] !== tab) openSkill(k, x[0]); }); return b;
    }));
    var del = twice('Удалить skill', 'Точно удалить? Нажми ещё раз', function () { var a = skillList(); a.splice(a.indexOf(k), 1); save(); openSkills(); toast('Skill удалён'); }, 'danger');
    var side = h('div', { class: 'sk-side' },
      h('p', { class: 'sk-k', text: 'Автор' }), h('p', { class: 'sk-v' }, icon('user'), h('span', { text: 'Вы' })),
      h('p', { class: 'sk-k', text: 'Команда' }), h('p', { class: 'sk-v' }, icon('bolt'), h('span', { text: '/' + k.cmd, raw: 1 })),
      h('p', { class: 'sk-k', text: 'Размер' }), h('p', { class: 'sk-v' }, icon('file'), h('span', { text: k.text.length + ' символов' })),
      h('p', { class: 'sk-k', text: 'Как вызвать' }), h('p', { class: 'sk-v dim', text: 'Напиши /' + k.cmd + ' в любом месте сообщения', raw: 1 }));
    var body = tab === 'ov'
      ? h('div', { class: 'sk-cols' }, h('div', { class: 'sk-main' }, h('p', { class: 'sk-k', text: 'Описание' }), h('p', { class: 'sk-desc', text: k.desc || k.text.slice(0, 200), raw: 1 }),
          h('p', { class: 'sk-k', text: 'Начало инструкции' }), h('p', { class: 'sk-desc dim', text: k.text.slice(0, 360) + (k.text.length > 360 ? '…' : ''), raw: 1 })), side)
      : h('pre', { class: 'sk-src' }, h('code', { text: k.text }));
    openSheet([
      back,
      h('div', { class: 'sk-head' },
        h('span', { class: 'sk-tile' }, icon('bolt')),
        h('div', { class: 'sk-ht' }, h('b', { text: k.name, raw: 1 }), (Date.now() - (k.at || 0) < 86400000) ? h('span', { class: 'plan-tag', text: 'Новое' }) : null,
          h('span', { class: 'sk-sub', text: 'вами · обновлено ' + ago(k.at) })),
        h('div', { class: 'sk-act' }, tryIt, on)),
      tabs, body, h('div', { class: 'group solo' }, del)
    ], true);
  }

  function openSkills() {
    if (wide() && !paneHost) { openSettingsWin('skills'); return; }
    var arr = skillList(), box = h('div', { class: 'group' });
    if (!arr.length) box.append(h('p', { class: 'cap pad', text: 'Пока нет skills. Загрузи файл .txt или .md.' }));
    arr.forEach(function (k, i) {
      var use = h('button', { class: 'sk-use', type: 'button' }, h('span', { class: 'sk-t' }, h('b', { text: k.name === k.cmd ? '/' + k.cmd : k.name, raw: 1 }), h('em', { text: (k.name === k.cmd ? '' : '/' + k.cmd + ' · ') + k.desc, raw: 1 })));
      use.addEventListener('click', function () { openSkill(k); });
      box.append(h('div', { class: 'grow sk' + (k.off ? ' off' : '') }, icon('bolt'), use, k.off ? h('span', { class: 'gv', text: 'выкл' }) : null, icon('chev')));
    });
    var add = h('button', { class: 'btn solid block', type: 'button' }, icon('plus'), h('span', { text: 'Добавить файл' }));
    add.addEventListener('click', function () { $('#skillfile').click(); });
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'Skills' }),
      h('p', { class: 'cap', text: 'Skill это готовая инструкция. Загрузи файл .txt или .md: первой строкой команда, дальше текст инструкции. ' }),
      h('pre', { class: 'sk-ex' }, h('code', { text: '/short-text\nОтвечай коротко: не больше трёх предложений, без вступлений.' })),
      h('p', { class: 'cap', text: 'Напиши команду в любом месте сообщения, например «расскажи про луну /short-text»: skill сработает на это сообщение. В следующем, без команды, его уже не будет.' }),
      h('div', { class: 'memhead' }, h('p', { class: 'glabel', text: 'Мои skills' }), h('span', { class: 'fcnt', text: arr.length + (lim().skills < 1e9 ? ' из ' + lim().skills : '') })),
      box, add
    ], true);
  }
  $('#skillfile').addEventListener('change', function (e) { addSkillFiles(e.target.files); e.target.value = ''; });

  /* ---------- меню «+» у поля ввода ---------- */
  var plusPop = null;
  function closePlus() { if (!plusPop) return; var p = plusPop; plusPop = null; p.classList.add('out'); setTimeout(function () { p.remove(); }, 180); $('#pick').classList.remove('on'); }
  function pickProjectForNew() {
    var c = curChat();
    if (c) { moveChat(c); return; }
    var box = h('div', { class: 'form' });
    var put = function (label, id) {
      var on = (S.pendingProject || null) === id;
      var b = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: label, raw: 1 }), on ? icon('check') : icon(id ? 'folder' : 'list'));
      b.addEventListener('click', function () { S.pendingProject = id; updateHeader(); closeSheet(); toast(id ? 'Новый чат будет в проекте' : 'Новый чат без проекта'); });
      box.append(b);
    };
    put('Без проекта', null);
    S.projects.forEach(function (p) { put(p.name, p.id); });
    box.append(h('button', { class: 'btn block ghost', type: 'button', text: '+ Новый проект', onclick: function () { projectForm(null); } }));
    openSheet([h('h2', { text: 'В проект' }), box]);
  }
  function openPlus() {
    if (plusPop) { closePlus(); return; }
    var item = function (label, ic, fn) { var b = h('button', { class: 'pi', type: 'button' }, icon(ic), h('span', { text: label })); b.addEventListener('click', function () { closePlus(); fn(); }); return b; };
    plusPop = h('div', { class: 'popmenu up', role: 'menu' },
      item('Фото', 'image', function () { $('#file').click(); }),
      item('Файлы', 'file', function () { $('#docfile').click(); }),
      item('Добавить в проект', 'folder', pickProjectForNew),
      item('Skills', 'bolt', openSkills),
      item('Память', 'brain', openMemory));
    var r = $('#pick').getBoundingClientRect();
    plusPop.style.left = Math.max(10, r.left) + 'px'; plusPop.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    document.body.append(plusPop); $('#pick').classList.add('on');
  }
  document.addEventListener('pointerdown', function (e) { if (plusPop && !plusPop.contains(e.target) && !e.target.closest('#pick')) closePlus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePlus(); });
  window.addEventListener('resize', closePlus);

  /* ---------- фото ---------- */
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function encode(im, side, q) {
    var w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, k = Math.min(1, side / Math.max(w0, h0));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // у png может быть прозрачный фон
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  function fileToAtt(file) {
    var url = URL.createObjectURL(file);
    return loadImg(url).then(function (im) {
      URL.revokeObjectURL(url);
      return { id: uid(), full: encode(im, 1024, 0.72), thumb: encode(im, 144, 0.55) };
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }
  var size = function (list) { return list.reduce(function (n, u) { return n + u.length; }, 0); };
  // если фото вместе тяжелее лимита, сжимаем сильнее
  function fitImages(list) {
    if (size(list) <= BUDGET) return Promise.resolve(list);
    var sides = [800, 640, 512, 400], qs = [0.62, 0.58, 0.52, 0.5];
    function step(n) {
      return Promise.all(list.map(function (u) { return loadImg(u).then(function (im) { return encode(im, sides[n], qs[n]); }); }))
        .then(function (out) { return (size(out) <= BUDGET || n === sides.length - 1) ? out : step(n + 1); });
    }
    return step(0);
  }

  function renderAtts() {
    var box = $('#atts');
    box.hidden = !atts.length;
    box.replaceChildren.apply(box, atts.map(function (a) {
      var x = h('button', { type: 'button', 'aria-label': 'убрать' }, icon('close'));
      x.addEventListener('click', function () { atts = atts.filter(function (o) { return o.id !== a.id; }); renderAtts(); syncSend(); });
      if (a.kind === 'file') { var dc = h('div', { class: 'att doc' }, icon('file'), h('span', { text: a.name }), x); dc.addEventListener('click', function (e) { if (!x.contains(e.target)) openPreview(a); }); return dc; }
      return h('div', { class: 'att' }, h('img', { src: a.thumb, alt: 'фото' }), x);
    }));
    measure();
  }
  var DOC_RE = /\.(txt|md|markdown|csv|tsv|json|log|xml|html?|css|js|ts|py|java|c|cpp|cs|go|rs|sql|ya?ml|ini|srt|tex|docx)$/i, MAX_FILE = 15000;   // потолок; реальный лимит символов зависит от тарифа: lim().chars
  function readDocx(file) {
    return file.arrayBuffer().then(function (buf) {
      var v = new DataView(buf), u8 = new Uint8Array(buf), i, eocd = -1;
      for (i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
      if (eocd < 0) throw new Error('zip');
      var n = v.getUint16(eocd + 10, true), p = v.getUint32(eocd + 16, true), dec = new TextDecoder();
      for (i = 0; i < n; i++) {
        var method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
        var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
        if (name === 'word/document.xml') {
          var lnl = v.getUint16(off + 26, true), lel = v.getUint16(off + 28, true), start = off + 30 + lnl + lel, data = u8.subarray(start, start + csize);
          if (method === 0) return dec.decode(data);
          if (typeof DecompressionStream === 'undefined') throw new Error('nods');
          var ds = new DecompressionStream('deflate-raw'), wr = ds.writable.getWriter(); wr.write(data); wr.close();
          return new Response(ds.readable).arrayBuffer().then(function (ab) { return dec.decode(ab); });
        }
        p += 46 + nl + el + cl;
      }
      throw new Error('nodoc');
    }).then(function (xml) {
      return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n');
    });
  }
  function readDoc(file) {
    return (/\.docx$/i.test(file.name) ? readDocx(file) : file.text()).then(function (t) {
      t = String(t).replace(/\u0000/g, '').trim();
      if (!t) throw new Error('empty');
      return { id: uid(), kind: 'file', name: file.name.slice(0, 60), text: t.slice(0, lim().chars), cut: t.length > lim().chars };
    });
  }
  var loading = 0;
  function addDocs(list) {
    var room = lim().files - atts.filter(function (a) { return a.kind === 'file'; }).length;
    if (room <= 0) { limitToast('На тарифе ' + planWord() + ' до ' + lim().files + ' ' + (lim().files === 1 ? 'файла' : 'файлов') + ' в сообщении'); return; }
    list.slice(0, room).forEach(function (f) {
      loading++; syncSend();
      readDoc(f).then(function (a) {
        atts.push(a); renderAtts();
        if (a.cut) toast('Файл длинный: прочитаю первые ' + money(lim().chars) + ' символов');
      }, function (e) {
        toast(e && e.message === 'nods' ? 'этот браузер не открывает docx' : e && e.message === 'empty' ? 'в файле нет текста' : 'не получилось прочитать «' + f.name + '»');
      }).then(function () { loading--; syncSend(); });
    });
  }
  function addFiles(files) {
    var all = Array.prototype.slice.call(files || []);
    var docs = all.filter(function (f) { return DOC_RE.test(f.name || '') && !/^image\//.test(f.type); });
    if (all.some(function (f) { return /\.pdf$/i.test(f.name || ''); })) toast('pdf пока не читаю: скопируй текст или пришли фото страницы');
    if (docs.length) addDocs(docs);
    return addImages(all);
  }
  function addImages(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name || ''); });
    if (!list.length) return;
    var room = lim().photos - atts.filter(function (a) { return !a.kind; }).length - loading;
    if (room <= 0) { limitToast('На тарифе ' + planWord() + ' до ' + lim().photos + ' фото в сообщении'); return; }
    if (list.length > room) { toast('взял только ' + room + ' из ' + list.length + ' фото'); list = list.slice(0, room); }
    loading += list.length; syncSend();
    Promise.all(list.map(function (f) {
      return fileToAtt(f).then(function (a) { atts.push(a); renderAtts(); }, function () { toast('не удалось открыть фото'); })
        .then(function () { loading--; syncSend(); });
    }));
  }
  $('#pick').append(icon('plus'));
  // голосовой ввод: если браузер не умеет, кнопка скрыта
  (function voice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $('#mic');
    if (!SR) { mic.hidden = true; return; }
    mic.append(icon('mic'));
    var rec = null, base = '';
    var stopRec = function () { if (rec) { try { rec.stop(); } catch (e) { /* уже остановлен */ } } };
    mic.addEventListener('click', function () {
      if (rec) { stopRec(); return; }
      rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = true;
      base = ta.value; mic.classList.add('rec');
      rec.onresult = function (e) {
        var txt = '', k; for (k = 0; k < e.results.length; k++) txt += e.results[k][0].transcript;
        ta.value = base + (base && !/\s$/.test(base) ? ' ' : '') + txt; grow(); syncSend();
      };
      rec.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('нет доступа к микрофону: разреши его или диктуй кнопкой на клавиатуре'); else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('голосовой ввод не сработал'); };
      rec.onend = function () { rec = null; mic.classList.remove('rec'); };
      try { rec.start(); } catch (e2) { rec = null; mic.classList.remove('rec'); toast('голосовой ввод недоступен'); }
    });
  })();
  $('#pick').addEventListener('click', openPlus);
  $('#file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  $('#docfile').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  document.addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); }); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }
  });
  var comp = $('#composer');
  ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); comp.classList.add('drop'); } }); });
  ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function () { comp.classList.remove('drop'); }); });
  document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  /* ---------- отправка ---------- */
  function syncSend() {
    sendBtn.disabled = !busy && (loading > 0 || (!ta.value.trim() && !atts.length));
    var was = sendBtn.getAttribute('data-dis');
    sendBtn.setAttribute('data-dis', sendBtn.disabled ? '1' : '0');
    if (was === '1' && !sendBtn.disabled) { sendBtn.classList.remove('pop'); void sendBtn.offsetWidth; sendBtn.classList.add('pop'); }
    var mode = busy ? 'stop' : 'arrowup';
    if (sendBtn.getAttribute('data-mode') !== mode) { sendBtn.setAttribute('data-mode', mode); sendBtn.replaceChildren(icon(mode)); sendBtn.setAttribute('aria-label', busy ? 'остановить' : 'отправить'); }
  }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 148) + 'px'; measure(); }

  /* время и фокус: тихие часы и напоминания о перерыве */
  var lastSend = 0, sessAt = 0;
  function tmin(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function quietNow() {
    var st = S.settings, days = st.quietDays;
    if (!days || !days.some(Boolean)) return false;
    var d = new Date(), t = d.getHours() * 60 + d.getMinutes(), a = tmin(st.quietFrom || '22:00'), b = tmin(st.quietTo || '07:00'), dow = d.getDay();
    if (a === b) return false;
    if (a < b) return !!days[dow] && t >= a && t < b;
    return (!!days[dow] && t >= a) || (!!days[(dow + 6) % 7] && t < b);
  }
  setInterval(function () {
    var m = +S.settings.breakMin || 0, now = Date.now();
    if (lastSend && now - lastSend > 10 * 60000) { sessAt = 0; lastSend = 0; }
    if (m > 0 && sessAt && now - sessAt >= m * 60000) { sessAt = now; toast('Пора сделать перерыв: ты общаешься уже ' + (m >= 60 ? (m / 60) + ' ч' : m + ' мин')); }
  }, 30000);
  function send(text) {
    if (busy || loading) return;
    text = String(text == null ? ta.value : text).trim();
    if (!text && !atts.length) return;
    if (quietNow()) { toast('Тихие часы: отправка отключена до ' + (S.settings.quietTo || '07:00')); return; }
    lastSend = Date.now(); if (!sessAt) sessAt = lastSend;
    clearError();
    var mm = /^\s*запомни(?:те)?[,:]?\s+(?:что\s+)?([\s\S]{3,200})$/i.exec(text);
    if (mm && S.settings.memOn !== false) addMemory(mm[1].trim().replace(/[.!\s]+$/, ''), true);
    var c = ensureChat(), first = !c.msgs.length;
    var pics = atts.filter(function (a) { return !a.kind; }), docs = atts.filter(function (a) { return a.kind === 'file'; });
    var m = { id: uid(), role: 'user', text: text, thumbs: pics.map(function (a) { return a.thumb; }), full: pics.map(function (a) { return a.full; }), files: docs.map(function (a) { return { name: a.name, text: a.text }; }) };
    c.msgs.push(m); c.updated = Date.now();
    if (first) c.title = makeTitle(text || (docs[0] ? docs[0].name : ''));
    save();
    delete drafts[draftKey]; ta.value = ''; draftKey = dKey(); storeDraft(); atts = []; renderAtts(); grow(); syncSend();
    hero.hidden = true; updateHeader();
    chat.append(msgEl(m, true)); showSkillbar(); closeSkillPop();
    toBottom(true);
    request();
  }

  // фото уходят с последним сообщением, где они были (если оно недавнее), чтобы можно было задавать уточнения
  function buildPayload(c) {
    var recent = c.msgs.slice(-15), imgAt = -1, fileAt = -1, out = [], outImg = -1;
    recent.forEach(function (m, i) {
      if (m.role !== 'user' || i < recent.length - 6) return;
      if (m.full && m.full.length) imgAt = i;
      if (m.files && m.files.length) fileAt = i;
    });
    recent.forEach(function (m, i) {
      var o = { role: m.role, content: m.text || '' }, note = '';
      if (m.role === 'user') { var so = skillOf(null, m.text); if (so && so.inline) o.content = so.rest || 'Выполни инструкцию навыка.'; }
      if (m.role === 'user' && m.files && m.files.length) {
        if (i === fileAt && m.files.some(function (f) { return f.text; })) {
          var share = Math.floor(15000 / m.files.length);
          m.files.forEach(function (f) {
            var t = (f.text || '').slice(0, share), parts = Math.max(1, Math.ceil(t.length / 3700)), k;
            for (k = 0; k < parts; k++) out.push({ role: 'user', content: 'Файл «' + f.name + '»' + (parts > 1 ? ' (часть ' + (k + 1) + ' из ' + parts + ')' : '') + ':\n' + t.slice(k * 3700, (k + 1) * 3700) });
          });
          if (!m.text) o.content = 'Прочитай файл и коротко расскажи, что в нём.';
        } else note = '[к сообщению был прикреплён файл: ' + m.files.map(function (f) { return f.name; }).join(', ') + ']';
      }
      if (m.role === 'user' && m.thumbs && m.thumbs.length) {
        if (i !== imgAt) note += (note ? ' ' : '') + '[к сообщению было прикреплено фото]';
        else if (!m.text) o.content = 'Что на этом фото?';
      }
      if (note) o.content = (o.content ? o.content + ' ' : '') + note;
      if (i === imgAt) outImg = out.length;
      out.push(o);
    });
    var lastU = null; for (var q = c.msgs.length - 1; q >= 0; q--) { if (c.msgs[q].role === 'user') { lastU = c.msgs[q]; break; } }
    var act = lastU ? skillOf(null, lastU.text) : null;
    if (act && out.length) {
      var at = out.length - 1;
      out.splice(at, 0, { role: 'user', content: 'Skill «' + act.skill.name + '». Следуй этим инструкциям в ответе на моё следующее сообщение:\n' + act.skill.text.slice(0, SK_MAX) });
      if (outImg >= at) outImg++;
    }
    return { list: out, imgAt: outImg, images: imgAt >= 0 ? recent[imgAt].full : [] };
  }

  var reqCtl = null, stopped = false;
  function stopGen() { stopped = true; if (reqCtl) reqCtl.abort(); }
  function request() {
    stopped = false;
    var c = curChat();
    if (!c || !c.msgs.length || c.msgs[c.msgs.length - 1].role !== 'user') return;
    busy = true; busyChat = c.id; syncSend(); clearError(); setThinking(true);
    var wantTitle = c.msgs.length === 1 && S.settings.autoTitle !== false, memOn = S.settings.memOn !== false;
    var p = buildPayload(c), instr = buildInstructions(c, (memOn ? '\nЕсли пользователь в последнем сообщении назвал о себе новый устойчивый факт (имя, город, работа, учёба, увлечения, предпочтения), добавь в самый конец ответа отдельной строкой [[memory: короткий факт, например: живёт в Астане]]. ' + (S.settings.memSens ? 'Деликатные темы (здоровье, вера) сохранять можно, номера документов и карт никогда.' : 'Здоровье, деньги, политику, религию и документы не сохраняй.') + ' Нет нового факта: ничего не добавляй.' : '') + (wantTitle ? '\nВ самом конце ответа, с новой строки, добавь служебную метку [[title: название]]: короткое название этого чата из 2-4 слов по смыслу (например: Приветствие, План тренировок, Рецепт борща), без кавычек и точки.' : ''));
    var here = function () { return S.cur === c.id; };
    fitImages(p.images).then(function (imgs) {
      if (p.imgAt >= 0) p.list[p.imgAt].images = imgs;
      if (stopped) { var ab = new Error('stop'); ab.name = 'AbortError'; throw ab; }
      var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 75000);
      reqCtl = ctl;
      var body = { mode: 'chat', messages: p.list, device: device };
      if (instr) body.instructions = instr;
      if (subCode) body.code = subCode;
      return fetch(API, {
        method: 'POST', headers: authHdr(), signal: ctl ? ctl.signal : undefined, body: JSON.stringify(body)
      }).then(function (r) { clearTimeout(timer); return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, st: r.status, j: j }; }); },
        function (e) { clearTimeout(timer); throw e; });
    }).then(function (x) {
      if (here()) setThinking(false);
      if (x.ok && x.j.answer) {
        var ansText = String(x.j.answer);
        var facts = [], ttl = '';
        ansText = ansText.replace(/\[\[\s*(title|название|memory|память)\s*:\s*([^\]\n]{1,200}?)\s*(?:\]\]|\]|$)/gim, function (_, k, v) {
          v = v.replace(/^["«»“”]+|["«»“”.]+$/g, '').trim();
          if (v) { if (/^(title|название)$/i.test(k)) ttl = v; else facts.push(v); }
          return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        if (wantTitle && ttl) { c.title = ttl.charAt(0).toUpperCase() + ttl.slice(1); updateHeader(); var tt = $('#title'); tt.classList.remove('tchg'); void tt.offsetWidth; tt.classList.add('tchg'); }
        if (memOn && facts.length) { var added = false; facts.slice(0, 2).forEach(function (f) { if (addMemory(f.charAt(0).toUpperCase() + f.slice(1), false, true)) added = true; }); if (added) memNotice(); }
        var m = { id: uid(), at: Date.now(), role: 'assistant', text: ansText || String(x.j.answer), thumbs: [] };
        c.msgs.push(m); c.updated = Date.now(); save();
        if (typeof x.j.left === 'number') { setLeft(x.j); showLeft(); }
        if (here()) {
          var el = msgEl(m, true); chat.append(el);
          requestAnimationFrame(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        } else toast('ответ готов в чате «' + c.title + '»');
        if (p.images.length && !x.j.vision) toast('ответ без фото: воркер ещё не обновлён');
        return;
      }
      var j = x.j || {}, msg;
      var plans = false;
      if (x.st === 429) {
        setLeft({ left: 0, reset: j.reset, full: j.full }, j.plan); showLeft(); var until = j.reset ? ' (следующее сообщение в ' + hm(j.reset) + ')' : '';
        msg = (sub ? 'лимит на 12 часов исчерпан' + until + '. можно взять тариф побольше' : 'лимит на 12 часов исчерпан' + until + '. или возьми тариф'); plans = true;
      }
      else if (j.error === 'code' || j.error === 'expired') {
        msg = j.error === 'expired' ? 'тариф закончился. можно продлить в тарифах' : 'код активации не найден. введи его заново в тарифах';
        subCode = ''; sub = null; ls.del ? ls.del(KEY_CODE) : ls.set(KEY_CODE, ''); ls.set(KEY_SUB, 'null'); lastLeft = null; showLeft(); plans = true;
      }
      else if (x.st === 413) msg = 'фото слишком тяжёлые. убери одно или пришли поменьше';
      else if (x.st === 403) msg = 'воркер не пускает этот сайт (' + location.origin + '). добавь его в ALLOWED_ORIGINS';
      else if (j.error === 'mode') msg = 'в воркере нет режима chat: задеплой worker/full-worker.js';
      else msg = 'не получилось ответить: ' + (j.detail || j.error || x.st);
      if (here()) showError(msg, plans); else toast(msg);
    }).catch(function (e) {
      if (here()) setThinking(false);
      if (stopped) { toast('остановил'); return; }
      var msg = e && e.name === 'AbortError' ? 'ответ идёт слишком долго, попробуй ещё раз' : 'нет связи с воркером. проверь интернет';
      if (here()) showError(msg); else toast(msg);
    }).then(function () { busy = false; busyChat = null; reqCtl = null; stopped = false; syncSend(); });
  }

  sendBtn.addEventListener('click', function () { if (busy) stopGen(); else send(); });
  ta.addEventListener('input', function () { grow(); syncSend(); storeDraft(); skillHint(); });
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  ta.addEventListener('keydown', function (e) {
    // на компьютере enter отправляет, shift+enter новая строка; на телефоне enter это новая строка
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing && S.settings.enterSend !== false) { e.preventDefault(); send(); }
  });

  /* ---------- кнопка «вниз» ---------- */
  var downBtn = h('button', { class: 'downbtn', type: 'button', 'aria-label': 'вниз' }, icon('down'));
  document.body.append(downBtn);
  downBtn.addEventListener('click', function () { toBottom(true); });
  var downTick = 0;
  window.addEventListener('scroll', function () {
    if (downTick) return;
    downTick = requestAnimationFrame(function () {
      downTick = 0;
      var far = document.documentElement.scrollHeight - window.scrollY - window.innerHeight > 420;
      downBtn.classList.toggle('show', far && !!curMsgs().length);
    });
  }, { passive: true });

  /* ---------- шапка, подсказки, клавиатура, заставка ---------- */
  $('#ver').textContent = 'DDX AI ' + VERSION;
  $('#chats').append(icon('list')); $('#chats').addEventListener('click', function () { openChats(); });
  $('#newchat').append(icon('plus')); $('#newchat').addEventListener('click', function () { newChat(S.cur ? (curChat() || {}).project : S.pendingProject); });
  $('#left').addEventListener('click', function () { openPlans(); });
  $('#more').append(icon('more'));
  // выпадающее меню действий с чатом (три точки в шапке)
  var popEl = null;
  function closePop() { if (!popEl) return; var p = popEl; popEl = null; p.classList.add('out'); setTimeout(function () { p.remove(); }, 180); $('#more').classList.remove('on'); }
  function openProfile() {
    if (popEl) { closePop(); return; }
    var foot = document.querySelector('.sfoot'); if (!foot) return;
    var nm = (S.settings.name || '').trim();
    var planName = sub ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Free';
    var go = function (fn) { return function () { closePop(); setDrawer(false); fn(); }; };
    var item = function (label, ic, fn, val) {
      var b = h('button', { class: 'pi', type: 'button' }, icon(ic), h('span', { text: label }), val ? h('em', { class: 'pv', text: val, raw: 1 }) : document.createTextNode(''));
      b.addEventListener('click', go(fn)); return b;
    };
    var open2 = function (sec, fn) { return wide() ? function () { openSettingsWin(sec); } : fn; };
    var mail = h('div', { class: 'pmail' }, h('span', { text: acct && acct.user ? acct.user.login : (nm || 'DDX AI'), raw: 1 }), h('em', { text: planName, raw: 1 }));
    popEl = h('div', { class: 'popmenu up prof', role: 'menu' },
      mail,
      item('Изменить имя', 'edit', openRename),
      item('Настройки', 'gear', openMenu, wide() ? 'Ctrl+,' : ''),
      item('Персонализация', 'user', open2('pers', openPersonal)),
      item('Память', 'brain', open2('memory', openMemory)),
      item('Skills', 'bolt', open2('skills', openSkills)),
      item('Использование', 'gauge', open2('usage', openUsage)),
      h('i', { class: 'psep' }),
      item(sub ? 'Сменить тариф' : 'Улучшить тариф', 'arrowup', open2('plans', function () { openPlans(); })),
      h('i', { class: 'psep' }),
      acct ? item('Выйти', 'out', function () { api('/auth/logout', {}).then(function () {}, function () {}); dropAcct('Ты вышел из аккаунта'); }) : item('Войти', 'user', open2('account', function () { openAuth('in'); })));
    var r = foot.getBoundingClientRect();
    popEl.style.left = (r.left + 4) + 'px'; popEl.style.width = (r.width - 8) + 'px'; popEl.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    document.body.append(popEl);
  }
  function openPop() {
    var c = curChat();
    if (popEl) { closePop(); return; }
    var item = function (label, ic, fn, cls) {
      var b = h('button', { class: 'pi' + (cls ? ' ' + cls : ''), type: 'button' }, icon(ic), h('span', { text: label }));
      b.addEventListener('click', function () { fn(b); }); return b;
    };
    if (!c) {
      popEl = h('div', { class: 'popmenu', role: 'menu' },
        item('Новая сессия', 'edit', function () { closePop(); newChat(S.pendingProject); }),
        item('Добавить в проект', 'folder', function () { closePop(); pickProjectForNew(); }),
        item('Skills', 'bolt', function () { closePop(); openSkills(); }),
        item('Настройки', 'gear', function () { closePop(); openMenu(); }));
      var r0 = $('#more').getBoundingClientRect();
      popEl.style.top = (r0.bottom + 8) + 'px'; popEl.style.right = Math.max(10, window.innerWidth - r0.right) + 'px';
      document.body.append(popEl); $('#more').classList.add('on'); return;
    }
    var pr = projectById(c.project), armed = false;
    popEl = h('div', { class: 'popmenu', role: 'menu' },
      item('Новая сессия', 'edit', function () { closePop(); newChat(c.project); }),
      item(c.pinned ? 'Открепить' : 'Закрепить', 'pin', function () { closePop(); if (togglePin(c)) toast(c.pinned ? 'Чат закреплён' : 'Чат откреплён'); }),
      item('Поделиться', 'share', function () { closePop(); shareText(chatText(c), c.title); }),
      item('Переименовать', 'tag', function () { closePop(); renameChat(c); }),
      item(pr ? 'Перенести в проект' : 'Добавить в проект', 'folder', function () { closePop(); moveChat(c); }),
      h('i', { class: 'psep' }),
      item('Удалить', 'trash', function (b) {
        if (!armed) { armed = true; b.querySelector('span').textContent = 'Точно удалить?'; b.classList.add('armed'); setTimeout(function () { armed = false; if (b.isConnected) { b.querySelector('span').textContent = 'Удалить'; b.classList.remove('armed'); } }, 3000); return; }
        closePop(); deleteChat(c);
      }, 'danger'));
    var r = $('#more').getBoundingClientRect();
    popEl.style.top = (r.bottom + 8) + 'px'; popEl.style.right = Math.max(10, window.innerWidth - r.right) + 'px';
    document.body.append(popEl); $('#more').classList.add('on');
  }
  $('#more').addEventListener('click', function (e) { e.stopPropagation(); openPop(); });
  document.addEventListener('pointerdown', function (e) { if (popEl && !popEl.contains(e.target) && !e.target.closest('#more, .sfoot')) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', closePop);
  $('#menu').append(icon('gear')); $('#menu').addEventListener('click', openMenu);
  HINTS.forEach(function (q, i) {
    $('#chips').append(h('button', { class: 'chip', type: 'button', text: q, onclick: function () { if (i === HINTS.length - 1) $('#file').click(); else send(q); } }));
  });

  // высота строки ввода нужна, чтобы чат не уходил под неё
  function measure() { document.documentElement.style.setProperty('--cph', Math.round($('#composer').getBoundingClientRect().height) + 'px'); }
  if (window.ResizeObserver) new ResizeObserver(measure).observe($('#composer'));
  window.addEventListener('resize', measure);

  // высота клавиатуры: строка ввода едет вместе с ней
  if (window.visualViewport) {
    var vv = window.visualViewport, raf = 0;
    var kb = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px');
      });
    };
    vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb); window.addEventListener('scroll', kb, { passive: true }); kb();
  }
  ta.addEventListener('focus', function () { document.body.classList.add('typing'); setTimeout(function () { toBottom(true); }, 320); });
  ta.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== ta) document.body.classList.remove('typing'); }, 60); });

  // горячие клавиши на компьютере: ctrl/cmd+k поиск по чатам, / в поле ввода, ctrl/cmd+shift+o не трогаем (занято браузером)
  document.addEventListener('keydown', function (e) {
    var typing = /^(input|textarea)$/i.test((document.activeElement || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (wide() && sideUI) sideUI.show(); else openChats();
    } else if (e.key === '/' && !typing && sheet.hidden) { e.preventDefault(); ta.focus(); }
  });
  buildSide();
  load(); renderAll(); renderAtts(); grow(); syncSend(); measure();
  if (acct) syncDown(true);
  refreshSide();
  toBottom(false);

  var splash = $('#splash');
  $('#splash-logo').append(logo('logo big'));
  setTimeout(function () { splash.classList.add('out'); setTimeout(function () { splash.remove(); }, 900); }, 1000);
})();
