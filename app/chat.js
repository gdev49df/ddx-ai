/* DDX AI: чат с фото. работает через воркер ddx-ai (режим chat), ключ groq лежит только в воркере.
   история хранится на телефоне; фото в истории остаются маленькими превью. */
(function () {
  'use strict';

  // адрес воркера
  var API = 'https://ddx-ai.wsmp.workers.dev/';
  var VERSION = 'v1.0';
  var KEY = 'wchat2', KEY_OLD = 'wchat', KEY_DEV = 'wchat-dev', KEY_LEFT = 'wchat-left';
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
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>'
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
  var msgs = [], atts = [], busy = false, thinkEl = null, errEl = null, lastLeft = null;
  var device = ls.get(KEY_DEV);
  if (!device) { device = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); ls.set(KEY_DEV, device); }

  function load() {
    var list = [];
    try { list = JSON.parse(ls.get(KEY) || 'null') || []; } catch (e) { list = []; }
    if (!list.length) {
      // перенос из первой версии, где хранился только текст
      try { list = (JSON.parse(ls.get(KEY_OLD) || '[]') || []).map(function (m) { return { role: m.role, text: m.content, thumbs: [] }; }); } catch (e2) { list = []; }
    }
    msgs = list.filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
      .map(function (m) { return { id: uid(), role: m.role, text: String(m.text || ''), thumbs: Array.isArray(m.thumbs) ? m.thumbs : [] }; });
    try { var l = JSON.parse(ls.get(KEY_LEFT) || 'null'); if (l && l.day === dayStr()) lastLeft = l; } catch (e3) { /* нет данных */ }
  }
  function save() {
    var data = msgs.slice(-60).map(function (m) { return { role: m.role, text: m.text, thumbs: m.thumbs || [] }; });
    if (!ls.set(KEY, JSON.stringify(data))) {
      // память переполнена: оставляем только текст
      data.forEach(function (m) { m.thumbs = []; });
      ls.set(KEY, JSON.stringify(data));
    }
  }
  function dayStr() { return new Date().toISOString().slice(0, 10); }

  /* ---------- markdown без innerHTML ---------- */
  function mdInline(text, into) {
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

  function showHero() {
    var empty = !msgs.length && !thinkEl;
    hero.hidden = !empty;
  }
  function renderAll() {
    chat.replaceChildren();
    msgs.forEach(function (m) { chat.append(msgEl(m, false)); });
    showHero();
    showLeft();
  }
  function toBottom(smooth) { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

  function showLeft() {
    var el = $('#left');
    if (!lastLeft) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = 'сообщений на сегодня: осталось ' + lastLeft.left + (lastLeft.limit ? ' из ' + lastLeft.limit : '');
    el.classList.toggle('warn', lastLeft.left <= 0);
  }

  function setThinking(on) {
    if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    if (on) {
      thinkEl = h('div', { class: 'msg ai thinking rise', role: 'status' }, logo('logo think'), h('span', { text: 'думаю…' }));
      chat.append(thinkEl);
      toBottom(true);
    }
    showHero();
  }
  function clearError() { if (errEl) { errEl.remove(); errEl = null; } }
  function showError(text) {
    clearError();
    errEl = h('div', { class: 'msg err rise' }, h('p', { text: text }),
      h('button', { class: 'btn', type: 'button', onclick: function () { if (!busy) request(); } }, h('span', { text: 'повторить' })));
    chat.append(errEl);
    toBottom(true);
  }

  /* ---------- листы, уведомления, просмотр фото ---------- */
  var sheet = $('#sheet'), panel = $('#sheet-panel');
  function openSheet(nodes) {
    panel.replaceChildren.apply(panel, nodes);
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

  function openMenu() {
    var cur = (window.WTheme && WTheme.mode()) || 'dark';
    var seg = h('div', { class: 'seg' }, [['dark', 'тёмная'], ['light', 'светлая'], ['auto', 'авто']].map(function (x) {
      var b = h('button', { type: 'button', class: x[0] === cur ? 'on' : '', text: x[1] });
      b.addEventListener('click', function () { WTheme.set(x[0], true); seg.querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); }); });
      return b;
    }));
    var wipe = h('button', { class: 'btn block', type: 'button', text: 'очистить чат' });
    var armed = false;
    wipe.addEventListener('click', function () {
      if (!armed) { armed = true; wipe.textContent = 'точно очистить? нажми ещё раз'; setTimeout(function () { armed = false; wipe.textContent = 'очистить чат'; }, 3500); return; }
      msgs = []; save(); clearError(); setThinking(false); renderAll(); closeSheet();
    });
    openSheet([
      h('h2', { text: 'настройки' }),
      h('div', { class: 'form' },
        h('p', { class: 'label', text: 'тема' }), seg,
        h('p', { class: 'label', text: 'чат' }), wipe),
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
    var m = { id: uid(), role: 'user', text: text, thumbs: atts.map(function (a) { return a.thumb; }), full: atts.map(function (a) { return a.full; }) };
    msgs.push(m); save();
    ta.value = ''; atts = []; renderAtts(); grow(); syncSend();
    hero.hidden = true;
    chat.append(msgEl(m, true));
    toBottom(true);
    request();
  }

  // фото уходят с последним сообщением, где они были (если оно недавнее), чтобы можно было задавать уточнения
  function buildPayload() {
    var recent = msgs.slice(-20), imgAt = -1;
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
    busy = true; syncSend(); clearError(); setThinking(true);
    var p = buildPayload();
    fitImages(p.images).then(function (imgs) {
      if (p.imgAt >= 0) p.list[p.imgAt].images = imgs;
      var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 75000);
      return fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined,
        body: JSON.stringify({ mode: 'chat', messages: p.list, device: device })
      }).then(function (r) { clearTimeout(timer); return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, st: r.status, j: j }; }); },
        function (e) { clearTimeout(timer); throw e; });
    }).then(function (x) {
      setThinking(false);
      if (x.ok && x.j.answer) {
        var m = { id: uid(), role: 'assistant', text: String(x.j.answer), thumbs: [] };
        msgs.push(m); save();
        if (typeof x.j.left === 'number') { lastLeft = { day: dayStr(), left: x.j.left, limit: x.j.limit || 0 }; ls.set(KEY_LEFT, JSON.stringify(lastLeft)); showLeft(); }
        var el = msgEl(m, true); chat.append(el);
        if (p.images.length && !x.j.vision) toast('ответ без фото: воркер ещё не обновлён');
        requestAnimationFrame(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        return;
      }
      var j = x.j || {};
      if (x.st === 429) { lastLeft = { day: dayStr(), left: 0, limit: lastLeft ? lastLeft.limit : 0 }; ls.set(KEY_LEFT, JSON.stringify(lastLeft)); showLeft(); showError('лимит на сегодня исчерпан, завтра можно снова'); }
      else if (x.st === 413) showError('фото слишком тяжёлые. убери одно или пришли поменьше');
      else if (x.st === 403) showError('воркер не пускает этот сайт (' + location.origin + '). добавь его в ALLOWED_ORIGINS');
      else showError('не получилось ответить: ' + (j.detail || j.error || x.st));
    }).catch(function (e) {
      setThinking(false);
      showError(e && e.name === 'AbortError' ? 'ответ идёт слишком долго, попробуй ещё раз' : 'нет связи с воркером. проверь интернет');
    }).then(function () { busy = false; syncSend(); });
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
  $('#brand').prepend(logo('logo'));
  var menuBtn = $('#menu'); menuBtn.append(icon('gear')); menuBtn.addEventListener('click', openMenu);
  HINTS.forEach(function (q, i) {
    $('#chips').append(h('button', { class: 'chip', type: 'button', text: q, onclick: function () { if (i === HINTS.length - 1) $('#file').click(); else send(q); } }));
  });

  // высота строки ввода нужна, чтобы чат не уходил под неё
  function measure() { document.documentElement.style.setProperty('--cph', Math.round(comp.getBoundingClientRect().height) + 'px'); }
  if (window.ResizeObserver) new ResizeObserver(measure).observe(comp);
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

  load(); renderAll(); renderAtts(); grow(); syncSend(); measure();
  toBottom(false);

  var splash = $('#splash');
  $('#splash-logo').append(logo('logo big'));
  setTimeout(function () { splash.classList.add('out'); setTimeout(function () { splash.remove(); }, 900); }, 1000);
})();
