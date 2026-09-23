const APP_CACHE = "manager-multiclub-app-v1-0-35";
const ASSET_CACHE = "manager-multiclub-static-v1";
const CORE_FILES = [
  "./",
  "./index.html",
  "./inscripcion.html",
  "./wix-ticker.html",
  "./wix-calendar.html",
  "./wix-public-v27247.css?v=27248",
  "./wix-public-v27247.js?v=27248",
  "./styles-v2600.css?v=107",
  "./sponsorship-v27248.css?v=27248",
  "./sponsorship-multiclub-v1021.css?v=1021",
  "./calendar-v27243.css?v=27248",
  "./sports-v2702.css?v=27248",
  "./cards-v27249.css?v=27249",
  "./mobile-v1030.css?v=1030",
  "./app-multiclub-v1035.js?v=1035",
  "./multiclub-v1032-modernization.js?v=1032",
  "./sports-v1035-multiclub.js?v=1035",
  "./cards-v27249.js?v=106",
  "./calendar-v27247.js?v=104",
  "./inventory-v2600.js?v=114",
  "./public-v27211.js?v=27248",
  "./manifest.webmanifest",
  "./assets/escudo-bahia.png","./assets/escudo-rinconcillo.png","./assets/manager-multiclub.svg",
  "./assets/avatar-jugador.svg","./assets/icon-192.png","./assets/icon-512.png",
  "./assets/apple-touch-icon.png","./assets/favicon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(APP_CACHE).then(async cache=>{
    const results=await Promise.allSettled(CORE_FILES.map(file=>{
      const url=new URL(file,self.registration.scope).href;
      return cache.add(new Request(url,{cache:"reload"}));
    }));
    const failed=results.filter(x=>x.status==="rejected").length;
    if(failed)console.warn(`Manager Multiclub V1.0.35: ${failed} recursos se cargarán bajo demanda.`);
  }));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys
    .filter(key=>(key.startsWith("cdsb-manager-")||key.startsWith("manager-multiclub-"))&&key!==APP_CACHE&&key!==ASSET_CACHE)
    .map(key=>caches.delete(key)))));
  self.clients.claim();
});
function cacheName(url){return /\/assets\//.test(url.pathname)?ASSET_CACHE:APP_CACHE}
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith("/config.js")){event.respondWith(fetch(request,{cache:"no-store"}));return}
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{
      if(response&&response.ok){const copy=response.clone();caches.open(APP_CACHE).then(cache=>cache.put(request,copy))}
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{
    if(cached)return cached;
    return fetch(request).then(response=>{
      if(response&&response.ok){const copy=response.clone();caches.open(cacheName(url)).then(cache=>cache.put(request,copy))}
      return response;
    });
  }));
});