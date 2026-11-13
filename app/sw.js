// при изменении файлов меняй версию, чтобы кэш обновился
const CACHE = 'wchat-v17';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './theme.js',
  './chat.js',
  './manifest.json',
  './fonts/inter-cyrillic.woff2',
  './fonts/inter-latin.woff2',
  './fonts/unbounded-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('wchat-') && k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// сначала сеть, если нет интернета: кэш. запросы к воркеру (чужой адрес и post) не трогаем
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
