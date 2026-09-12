(() => {
  "use strict";

  const APP_VERSION = "0.10.9";
  const MIN_CONTINUOUS_ROAD_KM = 2;

  const baseMatchingRoadSegments = typeof matchingRoadSegments === "function" ? matchingRoadSegments : null;
  const baseExtractRoadSegments = typeof extractRoadSegmentsFromRoute === "function" ? extractRoadSegmentsFromRoute : null;
  const baseExtractRoadLabels = typeof extractRoadLabelsFromRoute === "function" ? extractRoadLabelsFromRoute : null;
  const baseExtractHighways = typeof extractHighwaysFromRoute === "function" ? extractHighwaysFromRoute : null;

  function validContinuousRuns(lines) {
    return (Array.isArray(lines) ? lines : []).filter(line =>
      Array.isArray(line) && line.length > 1 && lineLengthKm(line) >= MIN_CONTINUOUS_ROAD_KM
    );
  }

  function filterSegmentMap(source) {
    const out = {};
    for (const [label, lines] of Object.entries(source || {})) {
      const valid = validContinuousRuns(lines);
      if (valid.length) out[label] = valid;
    }
    return out;
  }

  // Correspondência geométrica (Overpass/OSM): cada sequência contínua precisa
  // ter pelo menos 2 km. Trechos separados não são somados para atingir o limite.
  if (baseMatchingRoadSegments) {
    matchingRoadSegments = function matchingRoadSegmentsMin2Km(lines, tripLines) {
      const result = baseMatchingRoadSegments(lines, tripLines) || { segments: [], traveledKm: 0 };
      const segments = validContinuousRuns(result.segments);
      const traveledKm = segments.reduce((sum, line) => sum + lineLengthKm(line), 0);
      return { ...result, segments, traveledKm };
    };
  }

  // Rotas recém-calculadas pelo OSRM também obedecem aos mesmos 2 km.
  if (baseExtractRoadSegments) {
    extractRoadSegmentsFromRoute = function extractRoadSegmentsFromRouteMin2Km(route, trip = null) {
      return filterSegmentMap(baseExtractRoadSegments(route, trip));
    };
  }

  if (baseExtractRoadLabels) {
    extractRoadLabelsFromRoute = function extractRoadLabelsFromRouteMin2Km(route, trip = null) {
      const labels = baseExtractRoadLabels(route, trip) || [];
      if (!baseExtractRoadSegments) return labels;
      const segments = filterSegmentMap(baseExtractRoadSegments(route, trip));
      const allowed = new Set(Object.keys(segments).map(normalizeKey));
      return labels.filter(item => allowed.has(normalizeKey(item?.label || item)));
    };
  }

  if (baseExtractHighways) {
    extractHighwaysFromRoute = function extractHighwaysFromRouteMin2Km(route, trip = null) {
      const roads = baseExtractHighways(route, trip) || [];
      if (!baseExtractRoadSegments) return roads;
      const segments = filterSegmentMap(baseExtractRoadSegments(route, trip));
      const allowed = new Set(Object.keys(segments).map(normalizeKey));
      return roads.filter(label => allowed.has(normalizeKey(label)));
    };
  }

  async function clearProgressCache() {
    try {
      const db = await highwayDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HIGHWAY_PROGRESS_STORE, "readwrite");
        tx.objectStore(HIGHWAY_PROGRESS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.warn("Não foi possível limpar o cache antigo de progresso de rodovias", error);
    }
  }

  // Corrige conquistas antigas quando o trecho correspondente já existe no IndexedDB.
  // Não faz consultas de rede na inicialização e não remove uma rodovia quando não há
  // geometria local suficiente para verificar com segurança.
  async function reconcileStoredRoads() {
    let changed = false;
    for (const trip of state.trips || []) {
      if (!trip?.conquests || !Array.isArray(trip.conquests.roads)) continue;
      const kept = [];
      for (const road of trip.conquests.roads) {
        let segments = trip.roadSegments?.[road] || [];
        if (!segments.length) {
          try { segments = await window.__mvGetTripRoadSegments?.(trip.id, road) || []; } catch {}
        }
        if (!segments.length) {
          kept.push(road);
          continue;
        }

        const valid = validContinuousRuns(segments);
        if (valid.length) {
          kept.push(road);
          try { await window.__mvPutTripRoadSegments?.(trip.id, road, valid); } catch {}
        } else {
          changed = true;
          if (trip.roadSegments) delete trip.roadSegments[road];
          if (Array.isArray(trip.roadLabels)) {
            trip.roadLabels = trip.roadLabels.filter(item => normalizeKey(item?.label || item) !== normalizeKey(road));
          }
        }
      }

      if (kept.length !== trip.conquests.roads.length) {
        trip.conquests.roads = kept;
        trip.updatedAt = new Date().toISOString();
      }
    }

    if (changed) {
      saveTrips();
      renderTrips();
    }
  }

  clearProgressCache();
  reconcileStoredRoads();

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: filtro de rodovia contínua mínima de ${MIN_CONTINUOUS_ROAD_KM} km ativo.`);
})();
