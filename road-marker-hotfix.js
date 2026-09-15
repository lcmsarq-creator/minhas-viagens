(() => {
  "use strict";

  const APP_VERSION = "0.13.11";
  const BADGE_LAYOUT_SCHEMA = "road-badges-v4-geographic-country-context";
  const TRANSIT_COUNTRIES = Object.freeze(["UY", "AR", "PY", "CL", "BO", "PE", "EC", "CO", "VE"]);
  const INTERNATIONAL_NETWORKS = Object.freeze({
    UY: "RU", AR: "RN", PY: "PY", CL: "CH", BO: "F", PE: "PE", EC: "E", CO: "RN", VE: "T"
  });
  const BRAZILIAN_ROAD_REF = /^(?:BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)-\d{1,4}[A-Z]?$/i;
  const layout = window.MinhasViagensRoadMarkerLayout;
  const baseTripRoadCountryContext = typeof tripRoadCountryContext === "function" ? tripRoadCountryContext : null;
  const baseInternationalRoadRef = typeof internationalRoadRef === "function" ? internationalRoadRef : null;

  if (baseTripRoadCountryContext) {
    tripRoadCountryContext = function tripRoadCountryContextSafeMulticountry(trip) {
      const context = baseTripRoadCountryContext(trip);
      if (!context || typeof context !== "object" || context.mode !== "AUTO") return context;
      const current = Array.isArray(context.countries)
        ? context.countries.map(code => String(code || "").toUpperCase()).filter(Boolean)
        : [];
      return {
        mode: "AUTO",
        countries: [...new Set([...current, ...TRANSIT_COUNTRIES])],
        hint: String(context.hint || "").toUpperCase()
      };
    };
  }

  function autoContextCountries(context) {
    if (!context || typeof context !== "object" || context.mode !== "AUTO") return [];
    return Array.isArray(context.countries)
      ? context.countries.map(code => String(code || "").toUpperCase()).filter(Boolean)
      : [];
  }

  function routeRefFromHint(raw, context) {
    if (!context || typeof context !== "object" || context.mode !== "AUTO") return "";
    const hint = String(context.hint || "").toUpperCase();
    const network = INTERNATIONAL_NETWORKS[hint];
    if (!network) return "";
    const value = String(raw || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    const match = value.match(/^(?:RN|RUTA(?:\s+NACIONAL)?)\s*-?\s*0*(\d{1,4}[A-Z]?)$/);
    return match ? `INT:${hint}:${network}:${match[1]}` : "";
  }

  if (baseInternationalRoadRef) {
    internationalRoadRef = function internationalRoadRefWithGeographicHint(raw, context) {
      return routeRefFromHint(raw, context) || baseInternationalRoadRef(raw, context);
    };
  }

  const URUGUAY_POLYGON = Object.freeze([
    [-34.98, -57.60], [-34.88, -58.43], [-33.25, -58.18], [-31.10, -57.82],
    [-30.08, -56.05], [-30.15, -55.15], [-30.72, -53.20], [-32.10, -53.15],
    [-33.85, -53.55], [-34.98, -55.65]
  ]);

  function pointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [yi, xi] = polygon[i];
      const [yj, xj] = polygon[j];
      const intersects = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function chileEastLimit(lat) {
    if (lat > -23) return -68.4;
    if (lat > -30) return -69.0;
    if (lat > -35) return -70.0;
    if (lat > -45) return -71.0;
    return -72.0;
  }

  function countryHintFromPoint(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    if (pointInPolygon(lat, lng, URUGUAY_POLYGON)) return "UY";
    if (lat >= -27.8 && lat <= -19.0 && lng >= -62.8 && lng <= -54.0) return "PY";
    if (lat >= -23.3 && lat <= -9.3 && lng >= -69.9 && lng <= -57.3) return "BO";
    if (lat >= -18.6 && lat <= -0.1 && lng >= -81.6 && lng <= -68.4) return "PE";
    if (lat >= -5.2 && lat <= 1.7 && lng >= -81.3 && lng <= -75.0) return "EC";
    if (lat >= -4.7 && lat <= 13.6 && lng >= -79.2 && lng <= -66.4) return "CO";
    if (lat >= 0.4 && lat <= 12.6 && lng >= -73.6 && lng <= -59.4) return "VE";
    if (lat >= -56.2 && lat <= -17.0 && lng >= -76.0 && lng <= chileEastLimit(lat)) return "CL";
    if (lat >= -55.5 && lat <= -21.0 && lng >= -73.8 && lng <= -53.4) return "AR";
    return "";
  }

  function countryHintFromCoordinates(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates.length) return "";
    const point = coordinates[Math.floor(coordinates.length / 2)];
    return Array.isArray(point) ? countryHintFromPoint(Number(point[0]), Number(point[1])) : "";
  }

  function stepContext(baseContext, coordinates) {
    if (!baseContext || typeof baseContext !== "object" || baseContext.mode !== "AUTO") return baseContext;
    const hint = countryHintFromCoordinates(coordinates) || String(baseContext.hint || "").toUpperCase();
    return {
      mode: "AUTO",
      countries: autoContextCountries(baseContext),
      hint
    };
  }

  function sanitizeRefs(refs, context) {
    const countries = autoContextCountries(context);
    if (!countries.length || countries.includes("BR")) return refs;
    return (refs || []).filter(label => {
      const value = String(label || "").toUpperCase();
      if (value.startsWith("INT:")) return true;
      return !BRAZILIAN_ROAD_REF.test(value);
    });
  }

  const status = window.MinhasViagensRoadMarkers = {
    version: APP_VERSION,
    schema: BADGE_LAYOUT_SCHEMA,
    minRoadKm: layout?.MIN_BADGE_ROAD_KM ?? 20,
    maxMinorInterruptionKm: layout?.MAX_MINOR_INTERRUPTION_KM ?? 20,
    rebuilding: false,
    rebuiltTrips: 0,
    refreshedTrips: 0,
    missingSegmentCaches: 0
  };

  if (!layout) {
    console.warn("Marcadores de rodovia: núcleo de layout indisponível.");
    return;
  }

  function routeTimeline(route, trip) {
    const baseContext = typeof tripRoadCountryContext === "function"
      ? tripRoadCountryContext(trip)
      : tripRoadCountry(trip);
    const chunks = [];
    for (const leg of route?.legs || []) {
      for (const step of leg.steps || []) {
        const coordinates = (step?.geometry?.coordinates || [])
          .filter(point => Array.isArray(point) && point.length >= 2)
          .map(([lng, lat]) => [Number(lat), Number(lng)])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        if (coordinates.length < 2) continue;
        const context = stepContext(baseContext, coordinates);
        const refs = sanitizeRefs(roadRefsFromStep(step, context), context);
        if (typeof rememberRoadCountryContext === "function" && refs[0]) rememberRoadCountryContext(baseContext, refs[0]);
        chunks.push({ label: refs[0] || "", line: coordinates });
      }
    }
    return chunks;
  }

  function lineKm(line) {
    let meters = 0;
    for (let i = 1; i < (line || []).length; i += 1) {
      const a = line[i - 1];
      const b = line[i];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      if (typeof map?.distance === "function" && typeof L?.latLng === "function") {
        meters += map.distance(L.latLng(a[0], a[1]), L.latLng(b[0], b[1]));
      }
    }
    return meters / 1000;
  }

  extractRoadLabelsFromRoute = function extractRoadLabelsFromRouteByContinuousRun(route, trip = null) {
    const timeline = routeTimeline(route, trip);
    const markers = layout.markersFromTimeline(timeline, { normalizeLabel: normalizeKey });
    if (trip) trip.roadBadgeLayoutVersion = BADGE_LAYOUT_SCHEMA;
    return markers;
  };

  extractHighwaysFromRoute = function extractHighwaysFromRouteByInternationalTimeline(route, trip = null) {
    const totals = new Map();
    const labels = new Map();
    for (const chunk of routeTimeline(route, trip)) {
      const label = String(chunk.label || "").trim();
      if (!label || !isHighwayRef(label)) continue;
      const key = normalizeKey(label);
      totals.set(key, (totals.get(key) || 0) + lineKm(chunk.line));
      if (!labels.has(key)) labels.set(key, label);
    }
    return [...labels.entries()]
      .filter(([key]) => (totals.get(key) || 0) >= 2)
      .map(([, label]) => label)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  };

  extractRoadSegmentsFromRoute = function extractRoadSegmentsFromRouteByInternationalTimeline(route, trip = null) {
    const result = {};
    for (const chunk of routeTimeline(route, trip)) {
      const label = String(chunk.label || "").trim();
      if (!label || !Array.isArray(chunk.line) || chunk.line.length < 2) continue;
      if (!result[label]) result[label] = [];
      result[label].push(chunk.line);
    }
    return result;
  };

  function addCandidateLabel(map, raw) {
    const label = String(raw?.label || raw || "").trim();
    if (!label) return;
    const key = normalizeKey(label);
    if (!map.has(key)) map.set(key, label);
  }

  function candidateLabels(trip) {
    const labels = new Map();
    for (const road of trip?.conquests?.roads || []) addCandidateLabel(labels, road);
    for (const badge of trip?.roadLabels || []) addCandidateLabel(labels, badge);
    return [...labels.values()];
  }

  function memorySegments(trip, label) {
    const entries = Object.entries(trip?.roadSegments || {});
    const match = entries.find(([road]) => normalizeKey(road) === normalizeKey(label));
    return Array.isArray(match?.[1]) ? match[1] : [];
  }

  function normalizeStoredRoadData(trip) {
    if (typeof tripRoadCountryContext !== "function") return false;
    const context = tripRoadCountryContext(trip);
    const countries = autoContextCountries(context);
    const foreignOnly = countries.length && !countries.includes("BR");
    let changed = false;
    const badgeLabels = new Map();
    const normalize = raw => {
      const international = internationalRoadRef(raw, context);
      if (international) return international;
      const cleaned = cleanRoadRef(raw);
      if (foreignOnly && BRAZILIAN_ROAD_REF.test(String(cleaned || ""))) return "";
      return cleaned;
    };

    for (const [index, badge] of (trip.roadLabels || []).entries()) {
      const raw = typeof badge === "string" ? badge : badge?.label;
      const label = normalize(raw);
      if (raw && label) badgeLabels.set(normalizeSimple(raw), label);
      if (typeof badge === "string" && badge !== label) { trip.roadLabels[index] = label; changed = true; }
      if (badge && typeof badge === "object" && badge.label !== label) { badge.label = label; changed = true; }
    }
    const roads = (trip.conquests?.roads || []).map(raw => {
      const known = badgeLabels.get(normalizeSimple(raw));
      return known || normalize(raw);
    }).filter(Boolean);
    if (roads.length !== (trip.conquests?.roads || []).length || roads.some((road, index) => road !== trip.conquests.roads[index])) {
      trip.conquests.roads = roads;
      changed = true;
    }

    const normalizedSegments = {};
    for (const [raw, lines] of Object.entries(trip.roadSegments || {})) {
      const label = normalize(raw);
      if (!label || !Array.isArray(lines)) { changed = true; continue; }
      if (!normalizedSegments[label]) normalizedSegments[label] = [];
      normalizedSegments[label].push(...lines);
      if (label !== raw) changed = true;
    }
    trip.roadSegments = normalizedSegments;
    return changed;
  }

  function badgesEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((badge, index) => {
      const other = right[index];
      return normalizeKey(badge?.label || badge) === normalizeKey(other?.label || other) &&
        Math.abs(Number(badge?.lat) - Number(other?.lat)) < 1e-6 &&
        Math.abs(Number(badge?.lng) - Number(other?.lng)) < 1e-6;
    });
  }

  async function refreshTripRoadDataFromRoute(trip) {
    if (!["carro", "moto"].includes(trip?.mode)) return false;
    if (typeof tripRoutingPoints !== "function" || typeof fetchOsrmRoute !== "function") return false;
    const points = tripRoutingPoints(trip);
    if (!Array.isArray(points) || points.length < 2) return false;

    try {
      const routes = await fetchOsrmRoute(points, false);
      const preferredIndex = Number.isInteger(Number(trip.routeAlternativeIndex))
        ? Number(trip.routeAlternativeIndex)
        : 0;
      const route = routes?.[preferredIndex] || routes?.[0];
      if (!route) return false;

      trip.roadLabels = extractRoadLabelsFromRoute(route, trip);
      trip.conquests ||= {};
      trip.conquests.roads = extractHighwaysFromRoute(route, trip);
      trip.roadSegments = extractRoadSegmentsFromRoute(route, trip);
      trip.roadBadgeLayoutVersion = BADGE_LAYOUT_SCHEMA;
      status.refreshedTrips += 1;
      return true;
    } catch (error) {
      console.warn("Não foi possível reconsultar a rota para corrigir as placas", trip?.id, error);
      return false;
    }
  }

  async function rebuildTripBadges(trip) {
    const refreshed = await refreshTripRoadDataFromRoute(trip);
    if (refreshed) return true;

    const normalized = normalizeStoredRoadData(trip);
    const segmentMap = {};
    for (const label of candidateLabels(trip)) {
      if (!label) continue;
      let lines = memorySegments(trip, label);
      if (!lines.length) {
        try { lines = await window.__mvGetTripRoadSegments?.(trip.id, label) || []; }
        catch { lines = []; }
      }
      if (!lines.length) {
        status.missingSegmentCaches += 1;
        continue;
      }
      segmentMap[label] = lines;
      trip.roadSegments ||= {};
      trip.roadSegments[label] = lines;
    }

    const markers = layout.markersFromSegmentMap(segmentMap, { normalizeLabel: normalizeKey });
    const changed = !badgesEqual(trip.roadLabels || [], markers) || trip.roadBadgeLayoutVersion !== BADGE_LAYOUT_SCHEMA;
    trip.roadLabels = markers;
    trip.roadBadgeLayoutVersion = BADGE_LAYOUT_SCHEMA;
    return changed || normalized;
  }

  let rebuildTimer = null;
  let rerunRequested = false;

  async function rebuildStoredBadges() {
    if (status.rebuilding) {
      rerunRequested = true;
      return;
    }
    status.rebuilding = true;
    status.rebuiltTrips = 0;
    status.refreshedTrips = 0;
    status.missingSegmentCaches = 0;
    let changed = false;

    try {
      const snapshot = [...(state.trips || [])];
      for (const trip of snapshot) {
        if (trip?.roadBadgeLayoutVersion === BADGE_LAYOUT_SCHEMA) continue;
        if (!state.trips.includes(trip)) {
          rerunRequested = true;
          break;
        }
        changed = await rebuildTripBadges(trip) || changed;
        status.rebuiltTrips += 1;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (changed) {
        saveTrips();
        renderTrips();
      }
    } catch (error) {
      console.warn("Não foi possível reconstruir todos os marcadores de rodovia", error);
    } finally {
      status.rebuilding = false;
      if (rerunRequested) {
        rerunRequested = false;
        scheduleRebuild(50);
      }
    }
  }

  function scheduleRebuild(delay = 100) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildStoredBadges, delay);
  }

  const app = window.MinhasViagensApp;
  if (app?.replaceTrips) {
    const baseReplaceTrips = app.replaceTrips.bind(app);
    app.replaceTrips = trips => {
      const result = baseReplaceTrips(trips);
      scheduleRebuild(50);
      return result;
    };
  }

  scheduleRebuild(100);

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: placas internacionais classificadas por trecho; fallback brasileiro bloqueado fora do Brasil.`);
})();
