(() => {
  "use strict";

  const APP_VERSION = "0.11.0";
  const MANIFEST_SCHEMA = "road-catalog-manifest-v1";
  const CATALOG_SCHEMA = "road-catalog-polyline5-v1";
  const VALIDATION_SCHEMA = "complete-road-catalog-v1";
  const CLOUD_VALIDATION_SCHEMA = "complete-road-v3";
  const FETCH_TIMEOUT_MS = 5000;
  const DEFAULT_CATALOG_ROOT = "https://raw.githubusercontent.com/lcmsarq-creator/minhas-viagens/main/road-catalog/v1/";
  const CATALOG_ROOT = new URL(window.MINHAS_VIAGENS_ROAD_CATALOG_ROOT || DEFAULT_CATALOG_ROOT).href;
  const compact = window.MinhasViagensGeometryCompact;

  if (!compact?.decodePolyline || typeof cachedHighway !== "function" || typeof fetchFullHighway !== "function") return;

  const baseCachedHighway = cachedHighway;
  const baseFetchFullHighway = fetchFullHighway;
  const missedKeys = new Set();
  let manifestPromise = null;

  const stats = window.MinhasViagensRoadCatalogStats = {
    version: APP_VERSION,
    available: false,
    revision: null,
    roadCount: 0,
    hits: 0,
    misses: 0,
    failures: 0,
    localHits: 0,
    lastError: ""
  };

  function safePathSegment(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function pathForKey(key) {
    const parts = String(key || "").split("|");
    if (parts.length !== 3 || parts.some(part => !safePathSegment(part))) return "";
    return `${parts.map(safePathSegment).join("/")}.json`;
  }

  function isValidatedCatalogEntry(entry) {
    if (!entry?.lines?.length || entry.partial === true || entry.needsNetworkRefresh === true) return false;
    if (entry.catalogSchema !== CATALOG_SCHEMA || entry.catalogValidationSchema !== VALIDATION_SCHEMA) return false;
    const required = window.MinhasViagensRoadNetwork?.schema || "";
    return !required || entry.networkFetchSchema === required;
  }

  function isTrustedLocalEntry(entry) {
    return isValidatedCatalogEntry(entry) || (
      Boolean(entry?.lines?.length) &&
      entry.cloudValidationSchema === CLOUD_VALIDATION_SCHEMA &&
      entry.partial !== true &&
      entry.needsNetworkRefresh !== true
    );
  }

  async function fetchJson(url, signal, cache = "default") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const relayAbort = () => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal, cache });
      if (!response.ok) throw new Error(`Catálogo ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relayAbort);
    }
  }

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetchJson(`${CATALOG_ROOT}manifest.json`, null, "no-cache")
      .then(manifest => {
        if (manifest?.schema !== MANIFEST_SCHEMA || manifest.catalogSchema !== CATALOG_SCHEMA ||
          manifest.validationSchema !== VALIDATION_SCHEMA || !manifest.roads || typeof manifest.roads !== "object") {
          throw new Error("Manifesto do catálogo incompatível");
        }
        stats.available = true;
        stats.revision = String(manifest.revision || "");
        stats.roadCount = Number(manifest.roadCount) || Object.keys(manifest.roads).length;
        stats.lastError = "";
        missedKeys.clear();
        return manifest;
      })
      .catch(error => {
        stats.available = false;
        stats.failures += 1;
        stats.lastError = String(error?.message || error || "Catálogo indisponível");
        manifestPromise = null;
        return null;
      });
    return manifestPromise;
  }

  function hydratePayload(payload, descriptor) {
    const expectedKey = highwayCacheKey(descriptor);
    if (!payload || payload.kind !== "road_geometry_catalog" || payload.schema !== CATALOG_SCHEMA ||
      payload.validationSchema !== VALIDATION_SCHEMA || payload.key !== expectedKey || payload.partial === true ||
      Number(payload.cacheVersion) !== HIGHWAY_CACHE_VERSION || !Array.isArray(payload.encodedLines)) return null;
    const precision = Number(payload.precision) || 5;
    const lines = payload.encodedLines
      .map(encoded => compact.decodePolyline(encoded, precision))
      .filter(line => Array.isArray(line) && line.length > 1);
    if (!lines.length) return null;
    const requiredNetworkSchema = window.MinhasViagensRoadNetwork?.schema || "";
    return {
      key: expectedKey,
      version: HIGHWAY_CACHE_VERSION,
      updatedAt: Date.now(),
      ttl: HIGHWAY_CACHE_TTL,
      lines,
      partial: false,
      totalKm: Number(payload.totalKm) || lines.reduce((sum, line) => sum + lineLengthKm(line), 0),
      bounds: Array.isArray(payload.bounds) ? payload.bounds : null,
      compactToleranceM: Number(payload.compactToleranceM) || 25,
      pointCount: Number(payload.pointCount) || lines.reduce((sum, line) => sum + line.length, 0),
      networkFetchSchema: requiredNetworkSchema,
      needsNetworkRefresh: false,
      catalogSchema: CATALOG_SCHEMA,
      catalogValidationSchema: VALIDATION_SCHEMA,
      catalogRevision: stats.revision,
      catalogSource: "OpenStreetMap/Geofabrik"
    };
  }

  async function catalogEntryFor(descriptor, signal = null) {
    if (!descriptor || String(descriptor.countryCode || "BR").toUpperCase() !== "BR") return null;
    const key = highwayCacheKey(descriptor);
    if (missedKeys.has(key)) return null;
    const manifest = await loadManifest();
    const item = manifest?.roads?.[key];
    if (!item) {
      missedKeys.add(key);
      stats.misses += 1;
      return null;
    }
    const relativePath = String(item.path || pathForKey(key));
    if (!relativePath || relativePath.includes("..")) return null;
    try {
      const revision = encodeURIComponent(String(manifest.revision || "1"));
      const payload = await fetchJson(`${CATALOG_ROOT}${relativePath}?v=${revision}`, signal, "force-cache");
      const entry = hydratePayload(payload, descriptor);
      if (!entry) throw new Error("Geometria do catálogo incompatível");
      try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry); } catch {}
      stats.hits += 1;
      return entry;
    } catch (error) {
      if (signal?.aborted) throw error;
      missedKeys.add(key);
      stats.failures += 1;
      stats.lastError = String(error?.message || error || "Falha no catálogo");
      return null;
    }
  }

  cachedHighway = async function cachedHighwayCatalogFirst(descriptor, allowExpired = false) {
    const local = await baseCachedHighway(descriptor, allowExpired);
    if (isTrustedLocalEntry(local)) {
      stats.localHits += 1;
      return local;
    }
    const catalog = await catalogEntryFor(descriptor);
    return catalog || local;
  };

  fetchFullHighway = async function fetchFullHighwayCatalogFirst(descriptor, signal, onStatus = () => {}) {
    onStatus("Consultando o catálogo de rodovias…");
    const catalog = await catalogEntryFor(descriptor, signal);
    if (catalog) {
      onStatus("Rodovia integral carregada do catálogo.");
      return catalog;
    }
    return baseFetchFullHighway(descriptor, signal, onStatus);
  };

  window.MinhasViagensRoadCatalog = {
    schema: CATALOG_SCHEMA,
    validationSchema: VALIDATION_SCHEMA,
    stats,
    loadManifest,
    catalogEntryFor,
    isValidatedEntry: isValidatedCatalogEntry,
    pathForKey
  };

  loadManifest();
  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
  console.info(`Minhas Viagens ${APP_VERSION}: catálogo rodoviário instantâneo habilitado com fallback Overpass.`);
})();
