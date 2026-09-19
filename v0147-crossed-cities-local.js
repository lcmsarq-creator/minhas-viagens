(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.8";
  const core = window.MinhasViagensCrossingDetection;
  const SCHEMA = "route-city-crossings-v7-local-ar-uy";
  const V0145_SCHEMA = "route-city-crossings-v4-urban-place";
  const V0144_SCHEMA = "route-city-crossings-v3-admin";
  const LEGACY_SCHEMA = "route-city-crossings-v2-tabs";
  const BRAZIL_CSV = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";
  const LOCAL_CATALOGS = Object.freeze({
    AR: { path:"city-catalog/v1/ar.json", country:"Argentina" },
    UY: { path:"city-catalog/v1/uy.json", country:"Uruguai" }
  });
  const BRAZIL_PAD_DEG = .15;
  const RETRY_DELAYS = [15000, 60000, 180000, 600000, 1800000];
  const TILE_DEG = 1;
  const TILE_PADDING_DEG = .08;
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  if (!core) return;

  const states = {
    11:["RO","Rondônia"],12:["AC","Acre"],13:["AM","Amazonas"],14:["RR","Roraima"],15:["PA","Pará"],16:["AP","Amapá"],17:["TO","Tocantins"],
    21:["MA","Maranhão"],22:["PI","Piauí"],23:["CE","Ceará"],24:["RN","Rio Grande do Norte"],25:["PB","Paraíba"],26:["PE","Pernambuco"],27:["AL","Alagoas"],28:["SE","Sergipe"],29:["BA","Bahia"],
    31:["MG","Minas Gerais"],32:["ES","Espírito Santo"],33:["RJ","Rio de Janeiro"],35:["SP","São Paulo"],41:["PR","Paraná"],42:["SC","Santa Catarina"],43:["RS","Rio Grande do Sul"],
    50:["MS","Mato Grosso do Sul"],51:["MT","Mato Grosso"],52:["GO","Goiás"],53:["DF","Distrito Federal"]
  };

  let running = false;
  let rerunRequested = false;
  let startTimer = null;
  let retryTimer = null;
  let retryIndex = 0;
  const tileCache = new Map();
  const localCatalogCache = new Map();

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
      trip.routeCityScanSignature = oldRouteSignature(trip, LEGACY_SCHEMA);
    }
  }

  function parseBrazilCsv(text) {
    const out = [];
    const lines = String(text || "").split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const cols = row.split(",");
      if (cols.length < 6) continue;
      const [ibge,name,latitude,longitude,capital,ufCode] = cols;
      const state = states[Number(ufCode)] || ["",""];
      const lat = Number(latitude), lng = Number(longitude);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({ibge,name,lat,lng,capital:String(capital)==="1",stateCode:state[0],region:state[1]});
    }
    return out;
  }

  const brazilCatalogPromise = fetch(BRAZIL_CSV, {cache:"force-cache", mode:"cors"})
    .then(response => {
      if (!response.ok) throw new Error(`Catálogo brasileiro ${response.status}`);
      return response.text();
    })
    .then(parseBrazilCsv)
    .catch(error => {
      console.warn("Cidades cruzadas: catálogo brasileiro indisponível; usando fallback online", error);
      return [];
    });

  function catalogRadiusKm(city) {
    return city?.capital ? 10 : 4;
  }

  function lineBounds(line) {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const point of line || []) {
      const lat = Number(point?.[0]), lng = Number(point?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      s = Math.min(s, lat); w = Math.min(w, lng); n = Math.max(n, lat); e = Math.max(e, lng);
    }
    return Number.isFinite(s) ? {s,w,n,e} : null;
  }

  function minDistanceToLine(point, line) {
    let best = Infinity;
    for (let i = 1; i < (line?.length || 0); i++) {
      best = Math.min(best, core.pointSegmentDistanceKm(point, line[i - 1], line[i]));
      if (best <= .05) return best;
    }
    return best;
  }

  function brazilRecord(city) {
    return {
      label: [city.name, city.region, "Brasil"].filter(Boolean).join(", "),
      city: city.name,
      region: city.region || "",
      stateCode: city.stateCode || "",
      country: "Brasil",
      countryCode: "BR",
      lat: city.lat,
      lng: city.lng,
      ibge: city.ibge,
      source: "route-br-local-catalog"
    };
  }

  async function scanBrazilCatalog(line) {
    const catalog = await brazilCatalogPromise;
    if (!catalog.length || !Array.isArray(line) || line.length < 2) return {cities:[], available:false};
    const box = lineBounds(line);
    if (!box) return {cities:[], available:true};
    const found = [];
    for (const city of catalog) {
      if (city.lat < box.s - BRAZIL_PAD_DEG || city.lat > box.n + BRAZIL_PAD_DEG || city.lng < box.w - BRAZIL_PAD_DEG || city.lng > box.e + BRAZIL_PAD_DEG) continue;
      if (minDistanceToLine([city.lat, city.lng], line) > catalogRadiusKm(city)) continue;
      found.push(brazilRecord(city));
    }
    return {cities:core.uniqueCities(found), available:true};
  }


  function localCatalogRadiusKm(place = {}) {
    const population = Number(place.population) || 0;
    const featureCode = String(place.featureCode || "");
    if (population >= 5000000) return 12;
    if (population >= 1000000) return 8;
    if (population >= 500000) return 6;
    if (population >= 200000) return 5;
    if (population >= 100000) return 4.5;
    if (population >= 50000) return 3.8;
    if (population >= 10000) return 2.8;
    if (population >= 2000) return 2;
    if (population > 0) return 1.2;
    if (featureCode === "PPLC") return 8;
    if (/^PPLA/.test(featureCode) || featureCode === "PPLG") return 3;
    if (featureCode === "PPLL" || featureCode === "PPLF" || featureCode === "PPLR") return 1;
    return 1.5;
  }

  async function loadLocalCountryCatalog(code) {
    code = String(code || "").toUpperCase();
    const meta = LOCAL_CATALOGS[code];
    if (!meta) return { code, country:"", places:[], available:false };
    if (localCatalogCache.has(code)) return localCatalogCache.get(code);
    const promise = (async () => {
      const response = await fetch(`${meta.path}?v=${VERSION}`, { cache:"force-cache" });
      if (!response.ok) throw new Error(`Catálogo ${code} ${response.status}`);
      const payload = await response.json();
      if (payload?.schema !== "mv-city-catalog-v1" || payload?.countryCode !== code || !Array.isArray(payload?.places)) {
        throw new Error(`Catálogo ${code} inválido`);
      }
      return { code, country:meta.country, places:payload.places, available:true };
    })();
    localCatalogCache.set(code, promise);
    try { return await promise; }
    catch (error) {
      localCatalogCache.delete(code);
      console.warn(`Cidades cruzadas: catálogo local ${code} indisponível`, error);
      return { code, country:meta.country, places:[], available:false, error };
    }
  }

  function localCatalogRecord(row, code, country) {
    const [id,name,lat,lng,region,population,featureCode] = row || [];
    return {
      label:[name,region,country].filter(Boolean).join(", "),
      city:name || "",
      region:region || "",
      country:country || "",
      countryCode:code,
      lat:Number(lat),
      lng:Number(lng),
      geonameId:id,
      population:Number(population) || 0,
      featureCode:featureCode || "",
      source:`route-${String(code).toLowerCase()}-local-catalog`
    };
  }

  async function scanLocalCountryCatalog(line, code) {
    const catalog = await loadLocalCountryCatalog(code);
    if (!catalog.available || !Array.isArray(line) || line.length < 2) return { cities:[], available:false, code };
    const box = lineBounds(line);
    if (!box) return { cities:[], available:true, code };
    const found = [];
    for (const row of catalog.places) {
      const lat = Number(row?.[2]), lng = Number(row?.[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < box.s - BRAZIL_PAD_DEG || lat > box.n + BRAZIL_PAD_DEG || lng < box.w - BRAZIL_PAD_DEG || lng > box.e + BRAZIL_PAD_DEG) continue;
      const place = { population:Number(row?.[5]) || 0, featureCode:String(row?.[6] || "") };
      if (minDistanceToLine([lat,lng], line) > localCatalogRadiusKm(place)) continue;
      const record = localCatalogRecord(row, code, catalog.country);
      if (record.city) found.push(record);
    }
    return { cities:core.uniqueCities(found), available:true, code };
  }

  function explicitCountryCodes(trip) {
    return [...new Set([trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace]
      .filter(Boolean)
      .map(place => String(place.countryCode || "").toUpperCase())
      .filter(Boolean))];
  }

  function localCountryCodesAlongLine(line) {
    const api = window.MinhasViagensRoadCountry;
    if (!api?.countryHintFromPoint || !Array.isArray(line) || !line.length) return [];
    const found = new Set();
    const step = Math.max(1, Math.floor(line.length / 200));
    for (let i = 0; i < line.length; i += step) {
      const point = line[i];
      const code = String(api.countryHintFromPoint(Number(point?.[0]), Number(point?.[1])) || "").toUpperCase();
      if (LOCAL_CATALOGS[code]) found.add(code);
    }
    const last = line[line.length - 1];
    const lastCode = String(api.countryHintFromPoint(Number(last?.[0]), Number(last?.[1])) || "").toUpperCase();
    if (LOCAL_CATALOGS[lastCode]) found.add(lastCode);
    return [...found];
  }

  function needsInternationalScan(trip, availableLocalCodes = []) {
    const codes = explicitCountryCodes(trip);
    const supported = new Set(["BR", ...(availableLocalCodes || [])]);
    return !codes.length || codes.some(code => !supported.has(code));
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

  function tileKey(point) {
    const lat = Number(point?.[0]), lon = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    return `${Math.floor(lat / TILE_DEG)}:${Math.floor(lon / TILE_DEG)}`;
  }

  function tilesForLine(line) {
    const keys = new Set();
    for (const point of line || []) {
      const key = tileKey(point);
      if (key) keys.add(key);
    }
    return [...keys];
  }

  function tileBounds(key) {
    const [latIndex, lonIndex] = String(key).split(":").map(Number);
    if (!Number.isFinite(latIndex) || !Number.isFinite(lonIndex)) return null;
    return [
      latIndex * TILE_DEG - TILE_PADDING_DEG,
      lonIndex * TILE_DEG - TILE_PADDING_DEG,
      (latIndex + 1) * TILE_DEG + TILE_PADDING_DEG,
      (lonIndex + 1) * TILE_DEG + TILE_PADDING_DEG
    ];
  }

  function overpassQueryForTile(key) {
    const box = tileBounds(key);
    if (!box) return "";
    const [s,w,n,e] = box;
    return `[out:json][timeout:12];node["place"~"^(city|town|village)$"](${s},${w},${n},${e});out body;`;
  }

  async function fetchOverpass(query) {
    let last;
    for (const endpoint of OVERPASS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {headers:{"Accept":"application/json"}, signal:controller.signal});
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
    const promise = fetchOverpass(overpassQueryForTile(key)).then(elements => elements.filter(element => /^(city|town|village)$/.test(String(element?.tags?.place || "")) && pointOf(element)));
    tileCache.set(key, promise);
    try { return await promise; }
    catch (error) { tileCache.delete(key); throw error; }
  }

  async function scanInternational(line) {
    const found = [];
    for (const key of tilesForLine(line)) {
      const elements = await placesForTile(key);
      for (const element of elements) {
        const point = pointOf(element);
        if (!point || minDistanceToLine(point, line) > urbanRadiusKm(element.tags || {})) continue;
        const record = core.cityRecordFromElement(element, "route-place-international");
        if (record) found.push(record);
      }
      await sleep(60);
    }
    return core.uniqueCities(found);
  }

  async function scanTripCities(trip) {
    if (!trip || trip.mode === "aviao") return {cities:[], complete:true, source:"flight"};
    const line = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (!Array.isArray(line) || line.length < 2) return {cities:[], complete:true, source:"no-route"};

    const explicitCodes = explicitCountryCodes(trip);
    const inferredLocalCodes = localCountryCodesAlongLine(line);
    const codes = [...new Set([...explicitCodes, ...inferredLocalCodes])];
    const availableLocalCodes = [];
    const sourceParts = [];
    let cities = [];
    let localFailure = false;

    if (!codes.length || codes.includes("BR")) {
      const brazil = await scanBrazilCatalog(line);
      cities = core.uniqueCities([...cities, ...brazil.cities]);
      if (brazil.available) {
        availableLocalCodes.push("BR");
        sourceParts.push("local-br");
      } else localFailure = true;
    }

    for (const code of codes.filter(code => LOCAL_CATALOGS[code])) {
      const local = await scanLocalCountryCatalog(line, code);
      cities = core.uniqueCities([...cities, ...local.cities]);
      if (local.available) {
        availableLocalCodes.push(code);
        sourceParts.push(`local-${code.toLowerCase()}`);
      } else localFailure = true;
    }

    const internationalNeeded = localFailure || needsInternationalScan(trip, availableLocalCodes);
    if (!internationalNeeded) {
      return { cities:core.uniqueCities(cities), complete:true, source:sourceParts.join("+") || "local" };
    }

    try {
      const international = await scanInternational(line);
      cities = core.uniqueCities([...cities, ...international]);
      return { cities, complete:true, source:[...sourceParts,"overpass"].join("+") || "overpass" };
    } catch (error) {
      console.warn("Cidades cruzadas: complemento internacional ficará pendente", trip?.id, error);
      return { cities:core.uniqueCities(cities), complete:false, source:[...sourceParts,"partial"].join("+") || "pending", error };
    }
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

  cityConquestsForTrip = function cityConquestsForTripV0147(trip) {
    return mergedTripCities(trip);
  };

  function persistTripResult(trip, result) {
    const complete = Boolean(result?.complete);
    const incoming = Array.isArray(result?.cities) ? result.cities : [];
    trip.routeCityConquests = complete ? core.uniqueCities(incoming) : core.uniqueCities([...(trip.routeCityConquests || []), ...incoming]);
    trip.routeCityLocalSignature = routeSignature(trip);
    trip.routeCityScanVersion = SCHEMA;
    trip.routeCityScanComplete = complete;
    trip.routeCityScanSource = result?.source || "";
    trip.routeCityUrbanSignature = oldRouteSignature(trip, V0145_SCHEMA);
    trip.routeCityBoundarySignature = oldRouteSignature(trip, V0144_SCHEMA);
    trip.routeCityScanSignature = oldRouteSignature(trip, LEGACY_SCHEMA);
    trip.conquests ||= {};
    trip.conquests.cities = mergedTripCities(trip);
    saveTrips();
    renderAchievements();
    if (state.activeTripDetailId) renderTripDetail();
    window.MinhasViagensSync?.schedule?.(350);
  }

  function tripNeedsScan(trip) {
    if (!trip || trip.mode === "aviao") return false;
    return trip.routeCityLocalSignature !== routeSignature(trip) || trip.routeCityScanVersion !== SCHEMA || trip.routeCityScanComplete !== true;
  }

  async function processQueue() {
    if (running) { rerunRequested = true; return; }
    running = true;
    clearTimeout(retryTimer);
    suppressOldScanners();
    let partials = 0;
    let completed = 0;
    try {
      const pending = (state.trips || []).filter(tripNeedsScan);
      for (const trip of pending) {
        const result = await scanTripCities(trip);
        persistTripResult(trip, result);
        if (result.complete) completed += 1;
        else partials += 1;
        await sleep(40);
      }
    } finally {
      running = false;
      suppressOldScanners();
    }

    if (completed || partials) window.MinhasViagensSync?.schedule?.(250);
    if (rerunRequested) {
      rerunRequested = false;
      scheduleScan(200);
      return;
    }
    if (partials) {
      const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
      retryIndex += 1;
      retryTimer = setTimeout(processQueue, delay);
    } else retryIndex = 0;
  }

  function scheduleScan(delay = 250) {
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
      scheduleScan(120);
      return result;
    };
  }

  window.MinhasViagensCrossedCitiesV0147 = Object.freeze({
    version: VERSION,
    schema: SCHEMA,
    parseBrazilCsv,
    catalogRadiusKm,
    routeFingerprint,
    routeSignature,
    lineBounds,
    scanBrazilCatalog,
    localCatalogRadiusKm,
    loadLocalCountryCatalog,
    scanLocalCountryCatalog,
    explicitCountryCodes,
    localCountryCodesAlongLine,
    needsInternationalScan,
    overpassQueryForTile,
    scanTripCities,
    persistTripResult,
    tripNeedsScan,
    scheduleScan,
    catalogReady: brazilCatalogPromise
  });

  suppressOldScanners();
  scheduleScan(180);
  console.info(`Minhas Viagens ${VERSION}: cidades cruzadas por catálogo local brasileiro habilitadas.`);
})();
