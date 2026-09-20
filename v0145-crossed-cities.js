(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.9";
  const core = window.MinhasViagensCrossingDetection;
  const SCHEMA = "route-city-crossings-v4-urban-place";
  const V0144_SCHEMA = "route-city-crossings-v3-admin";
  const MAX_CHUNK_KM = 60;
  const PADDING_DEG = .065;
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  if (!core) return;

  const inflight = new Map();
  let scanTimer = null;
  let generation = 0;

  function routeSignature(trip, schema = SCHEMA) {
    const coords = trip?.routeGeometry?.coordinates || [];
    const first = coords[0] || [];
    const last = coords.at?.(-1) || coords[coords.length - 1] || [];
    return [schema, coords.length, first[0], first[1], last[0], last[1], trip?.updatedAt || trip?.createdAt || trip?.date || ""].join("|");
  }

  function suppressV0144Scanner() {
    for (const trip of state.trips || []) trip.routeCityBoundarySignature = routeSignature(trip, V0144_SCHEMA);
  }

  function simplify(line, minKm = .20) {
    if (!Array.isArray(line) || line.length <= 2) return line || [];
    const out = [line[0]];
    let last = line[0];
    for (let i = 1; i < line.length - 1; i++) {
      if (core.haversineKm(last, line[i]) >= minKm) { out.push(line[i]); last = line[i]; }
    }
    out.push(line.at(-1));
    return out;
  }

  function chunks(line) {
    const out = [];
    let current = [line[0]], km = 0;
    for (let i = 1; i < line.length; i++) {
      const edge = core.haversineKm(line[i - 1], line[i]);
      if (km + edge > MAX_CHUNK_KM && current.length > 1) {
        out.push(current); current = [line[i - 1], line[i]]; km = edge;
      } else { current.push(line[i]); km += edge; }
    }
    if (current.length > 1) out.push(current);
    return out;
  }

  function bounds(line) {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const p of line || []) {
      const lat = Number(p?.[0]), lon = Number(p?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      s = Math.min(s, lat); w = Math.min(w, lon); n = Math.max(n, lat); e = Math.max(e, lon);
    }
    return Number.isFinite(s) ? [s - PADDING_DEG, w - PADDING_DEG, n + PADDING_DEG, e + PADDING_DEG] : null;
  }

  async function fetchOverpass(query) {
    let last;
    for (const endpoint of OVERPASS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 18000);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        return await response.json();
      } catch (error) { last = error; }
    }
    throw last || new Error("Overpass indisponível");
  }

  function pointOf(element) {
    if (Number.isFinite(Number(element?.lat)) && Number.isFinite(Number(element?.lon))) return [Number(element.lat), Number(element.lon)];
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) return [Number(element.center.lat), Number(element.center.lon)];
    return null;
  }

  function populationOf(tags = {}) {
    const raw = String(tags.population || "").replace(/[^0-9]/g, "");
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function urbanRadiusKm(tags = {}) {
    const place = String(tags.place || "").toLowerCase();
    const population = populationOf(tags);
    if (population >= 1000000) return 6;
    if (population >= 300000) return 5;
    if (population >= 100000) return 4.2;
    if (population >= 50000) return 3.5;
    if (place === "city") return 3.6;
    if (place === "town") return 2.2;
    return 1.1;
  }

  function minDistanceToLine(point, line) {
    let best = Infinity;
    for (let i = 1; i < (line?.length || 0); i++) best = Math.min(best, core.pointSegmentDistanceKm(point, line[i - 1], line[i]));
    return best;
  }

  function placeGeometryCrosses(line, element) {
    const outer = core.relationOuterLines(element);
    if (!outer.length) return false;
    if (outer.some(boundary => core.linesCross(line, boundary, {toleranceKm:0, minAngleDeg:0}))) return true;
    const rings = core.stitchRings(outer);
    return rings.some(ring => (line || []).some(point => core.pointInPolygon(point, ring)));
  }

  function placeCrossesRoute(line, element) {
    const tags = element?.tags || {};
    if (!/^(city|town|village)$/.test(String(tags.place || ""))) return false;
    if (element.type !== "node" && placeGeometryCrosses(line, element)) return true;
    const point = pointOf(element);
    return Boolean(point && minDistanceToLine(point, line) <= urbanRadiusKm(tags));
  }

  function enrichFromMunicipality(record, municipalities) {
    if (!record) return record;
    const name = core.normalizeSimple(record.city || record.label);
    const match = (municipalities || []).find(element => core.normalizeSimple(element?.tags?.name) === name);
    if (!match) return record;
    const admin = core.cityRecordFromElement(match, record.source);
    if (!admin) return record;
    const region = record.region || admin.region || "";
    const countryCode = record.countryCode || admin.countryCode || "";
    const country = record.country || admin.country || "";
    return {...record, region, countryCode, country, label:[record.city,region,country].filter(Boolean).join(", ") || record.label};
  }

  async function scanTripCities(trip) {
    if (!trip || trip.mode === "aviao") return [];
    const raw = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (raw.length < 2) return [];
    const line = simplify(raw);
    const found = [];

    for (const chunk of chunks(line)) {
      const box = bounds(chunk);
      if (!box) continue;
      const [s,w,n,e] = box;
      const query = `[out:json][timeout:16];(` +
        `node["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `way["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `relation["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `relation["boundary"="administrative"]["admin_level"="8"](${s},${w},${n},${e});` +
        `);out center geom tags;`;
      const payload = await fetchOverpass(query);
      const elements = payload?.elements || [];
      const municipalities = elements.filter(core.administrativeBoundaryReliable);
      const places = elements.filter(element => /^(city|town|village)$/.test(String(element?.tags?.place || "")));

      for (const element of places) {
        if (!placeCrossesRoute(chunk, element)) continue;
        const base = core.cityRecordFromElement(element, element.type === "node" ? "route-urban-radius" : "route-urban-boundary");
        const record = enrichFromMunicipality(base, municipalities);
        if (record) found.push(record);
      }
    }
    return core.uniqueCities(found);
  }

  function explicitDestinationsForTrip(trip) {
    const places = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
    return core.uniqueCities(places.map(place => ({
      label: place.label || [place.city,place.region,place.country].filter(Boolean).join(", "),
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

  cityConquestsForTrip = function cityConquestsForTripV0145(trip) {
    return mergedTripCities(trip);
  };

  async function enrichTrip(trip) {
    const signature = routeSignature(trip);
    if (!trip || trip.routeCityUrbanSignature === signature) return false;
    if (inflight.has(trip.id)) return inflight.get(trip.id);
    const task = (async () => {
      try {
        const cities = await scanTripCities(trip);
        trip.routeCityConquests = cities;
        trip.routeCityUrbanSignature = signature;
        trip.routeCityScanVersion = SCHEMA;
        trip.routeCityBoundarySignature = routeSignature(trip, V0144_SCHEMA);
        trip.conquests ||= {};
        trip.conquests.cities = mergedTripCities(trip);
        return true;
      } catch (error) {
        console.warn("Não foi possível atualizar cidades cruzadas por área urbana", trip?.id, error);
        return false;
      } finally { inflight.delete(trip.id); }
    })();
    inflight.set(trip.id, task);
    return task;
  }

  function scheduleScans(delay = 900) {
    if (window.MINHAS_VIAGENS_CITY_SCANNER_GENERATION === "v0147") return;
    clearTimeout(scanTimer);
    const current = ++generation;
    suppressV0144Scanner();
    scanTimer = setTimeout(async () => {
      let changed = false;
      const trips = [...(state.trips || [])];
      let index = 0;
      async function worker() {
        while (index < trips.length) {
          const trip = trips[index++];
          if (current !== generation) return;
          changed = (await enrichTrip(trip)) || changed;
          await new Promise(resolve => setTimeout(resolve,45));
        }
      }
      await Promise.all([worker(), worker()]);
      suppressV0144Scanner();
      if (!changed || current !== generation) return;
      saveTrips();
      renderAchievements();
      if (state.activeTripDetailId) renderTripDetail();
    }, delay);
  }

  const app = window.MinhasViagensApp;
  if (app?.replaceTrips) {
    const baseReplaceTrips = app.replaceTrips.bind(app);
    app.replaceTrips = trips => {
      const result = baseReplaceTrips(trips);
      scheduleScans(250);
      return result;
    };
  }

  window.MinhasViagensCrossedCitiesV0145 = Object.freeze({
    version: VERSION,
    schema: SCHEMA,
    urbanRadiusKm,
    placeCrossesRoute,
    enrichFromMunicipality,
    scanTripCities,
    scheduleScans
  });

  suppressV0144Scanner();
  scheduleScans();
  console.info(`Minhas Viagens ${VERSION}: cidades cruzadas por área urbana habilitadas.`);
})();
