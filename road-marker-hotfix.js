(() => {
  "use strict";

  const APP_VERSION = "0.13.4";
  const BADGE_LAYOUT_SCHEMA = "road-badges-v1-20km";
  const layout = window.MinhasViagensRoadMarkerLayout;
  const baseExtractRoadLabels = typeof extractRoadLabelsFromRoute === "function" ? extractRoadLabelsFromRoute : null;

  const status = window.MinhasViagensRoadMarkers = {
    version: APP_VERSION,
    schema: BADGE_LAYOUT_SCHEMA,
    minRoadKm: layout?.MIN_BADGE_ROAD_KM ?? 20,
    maxMinorInterruptionKm: layout?.MAX_MINOR_INTERRUPTION_KM ?? 20,
    rebuilding: false,
    rebuiltTrips: 0,
    missingSegmentCaches: 0
  };

  if (!layout || !baseExtractRoadLabels) {
    console.warn("Marcadores de rodovia: núcleo ou extrator base indisponível.");
    return;
  }

  function routeTimeline(route, trip) {
    const countryCode = tripRoadCountry(trip);
    const chunks = [];
    for (const leg of route?.legs || []) {
      for (const step of leg.steps || []) {
        const coordinates = (step?.geometry?.coordinates || [])
          .filter(point => Array.isArray(point) && point.length >= 2)
          .map(([lng, lat]) => [Number(lat), Number(lng)])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        if (coordinates.length < 2) continue;
        const refs = roadRefsFromStep(step, countryCode);
        chunks.push({ label: refs[0] || "", line: coordinates });
      }
    }
    return chunks;
  }

  extractRoadLabelsFromRoute = function extractRoadLabelsFromRouteByContinuousRun(route, trip = null) {
    const timeline = routeTimeline(route, trip);
    const markers = layout.markersFromTimeline(timeline, { normalizeLabel: normalizeKey });
    if (trip) trip.roadBadgeLayoutVersion = BADGE_LAYOUT_SCHEMA;
    return markers;
  };

  // A lista de conquistas tinha como fonte o extrator de placas. Como as placas
  // agora exigem mais de 20 km, preserva aqui o extrator anterior, que já aplica
  // exclusivamente o limite de 2 km definido para conceder uma rodovia.
  extractHighwaysFromRoute = function extractHighwaysFromRouteWithoutBadgeThreshold(route, trip = null) {
    const roads = new Map();
    for (const badge of baseExtractRoadLabels(route, trip) || []) {
      const cleaned = cleanRoadRef(badge?.label || badge);
      if (!cleaned || !isHighwayRef(cleaned)) continue;
      const key = normalizeKey(cleaned);
      if (!roads.has(key)) roads.set(key, cleaned);
    }
    return [...roads.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
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

  function badgesEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((badge, index) => {
      const other = right[index];
      return normalizeKey(badge?.label || badge) === normalizeKey(other?.label || other) &&
        Math.abs(Number(badge?.lat) - Number(other?.lat)) < 1e-6 &&
        Math.abs(Number(badge?.lng) - Number(other?.lng)) < 1e-6;
    });
  }

  async function rebuildTripBadges(trip) {
    const segmentMap = {};
    for (const label of candidateLabels(trip)) {
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
    return changed;
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

  console.info(`Minhas Viagens ${APP_VERSION}: um escudo por trecho de rodovia acima de 20 km; interrupções acima de 20 km iniciam novo trecho.`);
})();
