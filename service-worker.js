const CACHE_VERSION = "0.15.6";
const CACHE_NAME = "minhas-viagens-" + CACHE_VERSION;
const APP_BASE = "/minhas-viagens/";
const STATIC_ASSETS = [
  APP_BASE,
  APP_BASE + "index.html",
  APP_BASE + "manifest.webmanifest",
  APP_BASE + "app-icon.svg",
  APP_BASE + "app-icon-192.png",
  APP_BASE + "app-icon-512.png",
  APP_BASE + "vendor/leaflet/leaflet.css?v=1.9.4",
  APP_BASE + "vendor/leaflet/leaflet.js?v=1.9.4",
  APP_BASE + "style.css?v=0.14.9",
  APP_BASE + "mobile-ui.css?v=0.15.6",
  APP_BASE + "mobile-ui.js?v=0.15.6",
  APP_BASE + "config.js?v=0.15.6",
  APP_BASE + "auth.js?v=0.15.6"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("minhas-viagens-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return;

  if (request.mode === "navigate" || url.pathname === APP_BASE || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(APP_BASE, copy));
          return response;
        })
        .catch(() => caches.match(APP_BASE).then(response => response || caches.match(APP_BASE + "index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
