/* «давай поиграем?»: мини-игры прямо в чате (крестики-нолики и шашки против ИИ).
   Сообщение хранится как текст "::game:<тип>:<состояние>", поэтому партия переживает перезагрузку. */
(function () {
  'use strict';
  var TRIGGER = /(^|\s)(давай\s+(по)?игра|(по)?играем|сыграем|сыграть|поиграть|хочу\s+игр|крестики|нолики|шашки|игр[ау]\s*\??$)/i;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); }); return b; }
  function tick() { try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred('light'); else if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }

  /* ---------- крестики-нолики ---------- */
  var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function tWin(b) { for (var i = 0; i < 8; i++) { var l = LINES[i]; if (b[l[0]] !== '-' && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { w: b[l[0]], line: l }; } return b.indexOf('-') < 0 ? { w: 'd', line: [] } : null; }
  function mm(b, turn) {              // оценка для «o» (ИИ): +1 победа ИИ, -1 победа игрока
    var r = tWin(b); if (r) return r.w === 'o' ? 1 : r.w === 'x' ? -1 : 0;
    var best = turn === 'o' ? -2 : 2;
    for (var i = 0; i < 9; i++) if (b[i] === '-') {
      var nb = b.slice(0, i) + turn + b.slice(i + 1), v = mm(nb, turn === 'o' ? 'x' : 'o');
      if (turn === 'o' ? v > best : v < best) best = v;
    }
    return best;
  }
  function tAi(b) {
    var free = [], i; for (i = 0; i < 9; i++) if (b[i] === '-') free.push(i);
    if (Math.random() < 0.18) return free[Math.floor(Math.random() * free.length)];   // иногда «зевает», чтобы можно было выиграть
    var best = -2, pick = [];
    free.forEach(function (c) { var v = mm(b.slice(0, c) + 'o' + b.slice(c + 1), 'x'); if (v > best) { best = v; pick = [c]; } else if (v === best) pick.push(c); });
    return pick[Math.floor(Math.random() * pick.length)];
  }
  function mountTtt(box, st, put) {
    var b = /^[xo-]{9}$/.test(st) ? st : '---------', lock = false;
    function draw() {
      box.replaceChildren();
      var r = tWin(b), grid = el('div', 'gm-ttt');
      for (var i = 0; i < 9; i++) (function (i) {
        var c = btn('gm-c' + (b[i] === 'x' ? ' x' : b[i] === 'o' ? ' o' : '') + (r && r.line.indexOf(i) >= 0 ? ' win' : ''), b[i] === 'x' ? '✕' : b[i] === 'o' ? '◯' : '', function () {
          if (r || lock || b[i] !== '-') return;
          tick(); b = b.slice(0, i) + 'x' + b.slice(i + 1); put('ttt', b); draw();
          if (!tWin(b)) { lock = true; setTimeout(function () { var k = tAi(b); b = b.slice(0, k) + 'o' + b.slice(k + 1); lock = false; put('ttt', b); draw(); }, 380); }
        });
        grid.append(c);
      })(i);
      box.append(el('div', 'gm-st', r ? (r.w === 'x' ? 'ты выиграл! 🎉' : r.w === 'o' ? 'я выиграл 😎' : 'ничья') : 'твой ход: ты ✕, я ◯'), grid);
      var row = el('div', 'gm-row');
      row.append(btn('gm-b', 'заново', function () { b = '---------'; put('ttt', b); draw(); }), btn('gm-b ghost', 'другая игра', function () { put('', ''); }));
      box.append(row);
    }
    draw();
  }

  /* ---------- шашки (английские правила: обязательное взятие, дамки ходят на 1 клетку) ---------- */
  var START = (function () { var s = ''; for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) s += ((r + c) % 2 === 1) ? (r < 3 ? 'b' : r > 4 ? 'w' : '.') : '.'; return s; })();
  function side(p) { return p === '.' ? '' : p.toLowerCase(); }
  function dirs(p) { return p === 'W' || p === 'B' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : p === 'w' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]; }
  function seqs(b, r, c, p, caps, path, out, first) {
    var found = false;
    dirs(p).forEach(function (d) {
      var mr = r + d[0], mc = c + d[1], tr = r + 2 * d[0], tc = c + 2 * d[1];
      if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return;
      var mid = b[mr * 8 + mc], key = mr * 8 + mc;
      if (mid === '.' || side(mid) === side(p) || caps.indexOf(key) >= 0 || b[tr * 8 + tc] !== '.') return;
      found = true;
      var crown = (side(p) === 'w' && tr === 0) || (side(p) === 'b' && tr === 7);
      if (crown && p !== 'W' && p !== 'B') out.push({ path: path.concat([tr * 8 + tc]), caps: caps.concat(key) });   // превращение заканчивает ход
      else seqs(b, tr, tc, p, caps.concat(key), path.concat([tr * 8 + tc]), out, false);
    });
    if (!found && !first) out.push({ path: path, caps: caps });
  }
  function movesFor(b, who) {
    var jumps = [], steps = [];
    for (var i = 0; i < 64; i++) {
      var p = b[i]; if (side(p) !== who) continue;
      var r = i >> 3, c = i & 7, out = [];
      // прыжки (после превращения ход заканчивается — упрощённо учитываем в apply)
      seqs(b, r, c, p, [], [i], out, true);
      out.forEach(function (m) { jumps.push(m); });
      dirs(p).forEach(function (d) { var nr = r + d[0], nc = c + d[1]; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === '.') steps.push({ path: [i, nr * 8 + nc], caps: [] }); });
    }
    return jumps.length ? jumps : steps;
  }
  function apply(b, m) {
    var a = b.split(''), from = m.path[0], to = m.path[m.path.length - 1], p = a[from];
    a[from] = '.'; m.caps.forEach(function (k) { a[k] = '.'; });
    var r = to >> 3; if ((side(p) === 'w' && r === 0) || (side(p) === 'b' && r === 7)) p = p.toUpperCase();
    a[to] = p; return a.join('');
  }
  function evalB(b) {
    var s = 0; for (var i = 0; i < 64; i++) { var p = b[i]; if (p === '.') continue; var v = (p === 'B' || p === 'W') ? 3 : 1, r = i >> 3;
      if (p === 'b') v += r * 0.06; if (p === 'w') v += (7 - r) * 0.06; s += side(p) === 'b' ? v : -v; }
    return s;
  }
  function search(b, who, depth, a, bt) {                    // ИИ играет чёрными (b), максимизирует evalB
    var ms = movesFor(b, who);
    if (!ms.length) return who === 'b' ? -99 : 99;
    if (!depth) return evalB(b);
    var best = who === 'b' ? -1e9 : 1e9;
    for (var i = 0; i < ms.length; i++) {
      var v = search(apply(b, ms[i]), who === 'b' ? 'w' : 'b', depth - 1, a, bt);
      if (who === 'b') { if (v > best) best = v; if (best > a) a = best; } else { if (v < best) best = v; if (best < bt) bt = best; }
      if (bt <= a) break;
    }
    return best;
  }
  function cAi(b) {
    var ms = movesFor(b, 'b'); if (!ms.length) return null;
    var best = -1e9, pick = [];
    ms.forEach(function (m) { var v = search(apply(b, m), 'w', 3, -1e9, 1e9) + Math.random() * 0.15; if (v > best) { best = v; pick = [m]; } });
    return pick[0];
  }
  function mountCheckers(box, st, put) {
    var parts = st.split(','), b = /^[wWbB.]{64}$/.test(parts[0] || '') ? parts[0] : START, n = +parts[1] || 0, sel = -1, lock = false, last = [];
    function save() { put('checkers', b + ',' + n); }
    function draw() {
      box.replaceChildren();
      var mine = movesFor(b, 'w'), theirs = movesFor(b, 'b');
      var over = !mine.length ? 'b' : !theirs.length ? 'w' : n >= 120 ? 'd' : '';
      var must = mine.some(function (m) { return m.caps.length; });
      var targets = {}; if (sel >= 0) mine.forEach(function (m) { if (m.path[0] === sel) targets[m.path[m.path.length - 1]] = m; });
      var grid = el('div', 'gm-ck');
      for (var i = 0; i < 64; i++) (function (i) {
        var r = i >> 3, c = i & 7, dark = (r + c) % 2 === 1, p = b[i];
        var q = btn('gm-q' + (dark ? ' dk' : '') + (targets[i] ? ' tg' : '') + (last.indexOf(i) >= 0 ? ' lm' : ''), '', function () {
          if (over || lock || !dark) return;
          if (targets[i]) { tick(); last = [targets[i].path[0], i]; b = apply(b, targets[i]); n++; sel = -1; save(); draw(); ai(); return; }
          if (side(p) === 'w' && mine.some(function (m) { return m.path[0] === i; })) { sel = sel === i ? -1 : i; draw(); }
        });
        if (p !== '.') q.append(el('i', 'gm-p ' + (side(p) === 'w' ? 'wh' : 'bl') + ((p === 'W' || p === 'B') ? ' kg' : '') + (sel === i ? ' sel' : '') + (must && side(p) === 'w' && mine.some(function (m) { return m.path[0] === i; }) && !over ? ' must' : '')));
        grid.append(q);
      })(i);
      var msg = over ? (over === 'w' ? 'ты выиграл! 🎉' : over === 'b' ? 'я выиграл 😎' : 'ничья') : lock ? 'думаю…' : (must ? 'твой ход (бить обязательно), ты ⚪' : 'твой ход, ты ⚪ ходишь вверх');
      box.append(el('div', 'gm-st', msg), grid);
      var row = el('div', 'gm-row');
      row.append(btn('gm-b', 'заново', function () { b = START; n = 0; sel = -1; last = []; save(); draw(); }), btn('gm-b ghost', 'другая игра', function () { put('', ''); }));
      box.append(row);
    }
    function ai() {
      var mine = movesFor(b, 'w'), theirs = movesFor(b, 'b'); if (!mine.length || !theirs.length || n >= 120) { draw(); return; }
      lock = true; draw();
      setTimeout(function () {
        var m = cAi(b); if (m) { last = [m.path[0], m.path[m.path.length - 1]]; b = apply(b, m); n++; }
        lock = false; save(); draw();
      }, 450);
    }
    draw();
  }

  /* ---------- оболочка ---------- */
  function mount(m, onSave) {
    var root = el('div', 'gm');
    function parse() { var p = /^::game:([a-z]*):?([\s\S]*)$/.exec(m.text || '') || []; return { type: p[1] || '', st: p[2] || '' }; }
    function put(type, st) { m.text = '::game:' + type + ':' + st; if (onSave) onSave(); if (!type) show(); }
    function show() {
      var g = parse(); root.replaceChildren();
      var head = el('div', 'gm-h'); head.append(el('b', '', g.type === 'ttt' ? 'крестики-нолики' : g.type === 'checkers' ? 'шашки' : 'давай поиграем? 🎮'));
      root.append(head);
      var body = el('div', 'gm-body'); root.append(body);
      if (g.type === 'ttt') mountTtt(body, g.st, put);
      else if (g.type === 'checkers') mountCheckers(body, g.st, put);
      else {
        body.append(el('div', 'gm-st', 'во что сыграем? я могу и поддаться 😉'));
        var row = el('div', 'gm-pick');
        row.append(btn('gm-g', '✕ ◯\nкрестики-нолики', function () { put('ttt', '---------'); show(); }), btn('gm-g', '⚪ ⚫\nшашки', function () { put('checkers', START + ',0'); show(); }));
        body.append(row);
      }
    }
    show(); return root;
  }
  window.DDXGames = { mount: mount, trigger: function (t) { t = String(t || '').trim(); return t.length > 0 && t.length < 60 && TRIGGER.test(t); }, isGame: function (t) { return /^::game/.test(t || ''); } };
})();
