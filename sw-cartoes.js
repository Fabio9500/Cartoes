/* Cartões (PF + PJ) — Service Worker v3 (cache-first) */
const CACHE = 'cartoes-v3';
const PF = './CartoesPF.html';
const PJ = './CartoesPJ.html';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([PF, PJ]))
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
    const alvo = e.request.url.includes('CartoesPJ') ? PJ : PF;
    e.respondWith(
      caches.match(alvo).then(cached => {
        const atualizar = fetch(alvo).then(resp => {
          if (resp.ok) caches.open(CACHE).then(c => c.put(alvo, resp.clone()));
          return resp;
        }).catch(() => null);
        return cached || atualizar;
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
