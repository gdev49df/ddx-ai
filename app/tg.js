/* DDX AI как Telegram Mini App: код работает только внутри Telegram, в обычном браузере ничего не делает. */
(function () {
  'use strict';
  var inTg = /tgWebAppData|tgWebAppVersion|tgWebAppPlatform/.test(location.hash + location.search) || !!(window.TelegramWebviewProxy);
  try { if (inTg) sessionStorage.setItem('ddx_tg', '1'); else if (sessionStorage.getItem('ddx_tg')) inTg = true; } catch (e) {}
  if (!inTg) return;
  document.documentElement.classList.add('tg');
  var s = document.createElement('script');
  s.src = 'https://telegram.org/js/telegram-web-app.js';
  s.onload = function () {
    var tg = window.Telegram && Telegram.WebApp;
    if (!tg) return;
    function insets() {
      var r = document.documentElement.style, a = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {};
      r.setProperty('--tgb', (a.bottom || 0) + (c.bottom || 0) + 'px');
      r.setProperty('--tgt', (a.top || 0) + (c.top || 0) + 'px');
    }
    try {
      tg.ready();
      insets();
      ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'].forEach(function (ev) { try { tg.onEvent(ev, insets); } catch (x) {} });
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();   // чтобы свайп по чату не закрывал приложение
      if (tg.setHeaderColor) tg.setHeaderColor('#08080a');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#08080a');
      if (tg.setBottomBarColor) tg.setBottomBarColor('#08080a');
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
    } catch (e) { /* старые версии клиента */ }
    // лёгкая вибрация на нажатия кнопок
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button, .tab, a.pi');
      if (b && tg.HapticFeedback) { try { tg.HapticFeedback.selectionChanged(); } catch (x) {} }
    }, true);
    // ссылки на внешние сайты открываем средствами Telegram
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="http"]');
      if (!a || a.href.indexOf(location.origin) === 0) return;
      if (a.href.indexOf('https://t.me/') === 0 && tg.openTelegramLink) { e.preventDefault(); tg.openTelegramLink(a.href); }
      else if (tg.openLink) { e.preventDefault(); tg.openLink(a.href); }
    }, true);
  };
  document.head.appendChild(s);
})();
