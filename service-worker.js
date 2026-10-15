const CACHE_VERSION = "0.15.21";
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
  APP_BASE + "style.css?v=0.15.21",
  APP_BASE + "mobile-ui.css?v=0.15.21",
  APP_BASE + "profile-screen.css?v=0.15.21",
  APP_BASE + "mobile-ui.js?v=0.15.21",
  APP_BASE + "config.js?v=0.15.21",
  APP_BASE + "auth.js?v=0.15.21",
  APP_BASE + "fetch-base.js?v=0.15.21",
  APP_BASE + "storage-pre.js?v=0.15.21",
  APP_BASE + "hotfix-pre.js?v=0.15.21",
  APP_BASE + "achievements.js?v=0.15.21",
  APP_BASE + "city-flags.js?v=0.15.21",
  APP_BASE + "route-interaction.js?v=0.15.21",
  APP_BASE + "road-marker-layout.js?v=0.15.21",
  APP_BASE + "road-export-core.js?v=0.15.21",
  APP_BASE + "script.js?v=0.15.21",
  APP_BASE + "profile-screen.js?v=0.15.21",
  APP_BASE + "hotfix.js?v=0.15.21",
  APP_BASE + "road-threshold-hotfix.js?v=0.15.21",
  APP_BASE + "secondary-roads-hotfix.js?v=0.15.21",
  APP_BASE + "international-road-shields.js?v=0.15.21",
  APP_BASE + "north-central-road-support.js?v=0.15.21",
  APP_BASE + "road-marker-hotfix.js?v=0.15.21",
  APP_BASE + "ux-hotfix.js?v=0.15.21",
  APP_BASE + "endpoint-hotfix.js?v=0.15.21",
  APP_BASE + "city-search-fast.js?v=0.15.21",
  APP_BASE + "place-search-hotfix.js?v=0.15.21",
  APP_BASE + "edit-dialog-hotfix.js?v=0.15.21",
  APP_BASE + "route-click-hotfix.js?v=0.15.21",
  APP_BASE + "geometry-compact-hotfix.js?v=0.15.21",
  APP_BASE + "highway-render-hotfix.js?v=0.15.21",
  APP_BASE + "road-progress-core.js?v=0.15.21",
  APP_BASE + "road-network-hotfix.js?v=0.15.21",
  APP_BASE + "road-catalog-hotfix.js?v=0.15.21",
  APP_BASE + "sync.js?v=0.15.21",
  APP_BASE + "road-sweep-hotfix.js?v=0.15.21",
  APP_BASE + "escape-navigation.js?v=0.15.21",
  APP_BASE + "iconic-routes-core.js?v=0.15.21",
  APP_BASE + "iconic-routes-catalog.js?v=0.15.21",
  APP_BASE + "iconic-route-catalog.js?v=0.15.21",
  APP_BASE + "iconic-routes.js?v=0.15.21",
  APP_BASE + "iconic-catalog-preview-hotfix.js?v=0.15.21",
  APP_BASE + "v0142-adjustments.js?v=0.15.21",
  APP_BASE + "crossing-detection-core.js?v=0.15.21",
  APP_BASE + "v0144-crossing-fix.js?v=0.15.21",
  APP_BASE + "v0145-crossed-cities.js?v=0.15.21",
  APP_BASE + "v0146-crossed-cities-runtime.js?v=0.15.21",
  APP_BASE + "v0147-crossed-cities-local.js?v=0.15.21"
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
