// Service worker: guarda la app en el dispositivo para que abra sin internet.
// IMPORTANTE: cada vez que cambies archivos de la app, sube este número de versión.
const VERSION = 'habitos-v1.1.0';
const RUNTIME = 'habitos-runtime';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/main.js',
  'js/util.js',
  'js/icons.js',
  'js/bus.js',
  'js/store.js',
  'js/logic.js',
  'js/ui.js',
  'js/charts.js',
  'js/actions.js',
  'js/templates.js',
  'js/habitUi.js',
  'js/files.js',
  'js/ics.js',
  'js/backup.js',
  'js/lock.js',
  'js/sync.js',
  'js/timer.js',
  'js/sheets/habitForm.js',
  'js/sheets/wrapped.js',
  'js/sheets/categoryForm.js',
  'js/sheets/habitDetail.js',
  'js/sheets/daySheet.js',
  'js/sheets/onboarding.js',
  'js/views/today.js',
  'js/views/month.js',
  'js/views/stats.js',
  'js/views/diary.js',
  'js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // SDK de Firebase: usar copia guardada y actualizarla en segundo plano.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', { ignoreSearch: true }).then((cached) => cached || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req)),
  );
});
