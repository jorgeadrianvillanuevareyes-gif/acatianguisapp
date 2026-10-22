// Red: prioritaria para no servir un index.html desactualizado tras cada despliegue.
const CACHE='acatianguis-v6-20261022-1';
self.addEventListener('install', e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(x=>x!==CACHE).map(x=>caches.delete(x)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  // Dejar auth, CDN, API y recursos siempre a cargo de la red.
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
