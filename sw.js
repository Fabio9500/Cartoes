/* Cartões (PF + PJ) — Service Worker v2 */
const CACHE = 'cartoes-v2';
const ARQUIVOS = ['./CartoesPF.html', './CartoesPJ.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    const url = e.request.url;
    e.respondWith(
      fetch(e.request).catch(() => {
        if (url.includes('CartoesPJ')) return caches.match('./CartoesPJ.html');
        return caches.match('./CartoesPF.html');
      })
    );
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
