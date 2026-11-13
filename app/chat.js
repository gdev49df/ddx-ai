/* DDX AI: чат с фото. работает через воркер ddx-ai (режим chat), ключ groq лежит только в воркере.
   история хранится на телефоне; фото в истории остаются маленькими превью. */
(function () {
  'use strict';

  // адрес воркера
  var API = 'https://ddx-ai.wsmp.workers.dev/';
  var VERSION = 'v1.2';
  var KEY = 'wchat3', KEY_V2 = 'wchat2', KEY_OLD = 'wchat', KEY_DEV = 'wchat-dev', KEY_LEFT = 'wchat-left', KEY_CODE = 'wchat-code', KEY_SUB = 'wchat-sub', WA = '77751213271';
  var MAX_IMG = 4;          // фото в одном сообщении
  var BUDGET = 440000;      // символов base64 на все фото одного запроса (воркер принимает до 600 кб всего)
  var HINTS = ['объясни, как работает инфляция', 'идея подарка до 10 000 ₸', 'план тренировок на неделю', 'что на фото? прикрепи снимок'];

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- мелкие помощники ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
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
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3L18 18M18 6l-1.7 1.7M7.7 16.3L6 18"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    list: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    chat: '<path d="M5 6.5a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 5 13.5z"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
    plus: '<path d="M12 4.5v15M4.5 12h15"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    down: '<path d="M6 9.5l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5"/>',
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
  var S = { chats: [], projects: [], cur: null, pendingProject: null, open: {}, settings: { name: '', about: '', style: 'normal', extra: '' } };
  var atts = [], busy = false, busyChat = null, thinkEl = null, errEl = null, lastLeft = null, subCode = '', sub = null;
  var device = ls.get(KEY_DEV);
  if (!device) { device = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); ls.set(KEY_DEV, device); }

  var curChat = function () { return S.cur ? S.chats.filter(function (c) { return c.id === S.cur; })[0] || null : null; };
  var projectById = function (id) { return id ? S.projects.filter(function (p) { return p.id === id; })[0] || null : null; };
  var curMsgs = function () { var c = curChat(); return c ? c.msgs : []; };

  function cleanMsgs(list) {
    return (Array.isArray(list) ? list : []).filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
      .map(function (m) { return { id: uid(), role: m.role, text: String(m.text != null ? m.text : (m.content || '')), thumbs: Array.isArray(m.thumbs) ? m.thumbs : [] }; });
  }
  function load() {
    var d = null;
    try { d = JSON.parse(ls.get(KEY) || 'null'); } catch (e) { d = null; }
    if (d && Array.isArray(d.chats)) {
      S.chats = d.chats.map(function (c) {
        return { id: c.id || uid(), title: String(c.title || 'чат'), pinned: !!c.pinned, project: c.project || null, created: c.created || Date.now(), updated: c.updated || Date.now(), msgs: cleanMsgs(c.msgs) };
      });
      S.projects = (Array.isArray(d.projects) ? d.projects : []).map(function (p) { return { id: p.id || uid(), name: String(p.name || 'проект'), instructions: String(p.instructions || ''), created: p.created || Date.now() }; });
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
    try { var l = JSON.parse(ls.get(KEY_LEFT) || 'null'); if (l && (l.day === dayStr() || (l.plan && l.plan !== 'free'))) lastLeft = l; } catch (e3) { /* нет данных */ }
    subCode = ls.get(KEY_CODE) || '';
    try { sub = subCode ? JSON.parse(ls.get(KEY_SUB) || 'null') : null; } catch (e4) { sub = null; }
  }
  function pack(stripThumbs) {
    return JSON.stringify({
      v: 3, cur: S.cur, open: S.open, settings: S.settings, projects: S.projects,
      chats: S.chats.slice(0, 150).map(function (c) {
        return { id: c.id, title: c.title, pinned: c.pinned, project: c.project, created: c.created, updated: c.updated,
          msgs: c.msgs.slice(-80).map(function (m) { return { role: m.role, text: m.text, thumbs: stripThumbs ? [] : (m.thumbs || []) }; }) };
      })
    });
  }
  function save() {
    refreshSide();
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
  function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function mdBlock(text) {
    var root = h('div', { class: 'md' }), lines = String(text || '').replace(/\r/g, '').split('\n'), i = 0, list = null, ordered = false;
    while (i < lines.length) {
      var line = lines[i].trim(), m;
      if (/^```/.test(line)) {
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
        i++; list = null;
        root.append(h('pre', null, h('code', { text: code.join('\n') })));
        continue;
      }
      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].indexOf('-') >= 0) {
        var head = cells(line), body = []; i += 2; list = null;
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { body.push(cells(lines[i])); i++; }
        var thead = h('tr'), tbody = h('tbody');
        head.forEach(function (c) { thead.append(mdInline(c, h('th'))); });
        body.forEach(function (r) { var tr = h('tr'); head.forEach(function (_, j) { tr.append(mdInline(r[j] || '', h('td'))); }); tbody.append(tr); });
        root.append(h('div', { class: 'tbl' }, h('table', null, h('thead', null, thead), tbody)));
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
    while (walker.nextNode()) { if (!walker.currentNode.parentElement.closest('pre')) nodes.push(walker.currentNode); }
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
      if (m.text) el.append(h('p', { text: m.text }));
      if (fresh) el.classList.add('rise');
    } else {
      el = h('div', { class: 'msg ai' }, mdBlock(m.text));
      var copy = h('button', { class: 'link', type: 'button' }, icon('copy'), h('span', { text: 'копировать' }));
      copy.addEventListener('click', function () {
        var done = function () { copy.replaceChildren(icon('check'), h('span', { text: 'скопировано' })); setTimeout(function () { copy.replaceChildren(icon('copy'), h('span', { text: 'копировать' })); }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, function () { toast('не получилось скопировать'); });
        else toast('копирование недоступно');
      });
      el.append(h('div', { class: 'msg-actions' }, copy));
      if (fresh) { streamWords(el); if (m.text.length > 700) el.classList.add('plain'); }
    }
    return el;
  }

  // шапка показывает название открытого чата и проект
  function updateHeader() {
    var c = curChat(), pr = projectById(c ? c.project : S.pendingProject);
    $('#title').textContent = c ? c.title : 'DDX AI';
    $('#kicker').textContent = pr ? pr.name : (c ? 'чат' : 'личный помощник');
    $('#hero-cap').textContent = pr
      ? 'проект «' + pr.name + '»: чат учитывает его контекст. спроси что угодно или пришли фото.'
      : 'спроси что угодно или пришли фото: разберу, объясню, переведу, помогу придумать.';
  }
  function showHero() { hero.hidden = !!(curMsgs().length || thinkEl); }
  function renderAll() {
    thinkEl = null; errEl = null;
    chat.replaceChildren();
    curMsgs().forEach(function (m) { chat.append(msgEl(m, false)); });
    updateHeader();
    if (busy && busyChat && busyChat === S.cur) setThinking(true, true);
    showHero(); showLeft();
  }
  function toBottom(smooth) { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

  function showLeft() {
    var el = $('#left');
    if (!lastLeft) { el.hidden = true; return; }
    el.hidden = false;
    var paid = sub && lastLeft.plan && lastLeft.plan !== 'free';
    el.textContent = (paid ? 'тариф ' + sub.plan + ': осталось ' : 'сообщений на сегодня: осталось ') + lastLeft.left + (lastLeft.limit ? ' из ' + lastLeft.limit : '') + (paid ? (sub.period === 'year' ? ' на год' : ' в этом месяце') : '');
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
  function openSheet(nodes, tall) {
    panel.replaceChildren.apply(panel, nodes);
    panel.classList.toggle('tall', !!tall);
    panel.scrollTop = 0;
    sheet.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('show'); }); });
  }
  function closeSheet() {
    sheet.classList.remove('show'); document.body.classList.remove('lock');
    setTimeout(function () { if (!sheet.classList.contains('show')) sheet.hidden = true; }, 540);
  }
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); closeView(); } });

  var toastTimer = 0;
  function toast(text) {
    var t = $('#toast'); t.textContent = text; t.hidden = false;
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
      if (!armed) { armed = true; b.firstChild.textContent = sure; setTimeout(function () { armed = false; b.firstChild.textContent = label; }, 3500); return; }
      fn();
    });
    return b;
  }
  function backLink(fn) { return h('button', { class: 'link back', type: 'button', text: '← назад', onclick: fn }); }
  function field(tag, attrs) { return h(tag, Object.assign({ class: tag === 'textarea' ? 'area' : 'field', autocomplete: 'off', autocapitalize: 'off' }, attrs)); }
  var byUpdated = function (a, b) { return b.updated - a.updated; };

  /* ---------- чаты, проекты, закрепление ---------- */
  function newChat(projectId) {
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
    S.chats = S.chats.filter(function (x) { return x.id !== c.id; });
    if (S.cur === c.id) S.cur = null;
    save(); renderAll();
  }

  function chatRow(c) {
    var pr = projectById(c.project);
    var main = h('button', { class: 'row-main', type: 'button', onclick: function () { openChat(c.id); closeSheet(); } },
      h('span', { class: 'row-t', text: c.title }), h('span', { class: 'row-m', text: (pr ? pr.name + ' · ' : '') + when(c.updated) }));
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
      else if (!e.target.closest || !e.target.closest('pre, table, textarea, input, .atts, .pics')) start = 'open';
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

  function buildSide() {
    var side = $('#side');
    var input = field('input', { type: 'search', placeholder: 'поиск по чатам', 'aria-label': 'поиск', enterkeyhint: 'search' });
    var searchBox = h('div', { class: 'ssearch' }, input); searchBox.hidden = true;
    var body = h('div', { class: 'sbody' });
    var foot = h('div', { class: 'sfoot' });
    var nav = function (ic, label, fn, cls) {
      var b = h('button', { class: 'snav' + (cls ? ' ' + cls : ''), type: 'button' }, icon(ic), h('span', { text: label })); b.addEventListener('click', fn); return b;
    };
    var showSearch = function () { searchBox.hidden = false; input.focus(); input.select(); };
    var srow = function (c, pin) {
      var more = h('button', { class: 'srow-more', type: 'button', 'aria-label': 'действия' }, icon('more'));
      more.addEventListener('click', function (e) { e.stopPropagation(); chatMenu(c); });
      var main = h('button', { class: 'srow-main', type: 'button', title: c.title }, pin ? icon('chat') : null, h('span', { text: c.title }));
      main.addEventListener('click', function () { openChat(c.id); closeSheet(); setDrawer(false); });
      return h('div', { class: 'srow' + (c.id === S.cur ? ' cur' : '') }, main, more);
    };
    var section = function (key, label, items) {
      var off = !!S.open['s-' + key];
      var head = h('button', { class: 'shead', type: 'button' }, h('span', { text: label }), h('span', { class: 'ch' + (off ? '' : ' open') }, icon('down')));
      var box = h('div', { class: 'sitems' }); box.hidden = off;
      items.forEach(function (n) { box.append(n); });
      head.addEventListener('click', function () {
        S.open['s-' + key] = !S.open['s-' + key]; save();
        box.hidden = !!S.open['s-' + key]; head.lastChild.classList.toggle('open', !S.open['s-' + key]);
      });
      return [head, box];
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
        var pinned = S.chats.filter(function (c) { return c.pinned; }).sort(byUpdated);
        if (pinned.length) add(section('pin', 'закреплённые', pinned.map(function (c) { return srow(c, true); })));
        var projs = S.projects.slice().sort(function (a, b) { return b.created - a.created; }).map(function (p) {
          var chats = S.chats.filter(function (c) { return c.project === p.id; }).sort(byUpdated);
          var kids = h('div', { class: 'skids' }); kids.hidden = !S.open[p.id];
          chats.forEach(function (c) { kids.append(srow(c, false)); });
          kids.append(h('button', { class: 'snew', type: 'button', text: '+ чат в проекте', onclick: function () { newChat(p.id); closeSheet(); setDrawer(false); } }));
          var ch = h('span', { class: 'ch' + (S.open[p.id] ? ' open' : '') }, icon('down'));
          var main = h('button', { class: 'srow-main', type: 'button' }, icon('folder'), h('span', { text: p.name }), ch);
          main.addEventListener('click', function () { S.open[p.id] = !S.open[p.id]; save(); kids.hidden = !S.open[p.id]; ch.classList.toggle('open', !!S.open[p.id]); });
          var more = h('button', { class: 'srow-more', type: 'button', 'aria-label': 'проект' }, icon('more'));
          more.addEventListener('click', function (e) { e.stopPropagation(); projectForm(p); });
          return h('div', { class: 'sproj' }, h('div', { class: 'srow' }, main, more), kids);
        });
        if (projs.length) add(section('proj', 'проекты', projs));
        var rest = S.chats.filter(function (c) { return !c.pinned && !c.project; }).sort(byUpdated);
        if (rest.length) add(section('rec', 'недавние', rest.map(function (c) { return srow(c, false); })));
        else if (!S.chats.length) body.append(h('p', { class: 'cap', text: 'пока нет чатов. напиши первый вопрос.' }));
      }
      var nm = (S.settings.name || '').trim();
      foot.replaceChildren(
        h('span', { class: 'sava', text: (nm || 'D').charAt(0).toUpperCase() }),
        h('span', { class: 'sname', text: nm || 'DDX AI' }), sub ? h('span', { class: 'stag', text: sub.plan }) : document.createTextNode(''),
        h('button', { class: 'spill', type: 'button', onclick: function () { newChat(null); closeSheet(); setDrawer(false); } }, icon('plus'), h('span', { text: 'новый чат' })),
        (function () { var g = h('button', { class: 'srow-more on', type: 'button', 'aria-label': 'меню' }, icon('gear')); g.addEventListener('click', function () { setDrawer(false); openMenu(); }); return g; })());
    };
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
        nav('star', 'подписки', function () { setDrawer(false); openPlans(); })),
      searchBox, body, foot);
    sideUI = { input: input, fill: fill, show: showSearch };
  }

  function chatMenu(c) {
    var opt = function (label, ic, fn) { var b = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: label }), icon(ic)); b.addEventListener('click', fn); return b; };
    var pr = projectById(c.project);
    openSheet([
      backLink(function () { listsHome(); }),
      h('h2', { text: c.title }),
      h('p', { class: 'cap', text: (pr ? 'проект «' + pr.name + '» · ' : '') + c.msgs.length + ' сообщ.' }),
      h('div', { class: 'form' },
        opt(c.pinned ? 'открепить' : 'закрепить', 'pin', function () { c.pinned = !c.pinned; save(); listsHome(); }),
        opt('переименовать', 'edit', function () { renameChat(c); }),
        opt(pr ? 'перенести в другой проект' : 'в проект', 'folder', function () { moveChat(c); }),
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
      S.projects = S.projects.filter(function (x) { return x.id !== p.id; }); save(); updateHeader(); listsHome();
    }, 'danger'));
    openSheet(nodes);
  }

  /* ---------- персонализация и настройки ---------- */
  var STYLES = [['short', 'коротко'], ['normal', 'обычно'], ['long', 'подробно']];
  function openPersonal() {
    var st = S.settings, style = st.style || 'normal';
    var name = field('input', { type: 'text', maxlength: '40', placeholder: 'как к тебе обращаться', value: st.name || '', 'aria-label': 'имя' });
    var about = field('textarea', { rows: '4', maxlength: '500', placeholder: 'чем занимаешься, что интересно, что важно знать обо мне', 'aria-label': 'о тебе' });
    var extra = field('textarea', { rows: '4', maxlength: '600', placeholder: 'свои правила для ответов: например «без воды», «примеры из жизни», «отвечай на казахском»', 'aria-label': 'свои инструкции' });
    about.value = st.about || ''; extra.value = st.extra || '';
    var seg = h('div', { class: 'seg' }, STYLES.map(function (x) {
      var b = h('button', { type: 'button', class: x[0] === style ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () { style = x[0]; seg.querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); }); });
      return b;
    }));
    var ok = function () {
      S.settings = { name: name.value.trim(), about: about.value.trim(), style: style, extra: extra.value.trim() };
      save(); closeSheet(); toast('сохранено');
    };
    openSheet([backLink(openMenu), h('h2', { text: 'персонализация' }),
      h('p', { class: 'cap', text: 'ии учитывает это во всех чатах. хранится только на твоём телефоне и отправляется вместе с вопросом.' }),
      h('div', { class: 'form' },
        h('p', { class: 'label', text: 'имя' }), name,
        h('p', { class: 'label', text: 'о тебе' }), about,
        h('p', { class: 'label', text: 'длина ответов' }), seg,
        h('p', { class: 'label', text: 'свои инструкции' }), extra,
        h('button', { class: 'btn solid block', type: 'button', text: 'сохранить', onclick: ok }))]);
  }
  // то, что уходит в воркер вместе с вопросом
  function buildInstructions(c) {
    var st = S.settings, out = [];
    if (st.name) out.push('Пользователя зовут ' + st.name + '.');
    if (st.about) out.push('О пользователе: ' + st.about);
    if (st.style === 'short') out.push('Отвечай максимально коротко.');
    if (st.style === 'long') out.push('Отвечай подробно, с пояснениями и примерами.');
    if (st.extra) out.push('Пожелания пользователя к ответам: ' + st.extra);
    var pr = projectById(c ? c.project : null);
    if (pr) out.push('Этот чат лежит в проекте «' + pr.name + '».' + (pr.instructions ? ' Контекст и правила проекта: ' + pr.instructions : ''));
    out.push('Не используй latex и знаки доллара для формул: пиши математику обычным текстом и символами (², √, ·, ×, ≤, дроби через /).');
    return out.join('\n').slice(0, 1990);
  }


  /* ---------- подписки ---------- */
  var PLANS = [
    { id: 'free', name: 'free', price: 0, line: '20 сообщений в день', year: '' },
    { id: 'pro', name: 'pro', price: 1090, limit: 300 },
    { id: 'max', name: 'max', price: 5990, limit: 1500 },
    { id: 'ultra', name: 'ultra', price: 11990, limit: 5000 }
  ];
  var money = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  function openPlans(period) {
    var year = period === 'year';
    var seg = h('div', { class: 'seg two' }, [['month', 'месяц'], ['year', 'год · ×10']].map(function (x) {
      var b = h('button', { type: 'button', class: (x[0] === 'year') === year ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () { openPlans(x[0]); });
      return b;
    }));
    var cards = PLANS.map(function (p) {
      var cur = sub ? sub.plan === p.id : p.id === 'free';
      var price = p.price ? money(p.price * (year ? 10 : 1)) + ' ₸ / ' + (year ? 'год' : 'месяц') : 'бесплатно';
      var line = p.limit ? money(p.limit * (year ? 10 : 1)) + (year ? ' сообщений на год' : ' сообщений в месяц') : p.line;
      var msg = 'Здравствуйте! Хочу купить подписку DDX AI ' + p.name + ' на ' + (year ? 'год' : 'месяц') + ' (' + money(p.price * (year ? 10 : 1)) + ' ₸).';
      return h('div', { class: 'plan' + (cur ? ' cur' : '') },
        h('div', { class: 'plan-h' }, h('span', { class: 'plan-n', text: p.name }), cur ? h('span', { class: 'plan-tag', text: 'у тебя' }) : null),
        h('p', { class: 'plan-p', text: price }), h('p', { class: 'plan-l', text: line }),
        p.price ? h('a', { class: 'btn solid block', href: 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'купить' }) : null);
    });
    var code = field('input', { type: 'text', placeholder: 'код подписки', 'aria-label': 'код подписки', autocapitalize: 'characters', spellcheck: 'false' });
    var note = h('p', { class: 'cap', text: 'после оплаты в ватсап пришлют код. введи его здесь.' });
    var go = h('button', { class: 'btn', type: 'button', text: 'активировать' });
    go.addEventListener('click', function () {
      var v = code.value.trim().toUpperCase(); if (!v) return;
      go.disabled = true; note.textContent = 'проверяю…';
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sub', device: device, code: v }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          go.disabled = false;
          if (x.ok && x.j.plan) {
            subCode = v; sub = { plan: x.j.plan, period: x.j.period, exp: x.j.exp };
            ls.set(KEY_CODE, subCode); ls.set(KEY_SUB, JSON.stringify(sub));
            lastLeft = { day: dayStr(), left: x.j.left, limit: x.j.limit, plan: x.j.plan }; ls.set(KEY_LEFT, JSON.stringify(lastLeft));
            showLeft(); refreshSide(); toast('подписка ' + x.j.plan + ' включена'); openPlans(sub.period);
          } else note.textContent = x.j.error === 'expired' ? 'эта подписка уже закончилась' : x.j.error === 'mode' ? 'воркер ещё не обновлён: задеплой worker/full-worker.js' : 'такого кода нет. проверь, что ввёл его без ошибок';
        }, function () { go.disabled = false; note.textContent = 'нет связи с воркером'; });
    });
    var off = sub ? twice('отключить код на этом устройстве', 'точно? нажми ещё раз', function () {
      subCode = ''; sub = null; ls.set(KEY_CODE, ''); ls.set(KEY_SUB, 'null'); lastLeft = null; showLeft(); refreshSide(); openPlans(period);
    }) : null;
    openSheet([
      backLink(function () { if (wide()) closeSheet(); else openMenu(); }),
      h('h2', { text: 'подписки' }),
      seg,
      h('div', { class: 'plans' }, cards),
      h('p', { class: 'label', text: 'уже купил' }),
      h('div', { class: 'row-in' }, code, go), note, off], true);
  }

  function openMenu() {
    var cur = (window.WTheme && WTheme.mode()) || 'dark';
    var seg = h('div', { class: 'seg' }, [['dark', 'тёмная'], ['light', 'светлая'], ['auto', 'авто']].map(function (x) {
      var b = h('button', { type: 'button', class: x[0] === cur ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () { WTheme.set(x[0], true); seg.querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); }); });
      return b;
    }));
    var pers = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: 'персонализация' }), icon('user'));
    pers.addEventListener('click', openPersonal);
    var subs = h('button', { class: 'btn block opt', type: 'button' }, h('span', { text: sub ? 'подписка: ' + sub.plan : 'подписки' }), icon('star'));
    subs.addEventListener('click', function () { openPlans(); });
    openSheet([
      h('h2', { text: 'настройки' }),
      h('div', { class: 'form' },
        h('p', { class: 'label', text: 'ии' }), pers, subs,
        h('p', { class: 'label', text: 'тема' }), seg,
        h('p', { class: 'label', text: 'данные' }),
        twice('удалить все чаты', 'точно удалить? нажми ещё раз', function () {
          S.chats = []; S.cur = null; S.pendingProject = null; save(); clearError(); renderAll(); closeSheet();
        }, 'danger')),
      h('p', { class: 'foot', text: 'DDX AI ' + VERSION + ' · Создано @bauyrzhanov_12_' })
    ]);
  }

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
      var x = h('button', { type: 'button', 'aria-label': 'убрать фото' }, icon('close'));
      x.addEventListener('click', function () { atts = atts.filter(function (o) { return o.id !== a.id; }); renderAtts(); syncSend(); });
      return h('div', { class: 'att' }, h('img', { src: a.thumb, alt: 'фото' }), x);
    }));
    measure();
  }
  var loading = 0;
  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name || ''); });
    if (!list.length) return;
    var room = MAX_IMG - atts.length - loading;
    if (room <= 0) { toast('максимум ' + MAX_IMG + ' фото в одном сообщении'); return; }
    if (list.length > room) { toast('взял только ' + room + ' из ' + list.length + ' фото'); list = list.slice(0, room); }
    loading += list.length; syncSend();
    Promise.all(list.map(function (f) {
      return fileToAtt(f).then(function (a) { atts.push(a); renderAtts(); }, function () { toast('не удалось открыть фото'); })
        .then(function () { loading--; syncSend(); });
    }));
  }
  $('#pick').append(icon('image'));
  $('#pick').addEventListener('click', function () { $('#file').click(); });
  $('#file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  document.addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); }); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }
  });
  var comp = $('#composer');
  ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); comp.classList.add('drop'); } }); });
  ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function () { comp.classList.remove('drop'); }); });
  document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  /* ---------- отправка ---------- */
  function syncSend() { sendBtn.disabled = busy || loading > 0 || (!ta.value.trim() && !atts.length); }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 148) + 'px'; measure(); }

  function send(text) {
    if (busy || loading) return;
    text = String(text == null ? ta.value : text).trim();
    if (!text && !atts.length) return;
    clearError();
    var c = ensureChat(), first = !c.msgs.length;
    var m = { id: uid(), role: 'user', text: text, thumbs: atts.map(function (a) { return a.thumb; }), full: atts.map(function (a) { return a.full; }) };
    c.msgs.push(m); c.updated = Date.now();
    if (first) c.title = makeTitle(text);
    save();
    ta.value = ''; atts = []; renderAtts(); grow(); syncSend();
    hero.hidden = true; updateHeader();
    chat.append(msgEl(m, true));
    toBottom(true);
    request();
  }

  // фото уходят с последним сообщением, где они были (если оно недавнее), чтобы можно было задавать уточнения
  function buildPayload(c) {
    var recent = c.msgs.slice(-20), imgAt = -1;
    recent.forEach(function (m, i) { if (m.role === 'user' && m.full && m.full.length && i >= recent.length - 6) imgAt = i; });
    var out = recent.map(function (m, i) {
      var o = { role: m.role, content: m.text || '' };
      if (m.role === 'user' && m.thumbs && m.thumbs.length) {
        if (i !== imgAt) o.content = (m.text ? m.text + ' ' : '') + '[к сообщению было прикреплено фото]';
        else if (!m.text) o.content = 'Что на этом фото?';
      }
      return o;
    });
    return { list: out, imgAt: imgAt, images: imgAt >= 0 ? recent[imgAt].full : [] };
  }

  function request() {
    var c = curChat();
    if (!c || !c.msgs.length || c.msgs[c.msgs.length - 1].role !== 'user') return;
    busy = true; busyChat = c.id; syncSend(); clearError(); setThinking(true);
    var p = buildPayload(c), instr = buildInstructions(c);
    var here = function () { return S.cur === c.id; };
    fitImages(p.images).then(function (imgs) {
      if (p.imgAt >= 0) p.list[p.imgAt].images = imgs;
      var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 75000);
      var body = { mode: 'chat', messages: p.list, device: device };
      if (instr) body.instructions = instr;
      if (subCode) body.code = subCode;
      return fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined, body: JSON.stringify(body)
      }).then(function (r) { clearTimeout(timer); return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, st: r.status, j: j }; }); },
        function (e) { clearTimeout(timer); throw e; });
    }).then(function (x) {
      if (here()) setThinking(false);
      if (x.ok && x.j.answer) {
        var m = { id: uid(), role: 'assistant', text: String(x.j.answer), thumbs: [] };
        c.msgs.push(m); c.updated = Date.now(); save();
        if (typeof x.j.left === 'number') { lastLeft = { day: dayStr(), left: x.j.left, limit: x.j.limit || 0, plan: x.j.plan || 'free' }; ls.set(KEY_LEFT, JSON.stringify(lastLeft)); showLeft(); }
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
        lastLeft = { day: dayStr(), left: 0, limit: lastLeft ? lastLeft.limit : 0, plan: j.plan || 'free' }; ls.set(KEY_LEFT, JSON.stringify(lastLeft)); showLeft();
        msg = sub ? 'лимит твоего тарифа исчерпан. можно взять тариф побольше' : 'лимит на сегодня исчерпан, завтра можно снова. или возьми подписку'; plans = true;
      }
      else if (j.error === 'code' || j.error === 'expired') {
        msg = j.error === 'expired' ? 'подписка закончилась. можно продлить в тарифах' : 'код подписки не найден. введи его заново в тарифах';
        subCode = ''; sub = null; ls.del ? ls.del(KEY_CODE) : ls.set(KEY_CODE, ''); ls.set(KEY_SUB, 'null'); lastLeft = null; showLeft(); plans = true;
      }
      else if (x.st === 413) msg = 'фото слишком тяжёлые. убери одно или пришли поменьше';
      else if (x.st === 403) msg = 'воркер не пускает этот сайт (' + location.origin + '). добавь его в ALLOWED_ORIGINS';
      else if (j.error === 'mode') msg = 'в воркере нет режима chat: задеплой worker/full-worker.js';
      else msg = 'не получилось ответить: ' + (j.detail || j.error || x.st);
      if (here()) showError(msg, plans); else toast(msg);
    }).catch(function (e) {
      if (here()) setThinking(false);
      var msg = e && e.name === 'AbortError' ? 'ответ идёт слишком долго, попробуй ещё раз' : 'нет связи с воркером. проверь интернет';
      if (here()) showError(msg); else toast(msg);
    }).then(function () { busy = false; busyChat = null; syncSend(); });
  }

  sendBtn.append(icon('arrowup'));
  sendBtn.addEventListener('click', function () { send(); });
  ta.addEventListener('input', function () { grow(); syncSend(); });
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  ta.addEventListener('keydown', function (e) {
    // на компьютере enter отправляет, shift+enter новая строка; на телефоне enter это новая строка
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) { e.preventDefault(); send(); }
  });

  /* ---------- шапка, подсказки, клавиатура, заставка ---------- */
  $('#chats').append(icon('list')); $('#chats').addEventListener('click', function () { openChats(); });
  $('#newchat').append(icon('plus')); $('#newchat').addEventListener('click', function () { newChat(S.cur ? (curChat() || {}).project : S.pendingProject); });
  $('#left').addEventListener('click', function () { openPlans(); });
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
  refreshSide();
  toBottom(false);

  var splash = $('#splash');
  $('#splash-logo').append(logo('logo big'));
  setTimeout(function () { splash.classList.add('out'); setTimeout(function () { splash.remove(); }, 900); }, 1000);
})();
