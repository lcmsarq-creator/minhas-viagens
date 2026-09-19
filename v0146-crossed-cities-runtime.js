(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.7";
  const core = window.MinhasViagensCrossingDetection;
  const SCHEMA = "route-city-crossings-v5-incremental";
  const V0145_SCHEMA = "route-city-crossings-v4-urban-place";
  const V0144_SCHEMA = "route-city-crossings-v3-admin";
  const TILE_DEG = 1;
  const TILE_PADDING_DEG = .08;
  const RETRY_DELAYS = [15000, 60000, 180000, 600000, 1800000];
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  if (!core) return;

  const tileCache = new Map();
  let running = false;
  let rerunRequested = false;
  let startTimer = null;
  let retryTimer = null;
  let retryIndex = 0;

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function hashString(value = "") {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function routeFingerprint(trip) {
    const geometry = trip?.routeGeometry;
    if (typeof geometry?.encodedPolyline === "string") {
      return `poly:${geometry.pointCount || 0}:${geometry.encodedPolyline.length}:${hashString(geometry.encodedPolyline)}`;
    }
    if (Array.isArray(geometry?.coordinates)) {
      const coords = geometry.coordinates;
      const sample = [coords[0], coords[Math.floor(coords.length / 2)], coords.at?.(-1) || coords[coords.length - 1]];
      return `geo:${coords.length}:${hashString(JSON.stringify(sample))}`;
    }
    if (Array.isArray(trip?.points)) {
      const points = trip.points;
      const sample = [points[0], points[Math.floor(points.length / 2)], points.at?.(-1) || points[points.length - 1]];
      return `pts:${points.length}:${hashString(JSON.stringify(sample))}`;
    }
    return "none";
  }

  function routeSignature(trip, schema = SCHEMA) {
    return [schema, routeFingerprint(trip), trip?.updatedAt || trip?.createdAt || trip?.date || ""].join("|");
  }

  function oldRouteSignature(trip, schema) {
    const coords = trip?.routeGeometry?.coordinates || [];
    const first = coords[0] || [];
    const last = coords.at?.(-1) || coords[coords.length - 1] || [];
    return [schema, coords.length, first[0], first[1], last[0], last[1], trip?.updatedAt || trip?.createdAt || trip?.date || ""].join("|");
  }

  function suppressOldScanners() {
    for (const trip of state.trips || []) {
      trip.routeCityUrbanSignature = oldRouteSignature(trip, V0145_SCHEMA);
      trip.routeCityBoundarySignature = oldRouteSignature(trip, V0144_SCHEMA);
    }
  }

  function populationOf(tags = {}) {
    const raw = String(tags.population || "").replace(/[^0-9]/g, "");
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function urbanRadiusKm(tags = {}) {
    const place = String(tags.place || "").toLowerCase();
    const population = populationOf(tags);
    if (population >= 5000000) return 12;
    if (population >= 1000000) return 8;
    if (population >= 500000) return 6;
    if (population >= 200000) return 5;
    if (population >= 100000) return 4.5;
    if (population >= 50000) return 3.8;
    if (place === "city") return 4;
    if (place === "town") return 2.5;
    return 1.2;
  }

  function pointOf(element) {
    if (Number.isFinite(Number(element?.lat)) && Number.isFinite(Number(element?.lon))) return [Number(element.lat), Number(element.lon)];
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) return [Number(element.center.lat), Number(element.center.lon)];
    return null;
  }

  function minDistanceToLine(point, line) {
    let best = Infinity;
    for (let i = 1; i < (line?.length || 0); i++) best = Math.min(best, core.pointSegmentDistanceKm(point, line[i - 1], line[i]));
    return best;
  }

  function placeCrossesRoute(line, element) {
    const tags = element?.tags || {};
    if (!/^(city|town|village)$/.test(String(tags.place || ""))) return false;
    const point = pointOf(element);
    return Boolean(point && minDistanceToLine(point, line) <= urbanRadiusKm(tags));
  }

  function tileKey(point) {
    const lat = Number(point?.[0]), lon = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    return `${Math.floor(lat / TILE_DEG)}:${Math.floor(lon / TILE_DEG)}`;
  }

  function tileBounds(key) {
    const [latIndex, lonIndex] = String(key).split(":").map(Number);
    if (!Number.isFinite(latIndex) || !Number.isFinite(lonIndex)) return null;
    const s = latIndex * TILE_DEG - TILE_PADDING_DEG;
    const w = lonIndex * TILE_DEG - TILE_PADDING_DEG;
    const n = (latIndex + 1) * TILE_DEG + TILE_PADDING_DEG;
    const e = (lonIndex + 1) * TILE_DEG + TILE_PADDING_DEG;
    return [s, w, n, e];
  }

  function tilesForLine(line) {
    const keys = new Set();
    for (const point of line || []) {
      const key = tileKey(point);
      if (key) keys.add(key);
    }
    return [...keys];
  }

  function overpassQueryForTile(key) {
    const box = tileBounds(key);
    if (!box) return "";
    const [s, w, n, e] = box;
    return `[out:json][timeout:14];(` +
      `node["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
      `way["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
      `relation["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
      `);out body center;`;
  }

  async function fetchOverpass(query) {
    let last;
    for (const endpoint of OVERPASS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 14000);
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          headers: {"Accept":"application/json"},
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload?.elements)) throw new Error("Resposta Overpass inválida");
        return payload.elements;
      } catch (error) { last = error; }
    }
    throw last || new Error("Overpass indisponível");
  }

  async function placesForTile(key) {
    if (tileCache.has(key)) return tileCache.get(key);
    const promise = (async () => {
      const query = overpassQueryForTile(key);
      if (!query) return [];
      const elements = await fetchOverpass(query);
      return elements.filter(element => /^(city|town|village)$/.test(String(element?.tags?.place || "")) && pointOf(element));
    })();
    tileCache.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      tileCache.delete(key);
      throw error;
    }
  }

  async function scanTripCities(trip) {
    if (!trip || trip.mode === "aviao") return [];
    const line = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (!Array.isArray(line) || line.length < 2) return [];
    const found = [];
    for (const key of tilesForLine(line)) {
      const elements = await placesForTile(key);
      for (const element of elements) {
        if (!placeCrossesRoute(line, element)) continue;
        const record = core.cityRecordFromElement(element, "route-place-incremental");
        if (record) found.push(record);
      }
      await sleep(80);
    }
    return core.uniqueCities(found);
  }

  function explicitDestinationsForTrip(trip) {
    const places = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
    return core.uniqueCities(places.map(place => ({
      label: place.label || [place.city, place.region, place.country].filter(Boolean).join(", "),
      city: place.city || place.label || "",
      region: place.region || "",
      country: place.country || "",
      countryCode: place.countryCode || "",
      lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : undefined,
      lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : undefined,
      source: "trip-destination"
    })).filter(city => city.city));
  }

  function mergedTripCities(trip) {
    return core.uniqueCities([...explicitDestinationsForTrip(trip), ...(trip?.routeCityConquests || [])]);
  }

  cityConquestsForTrip = function cityConquestsForTripV0146(trip) {
    return mergedTripCities(trip);
  };

  function persistTripResult(trip, cities) {
    trip.routeCityConquests = cities;
    trip.routeCityRuntimeSignature = routeSignature(trip);
    trip.routeCityScanVersion = SCHEMA;
    trip.routeCityUrbanSignature = oldRouteSignature(trip, V0145_SCHEMA);
    trip.routeCityBoundarySignature = oldRouteSignature(trip, V0144_SCHEMA);
    trip.conquests ||= {};
    trip.conquests.cities = mergedTripCities(trip);
    saveTrips();
    renderAchievements();
    if (state.activeTripDetailId) renderTripDetail();
    window.MinhasViagensSync?.schedule?.(1200);
  }

  function tripNeedsScan(trip) {
    if (!trip || trip.mode === "aviao") return false;
    return trip.routeCityRuntimeSignature !== routeSignature(trip) || trip.routeCityScanVersion !== SCHEMA;
  }

  async function processQueue() {
    if (running) { rerunRequested = true; return; }
    running = true;
    clearTimeout(retryTimer);
    suppressOldScanners();
    let failures = 0;
    let completed = 0;
    try {
      const pending = (state.trips || []).filter(tripNeedsScan);
      for (const trip of pending) {
        try {
          const cities = await scanTripCities(trip);
          persistTripResult(trip, cities);
          completed += 1;
          retryIndex = 0;
        } catch (error) {
          failures += 1;
          console.warn("Cidades cruzadas: viagem ficará pendente para nova tentativa", trip?.id, error);
        }
        await sleep(120);
      }
    } finally {
      running = false;
      suppressOldScanners();
    }

    if (completed) window.MinhasViagensSync?.schedule?.(400);
    if (rerunRequested) {
      rerunRequested = false;
      scheduleScan(250);
      return;
    }
    if (failures) {
      const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
      retryIndex += 1;
      retryTimer = setTimeout(processQueue, delay);
    }
  }

  function scheduleScan(delay = 500) {
    if (window.MINHAS_VIAGENS_CITY_SCANNER_GENERATION === "v0147") return;
    suppressOldScanners();
    clearTimeout(startTimer);
    startTimer = setTimeout(processQueue, delay);
  }

  const app = window.MinhasViagensApp;
  if (app?.replaceTrips) {
    const baseReplaceTrips = app.replaceTrips.bind(app);
    app.replaceTrips = trips => {
      const result = baseReplaceTrips(trips);
      suppressOldScanners();
      scheduleScan(250);
      return result;
    };
  }

  window.MinhasViagensCrossedCitiesV0146 = Object.freeze({
    version: VERSION,
    schema: SCHEMA,
    hashString,
    routeFingerprint,
    routeSignature,
    urbanRadiusKm,
    tileKey,
    tileBounds,
    tilesForLine,
    overpassQueryForTile,
    placeCrossesRoute,
    scanTripCities,
    persistTripResult,
    tripNeedsScan,
    scheduleScan
  });

  suppressOldScanners();
  scheduleScan(300);
  console.info(`Minhas Viagens ${VERSION}: cidades cruzadas incrementais e persistentes habilitadas.`);
})();
