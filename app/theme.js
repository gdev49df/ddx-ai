/* тема: авто, светлая, тёмная. подключается в <head>, чтобы цвет встал до первой отрисовки */
(function () {
  'use strict';
  var K = 'wchat-theme', root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function mode() { try { return localStorage.getItem(K) || 'dark'; } catch (e) { return 'dark'; } }
  function eff(m) { return m === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : m; }
  function paint(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f3f3f6' : '#08080a');
    var c = document.querySelector('meta[name="color-scheme"]');
    if (c) c.setAttribute('content', t);
  }
  function set(m, animate) {
    try { localStorage.setItem(K, m); } catch (e) { /* без памяти тема живёт до перезапуска */ }
    var t = eff(m);
    if (root.getAttribute('data-theme') === t) return;
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && !calm && document.startViewTransition) { document.startViewTransition(function () { paint(t); }); return; }
    if (animate && !calm) {
      root.classList.add('theme-anim'); paint(t);
      setTimeout(function () { root.classList.remove('theme-anim'); }, 700);
      return;
    }
    paint(t);
  }
  window.WTheme = { mode: mode, set: set };
  paint(eff(mode()));
  if (mq) {
    var on = function () { if (mode() === 'auto') set('auto', true); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
})();
