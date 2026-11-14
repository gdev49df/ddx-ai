/* движок разметки ответов из chat.js для страницы «только просмотр» (генерируется копированием) */
(function () {
  'use strict';
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


  function bbtn() { return null; }
  function icon() { return document.createElement('span'); }
  window.DDXView = { mdBlock: mdBlock, mdInline: mdInline, logo: logo, h: h };
})();
