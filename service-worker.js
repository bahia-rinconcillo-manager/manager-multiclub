const CACHE = "manager-multiclub-v1-0-6-upsert-multiclub";
const CORE_FILES = [
  "./",
  "./index.html",
  "./inscripcion.html",
  "./wix-ticker.html",
  "./wix-calendar.html",
  "./wix-public-v27247.css?v=27248",
  "./wix-public-v27247.js?v=27248",
  "./styles-v2600.css?v=27248",
  "./sponsorship-v27248.css?v=27248",
  "./calendar-v27243.css?v=27248",
  "./sports-v2702.css?v=27248",
  "./cards-v27249.css?v=27249",
  "./mobile-v27231.css?v=27248",
  "./app-v27248.js?v=106",
  "./sports-v27238.js?v=103",
  "./cards-v27249.js?v=106",
  "./calendar-v27247.js?v=103",
  "./inventory-v2600.js?v=27248",
  "./public-v27211.js?v=27248",
  "./manifest.webmanifest",
  "./assets/escudo-oficial.png",
  "./assets/escudo-bahia.png",
  "./assets/escudo-rinconcillo.png",
  "./assets/manager-multiclub.svg",
  "./assets/avatar-jugador.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon.png",
  "./assets/competitions/liga-aafb.png",
  "./assets/competitions/copa-primavera.png",
  "./assets/competitions/liga-rfaf.png",
  "./assets/accidentes/parte-lesiones-rfaf.pdf",
  "./assets/accidentes/parte-accidentes-aafb.pdf",
  "./assets/accidentes/protocolo-accidentes-aafb-algeciras.pdf"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => (key.startsWith("cdsb-manager-")||key.startsWith("manager-multiclub-")) && key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/config.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request, { cache: "no-store" }).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
