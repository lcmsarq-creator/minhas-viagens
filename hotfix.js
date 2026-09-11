(() => {
  const STORAGE_KEY = "minhasViagens.v0.6.7";
  const APP_VERSION = "0.7.1";

  // A fila de abertura da v0.7.0 já foi preenchida, mas seu início foi bloqueado
  // pelo hotfix-pre.js. Limpa essa fila para que abrir o app nunca reprocese todas
  // as rodovias antigas de uma vez.
  try {
    state.highwayQueue.length = 0;
    state.highwayQueueKeys.clear();
    state.highwayQueueRunning = false;
  } catch {}

  // Restaura requestIdleCallback para trabalhos futuros, mas sem disparar a fila antiga.
  if (window.__mvOriginalRequestIdleCallback) window.requestIdleCallback = window.__mvOriginalRequestIdleCallback;
  else {
    try { delete window.requestIdleCallback; } catch {}
  }

  // Depois da migração inicial, devolve Storage.setItem ao navegador. A partir daqui,
  // saveTrips já não serializa roadSegments para o localStorage.
  if (window.__mvNativeStorageSetItem) Storage.prototype.setItem = window.__mvNativeStorageSetItem;

  saveTrips = function saveTripsCompact() {
    try { window.__mvPersistTripRoadSegments?.(state.trips); } catch {}

    // O replacer corta roadSegments antes que JSON.stringify percorra milhares de pontos.
    const payload = JSON.stringify(state.trips, (key, value) => key === "roadSegments" ? undefined : value);
    const nativeSetItem = window.__mvNativeStorageSetItem || Storage.prototype.setItem;
    try {
      nativeSetItem.call(localStorage, STORAGE_KEY, payload);
      return true;
    } catch (firstError) {
      for (const key of LEGACY_KEYS) {
        try { localStorage.removeItem(key); } catch {}
      }
      try {
        nativeSetItem.call(localStorage, STORAGE_KEY, payload);
        return true;
      } catch (secondError) {
        console.error("Falha ao salvar viagens", secondError);
        alert("Ainda não há espaço suficiente para salvar os dados locais. Exporte um backup antes de continuar.");
        return false;
      }
    }
  };

  function edgeBearing(a, b) {
    const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function bearingDifference(a, b) {
    const diff = Math.abs(a - b) % 180;
    return Math.min(diff, 180 - diff);
  }

  // Substitui a comparação O(N x M) da v0.7.0 por um índice espacial simples.
  // Cada segmento da viagem só é comparado com segmentos próximos da rodovia.
  matchingRoadSegments = function matchingRoadSegmentsIndexed(lines, tripLines) {
    const toleranceKm = typeof ROAD_MATCH_TOLERANCE_KM === "number" ? ROAD_MATCH_TOLERANCE_KM : .08;
    const minKm = typeof ROAD_MATCH_MIN_KM === "number" ? ROAD_MATCH_MIN_KM : .5;
    const cell = .01;
    const toleranceDeg = Math.max(.0008, toleranceKm / 95);
    const grid = new Map();
    const tripEdges = [];

    const cellKey = (x, y) => `${x}:${y}`;
    const cellRange = (min, max) => [Math.floor(min / cell), Math.floor(max / cell)];

    for (const route of tripLines || []) {
      if (!Array.isArray(route)) continue;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        if (!a || !b) continue;
        const edgeIndex = tripEdges.length;
        const bearing = edgeBearing(a, b);
        tripEdges.push({ a, b, bearing });
        const [x0, x1] = cellRange(Math.min(a[1], b[1]) - toleranceDeg, Math.max(a[1], b[1]) + toleranceDeg);
        const [y0, y1] = cellRange(Math.min(a[0], b[0]) - toleranceDeg, Math.max(a[0], b[0]) + toleranceDeg);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const key = cellKey(x, y);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(edgeIndex);
        }
      }
    }

    const nearbyCandidates = (a, b) => {
      const [x0, x1] = cellRange(Math.min(a[1], b[1]) - toleranceDeg, Math.max(a[1], b[1]) + toleranceDeg);
      const [y0, y1] = cellRange(Math.min(a[0], b[0]) - toleranceDeg, Math.max(a[0], b[0]) + toleranceDeg);
      const out = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        for (const index of grid.get(cellKey(x, y)) || []) out.add(index);
      }
      return out;
    };

    const traveled = [];
    let traveledKm = 0;

    for (const line of lines || []) {
      if (!Array.isArray(line) || line.length < 2) continue;
      let run = [];
      let runKm = 0;
      const flush = () => {
        if (runKm >= minKm && run.length > 1) {
          traveled.push(run);
          traveledKm += runKm;
        }
        run = [];
        runKm = 0;
      };

      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const roadBearing = edgeBearing(a, b);
        let close = false;

        for (const index of nearbyCandidates(a, b)) {
          const edge = tripEdges[index];
          if (!edge || bearingDifference(roadBearing, edge.bearing) > 38) continue;
          if (
            pointSegmentDistanceKm(a, edge.a, edge.b) <= toleranceKm &&
            pointSegmentDistanceKm(b, edge.a, edge.b) <= toleranceKm &&
            pointSegmentDistanceKm(mid, edge.a, edge.b) <= toleranceKm
          ) {
            close = true;
            break;
          }
        }

        if (close) {
          if (!run.length) run.push(a);
          run.push(b);
          runKm += lineLengthKm([a, b]);
        } else flush();
      }
      flush();
    }

    return { segments: traveled, traveledKm };
  };

  // Pré-carregamento futuro: baixa e guarda somente a geometria. Não percorre todas
  // as viagens automaticamente. A análise de progresso acontece sob demanda e fica cacheada.
  processHighwayQueue = async function processHighwayQueueLight() {
    if (state.highwayQueueRunning) return;
    state.highwayQueueRunning = true;
    while (state.highwayQueue.length) {
      const item = state.highwayQueue.shift();
      const descriptor = overpassRoadDescriptor(item);
      const key = highwayCacheKey(descriptor);
      try {
        let entry = await cachedHighway(descriptor);
        if (!entry) entry = await fetchFullHighway(descriptor, null);
      } catch (error) {
        console.warn(`Pré-carregamento de ${item.label} adiado`, error);
      } finally {
        state.highwayQueueKeys.delete(key);
      }
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    state.highwayQueueRunning = false;
  };

  // Clique no emblema da rodovia dentro de uma viagem: primeiro tenta os segmentos
  // já migrados para IndexedDB. Só reconstrói geometricamente se ainda não houver cache.
  showTripRoadSegment = async function showTripRoadSegmentFromDb(trip, label, button) {
    const key = `${trip.id}|${normalizeKey(label)}`;
    if (state.tripRoadKey === key && state.tripRoadLayer) {
      const bounds = state.tripRoadLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(.15), { maxZoom: 15 });
      return;
    }

    closeFullHighway();
    closeTripRoadHighlight();

    let segments = trip.roadSegments?.[label] || [];
    if (!segments.length) {
      try { segments = await window.__mvGetTripRoadSegments?.(trip.id, label) || []; } catch {}
    }

    if (!segments.length) {
      const descriptor = overpassRoadDescriptor({ label, countryCode: roadCountryForAchievement(label, trip) });
      const entry = await cachedHighway(descriptor, true);
      if (entry) {
        segments = matchingRoadSegments(entry.lines, [tripLatLngs(trip)]).segments;
        if (segments.length) {
          trip.roadSegments[label] = segments;
          try { await window.__mvPutTripRoadSegments?.(trip.id, label, segments); } catch {}
        }
      }
    }

    if (!segments.length) {
      alert("O trecho desta rodovia ainda não pôde ser reconstruído para esta viagem.");
      return;
    }

    state.tripRoadLayer = L.featureGroup(segments.map(line => L.polyline(line, {
      pane: "fullHighwayMain", color: "#ef8d00", weight: 8, opacity: 1, interactive: false
    }))).addTo(map);
    state.tripRoadKey = key;
    setTripsSecondary(true);
    button?.classList.add("active");
    const bounds = state.tripRoadLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(.15), { maxZoom: 15 });
  };

  // Backup continua leve: roadSegments permanecem no IndexedDB e podem ser
  // reconstruídos a partir das rotas/rodovias quando necessário.
  els.exportBtn?.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const payload = {
      app: "Minhas Viagens",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      note: "Mídias e cache de segmentos de rodovia do IndexedDB não estão incluídos neste JSON.",
      trips: state.trips
    };
    const json = JSON.stringify(payload, (key, value) => key === "roadSegments" ? undefined : value, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `minhas-viagens-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, true);

  // Compacta imediatamente o registro atual, liberando a cota antiga do localStorage.
  saveTrips();

  console.info(`Minhas Viagens ${APP_VERSION}: armazenamento de trechos migrado para IndexedDB e pré-carregamento inicial pesado desativado.`);
})();
