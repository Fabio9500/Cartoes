/* Cartões — Service Worker DESATIVADO (06/08/2026)
   O app não registra service worker (nenhuma chamada a
   navigator.serviceWorker.register em CartoesPF.html/CartoesPJ.html
   atuais). Este arquivo e o sw-cartoes.js existiam antes com estratégias de
   cache (um deles cache-first) — se algum dispositivo tiver instalado
   qualquer um dos dois enquanto ainda estava ativo, fica preso numa cópia
   desatualizada do app para sempre: nem F5 nem Ctrl+Shift+R resolvem,
   porque o Service Worker intercepta a navegação ANTES do cache do
   navegador. Um Service Worker só se atualiza checando a MESMA URL usada no
   registro original — por isso os dois nomes de arquivo (sw.js e
   sw-cartoes.js) recebem essa mesma autodestruição, cobrindo qualquer um
   que tenha sido o realmente registrado num dispositivo antigo. */
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
