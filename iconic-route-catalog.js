(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.13.18";
  const MANIFEST_SCHEMA = "iconic-route-preview-manifest-v1";
  const CATALOG_SCHEMA = "iconic-route-preview-polyline5-v1";
  const BUNDLE_SCHEMA = "iconic-route-preview-bundle-v1";
  const FETCH_TIMEOUT_MS = 8000;
  const LOCAL_ROOT = new URL("iconic-route-catalog/v1/", document.baseURI).href;
  const RAW_ROOT = "https://raw.githubusercontent.com/lcmsarq-creator/minhas-viagens/main/iconic-route-catalog/v1/";
  const CATALOG_ROOT = new URL(window.MINHAS_VIAGENS_ICONIC_ROUTE_CATALOG_ROOT || LOCAL_ROOT).href;
  const compact = window.MinhasViagensGeometryCompact;
  const iconicCatalog = window.MinhasViagensIconicCatalog;

  if (!compact?.decodePolyline || !iconicCatalog?.routes?.length) return;

  const entries = new Map();
  const routePromises = new Map();
  let bundlePromise = null;
  let manifestPromise = null;

  const stats = window.MinhasViagensIconicRouteCatalogStats = {
    version: VERSION,
    available: false,
    revision: "",
    routeCount: 0,
    decodedCount: 0,
    bundleBytes: 0,
    bundleSource: "",
    hits: 0,
    fallbackHits: 0,
    failures: 0,
    lastError: ""
  };

  function decodeLines(values, precision) {
    return (values || [])
      .map(value => compact.decodePolyline(value, precision))
      .filter(line => Array.isArray(line) && line.length > 1);
  }

  function hydrateEntry(id, payload) {
    if (!payload || !Array.isArray(payload.encodedLines)) return null;
    const precision = Number(payload.precision) || 5;
    const lines = decodeLines(payload.encodedLines, precision);
    const alternateLines = decodeLines(payload.alternateEncodedLines, precision);
    if (!lines.length) return null;
    return Object.freeze({
      id: String(id),
      lines,
      alternateLines,
      bounds: Array.isArray(payload.bounds) ? payload.bounds : null,
      totalKm: Number(payload.totalKm) || 0,
      alternateTotalKm: Number(payload.alternateTotalKm) || 0,
      source: "hosted-iconic-route-catalog"
    });
  }

  async function fetchJson(url, cache = "force-cache") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { cache, signal: controller.signal });
      if (!response.ok) throw new Error(`Catálogo icônico ${response.status}`);
      const text = await response.text();
      return { payload: JSON.parse(text), bytes: new Blob([text]).size };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchFromRoots(filename, cache = "force-cache") {
    const roots = CATALOG_ROOT === RAW_ROOT ? [CATALOG_ROOT] : [CATALOG_ROOT, RAW_ROOT];
    let lastError = null;
    for (const root of roots) {
      try {
        const result = await fetchJson(`${root}${filename}`, cache);
        return { ...result, root };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Catálogo icônico indisponível");
  }

  function validateBundle(bundle) {
    if (!bundle || bundle.kind !== "iconic_route_preview_bundle" || bundle.schema !== BUNDLE_SCHEMA ||
      bundle.catalogSchema !== CATALOG_SCHEMA || !bundle.routes || typeof bundle.routes !== "object") {
      throw new Error("Bundle de rotas icônicas incompatível");
    }
    const expectedIds = new Set(iconicCatalog.routes.map(route => String(route.id)));
    const availableIds = Object.keys(bundle.routes);
    if (availableIds.length < expectedIds.size || [...expectedIds].some(id => !bundle.routes[id])) {
      throw new Error(`Bundle incompleto: ${availableIds.length}/${expectedIds.size} rotas`);
    }
    return expectedIds;
  }

  async function loadBundle() {
    if (bundlePromise) return bundlePromise;
    bundlePromise = (async () => {
      try {
        const { payload: bundle, bytes, root } = await fetchFromRoots(`bundle.json?v=${encodeURIComponent(VERSION)}`, "force-cache");
        const expectedIds = validateBundle(bundle);
        const hydrated = new Map();
        for (const id of expectedIds) {
          const entry = hydrateEntry(id, bundle.routes[id]);
          if (!entry) throw new Error(`Geometria hospedada inválida: ${id}`);
          hydrated.set(id, entry);
        }
        entries.clear();
        for (const [id, entry] of hydrated) entries.set(id, entry);
        stats.available = true;
        stats.revision = String(bundle.revision || "");
        stats.routeCount = Number(bundle.routeCount) || Object.keys(bundle.routes).length;
        stats.decodedCount = entries.size;
        stats.bundleBytes = bytes;
        stats.bundleSource = root;
        stats.lastError = "";
        return true;
      } catch (error) {
        stats.available = false;
        stats.failures += 1;
        stats.lastError = String(error?.message || error || "Falha no bundle icônico");
        console.warn("Não foi possível carregar o bundle hospedado de rotas icônicas", error);
        return false;
      }
    })();
    return bundlePromise;
  }

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = (async () => {
      try {
        const { payload } = await fetchFromRoots(`manifest.json?v=${encodeURIComponent(VERSION)}`, "force-cache");
        if (payload?.schema !== MANIFEST_SCHEMA || payload.catalogSchema !== CATALOG_SCHEMA || !payload.routes) {
          throw new Error("Manifesto icônico incompatível");
        }
        return payload;
      } catch (error) {
        manifestPromise = null;
        throw error;
      }
    })();
    return manifestPromise;
  }

  function entryFor(routeId) {
    const entry = entries.get(String(routeId));
    if (entry) stats.hits += 1;
    return entry || null;
  }

  async function loadRoute(routeId) {
    const id = String(routeId || "");
    if (!id) return null;
    const ready = entryFor(id);
    if (ready) return ready;
    if (routePromises.has(id)) return routePromises.get(id);

    const promise = (async () => {
      try {
        const manifest = await loadManifest();
        const item = manifest?.routes?.[id];
        if (!item?.path || String(item.path).includes("..")) return null;
        const revision = encodeURIComponent(String(manifest.revision || VERSION));
        const { payload } = await fetchFromRoots(`${item.path}?v=${revision}`, "force-cache");
        if (payload?.kind !== "iconic_route_preview_catalog" || payload.schema !== CATALOG_SCHEMA || String(payload.id) !== id) {
          throw new Error(`Entrada icônica incompatível: ${id}`);
        }
        const entry = hydrateEntry(id, payload);
        if (!entry) throw new Error(`Entrada icônica vazia: ${id}`);
        entries.set(id, entry);
        stats.fallbackHits += 1;
        stats.decodedCount = entries.size;
        return entry;
      } catch (error) {
        stats.failures += 1;
        stats.lastError = String(error?.message || error || "Falha ao carregar rota icônica");
        return null;
      } finally {
        routePromises.delete(id);
      }
    })();
    routePromises.set(id, promise);
    return promise;
  }

  const ready = loadBundle();

  window.MinhasViagensIconicRouteCatalog = Object.freeze({
    version: VERSION,
    manifestSchema: MANIFEST_SCHEMA,
    schema: CATALOG_SCHEMA,
    bundleSchema: BUNDLE_SCHEMA,
    root: CATALOG_ROOT,
    stats,
    loadBundle,
    loadManifest,
    entryFor,
    loadRoute,
    has: routeId => entries.has(String(routeId)),
    decodedCount: () => entries.size
  });
  window.MinhasViagensIconicRouteCatalogReady = ready;
})();
