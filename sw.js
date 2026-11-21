// 生成物(build.py --dist)。版 90f7e33491
const CACHE="wcc_f-90f7e33491", FILES=["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install",e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())); });
// 先にネットを見て、つながらなければキャッシュ(更新がすぐ届き、オフラインでも開ける)
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request).then(r=>{ const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); return r; })
    .catch(()=>caches.match(e.request,{ ignoreSearch:true }).then(r=>r||caches.match("index.html"))));
});
