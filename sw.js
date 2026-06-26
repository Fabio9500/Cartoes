const CACHE = 'cartoes-v1';
self.addEventListener('install', e => {
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    const base = self.registration.scope;
    await Promise.allSettled([
      base+'CartoesPF.html', base+'CartoesPJ.html',
      base+'manifest-pf.json', base+'manifest-pj.json',
      base+'icon-pf-192.png', base+'icon-pf-512.png',
      base+'icon-pj-192.png', base+'icon-pj-512.png'
    ].map(u=>fetch(u).then(r=>{if(r&&r.ok)return c.put(u,r);}).catch(()=>{})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if(e.request.method!=='GET') return;
  if(url.includes('api.github.com')||url.includes('wa.me')||url.includes('githubusercontent.com')) return;
  e.respondWith((async()=>{
    const c = await caches.open(CACHE);
    if(e.request.mode==='navigate'){
      const cached = await c.match(e.request)
        || await c.match(self.registration.scope+(url.includes('PJ')?'CartoesPJ.html':'CartoesPF.html'));
      if(cached){ fetch(e.request).then(r=>{if(r&&r.ok)c.put(e.request,r);}).catch(()=>{}); return cached; }
      try{ const r=await fetch(e.request); if(r&&r.ok)c.put(e.request,r.clone()); return r; }
      catch(){ return new Response('<h1 style="font-family:sans-serif;color:#58a6ff;background:#0d1117;padding:20px">Cartões — Offline</h1><p style="color:#888;font-family:sans-serif;padding:0 20px">Conecte-se à internet uma vez para habilitar o modo offline.</p>',{headers:{'Content-Type':'text/html;charset=utf-8'}}); }
    }
    const cached = await c.match(e.request);
    const net = fetch(e.request).then(r=>{if(r&&r.status===200)c.put(e.request,r.clone()); return r;}).catch(()=>cached);
    return cached||net;
  })());
});
self.addEventListener('message', e=>{ if(e.data==='SKIP_WAITING')self.skipWaiting(); });
