/* Cartões — Service Worker DESATIVADO (06/08/2026)
   Mesma autodestruição de sw.js (ver comentário lá) — este arquivo chegou a
   ter 29 versões de uma estratégia cache-first ativa; qualquer dispositivo
   que ainda tenha essa versão instalada precisa dela pra se livrar sozinho
   da cópia desatualizada, já que nem F5 nem Ctrl+Shift+R bypassam um
   Service Worker em atividade. */
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach(c => c.navigate(c.url));
    })()
  );
});
