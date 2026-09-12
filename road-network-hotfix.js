(() => {
  "use strict";

  const APP_VERSION = "0.10.16";
  const NETWORK_SCHEMA = "road-network-additive-v2";
  const RAW_MATCH_TOLERANCE_KM = 0.20;
  const ENDPOINT_TOLERANCE_KM = 5;
  const SAME_TRIP_COMPLETION_RATIO = 0.40;
  const AGGREGATE_COMPLETION_RATIO = 0.55;
  const NATURAL_COMPLETION_RATIO = 0.985;

  const baseCachedHighway = typeof cachedHighway === "function" ? cachedHighway : null;
  const baseCacheHighway = typeof cacheHighway === "function" ? cacheHighway : null;

  function geometrySignature(line) {
    if (!Array.isArray(line) || line.length < 2) return "";
    const serialize = points => points.map(point => `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`).join(";");
    const forward = serialize(line);
    const reverse = serialize([...line].reverse());
    return forward < reverse ? forward : reverse;
  }

  function dedupeLines(lines) {
    const out = [];
    const seen = new Set();
    for (const line of lines || []) {
      if (!Array.isArray(line) || line.length < 2) continue;
      const key = geometrySignature(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  }

  if (baseCachedHighway) {
    cachedHighway = async function cachedHighwayNetworkAware(descriptor, allowExpired = false) {
      const entry = await baseCachedHighway(descriptor, allowExpired);
      if (!entry) return null;
      return entry.networkFetchSchema === NETWORK_SCHEMA ? entry : null;
    };
  }

  if (baseCacheHighway) {
    cacheHighway = async function cacheHighwayNetworkAware(descriptor, lines, partial = false) {
      const entry = await baseCacheHighway(descriptor, dedupeLines(lines), partial);
      if (!entry) return entry;
      entry.networkFetchSchema = NETWORK_SCHEMA;
      try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry); } catch {}
      return entry;
    };
  }

  fetchFullHighway = async function fetchFullHighwayAdditive(descriptor, signal, onStatus = () => {}) {
    const collected = [];
    const succeeded = new Set();
    const kinds = [
      ["primary", "Buscando relação principal…"],
      ["relations", "Buscando relações parciais…"],
      ["ways", "Buscando todos os trechos por referência…"]
    ];

    for (const [kind, status] of kinds) {
      onStatus(status);
      try {
        const data = await requestOverpass(overpassRoadQuery(descriptor, kind), signal);
        const lines = linesFromOverpass(data);
        if (lines.length) collected.push(...lines);
        succeeded.add(kind);
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn(`Consulta ${kind} incompleta para ${descriptor?.ref || descriptor?.number || "rodovia"}`, error);
      }
    }

    const lines = dedupeLines(collected);
    if (!lines.length) throw new Error("Não foi possível localizar a rodovia completa no OpenStreetMap");
    onStatus("Consolidando todos os trechos encontrados…");
    // A consulta de ways é a rede de segurança mais ampla. Se ela falhou, mantemos
    // a geometria encontrada, mas sinalizamos que ainda pode haver trechos ausentes.
    return cacheHighway(descriptor, lines, !succeeded.has("ways"));
  };

  function bearing(a, b) {
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function bearingDiff(a, b) {
    const diff = Math.abs(a - b) % 180;
    return Math.min(diff, 180 - diff);
  }

  function buildTripEdgeIndex(routes) {
    const cellSize = 0.012;
    const toleranceDeg = Math.max(0.0022, RAW_MATCH_TOLERANCE_KM / 90);
    const edges = [];
    const grid = new Map();
    const key = (x, y) => `${x}:${y}`;
    const range = (min, max) => [Math.floor(min / cellSize), Math.floor(max / cellSize)];

    for (const route of routes || []) {
      if (!Array.isArray(route)) continue;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        if (!a || !b) continue;
        const index = edges.length;
        edges.push({ a, b, bearing: bearing(a, b) });
        const [x0, x1] = range(Math.min(a[1], b[1]) - toleranceDeg, Math.max(a[1], b[1]) + toleranceDeg);
        const [y0, y1] = range(Math.min(a[0], b[0]) - toleranceDeg, Math.max(a[0], b[0]) + toleranceDeg);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const cellKey = key(x, y);
          if (!grid.has(cellKey)) grid.set(cellKey, []);
          grid.get(cellKey).push(index);
        }
      }
    }

    const candidates = (a, b) => {
      const [x0, x1] = range(Math.min(a[1], b[1]) - toleranceDeg, Math.max(a[1], b[1]) + toleranceDeg);
      const [y0, y1] = range(Math.min(a[0], b[0]) - toleranceDeg, Math.max(a[0], b[0]) + toleranceDeg);
      const found = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        for (const index of grid.get(key(x, y)) || []) found.add(index);
      }
      return found;
    };

    return { edges, candidates };
  }

  function rawCoveredKm(lines, routes) {
    const index = buildTripEdgeIndex(routes);
    let total = 0;
    for (const line of lines || []) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const roadBearing = bearing(a, b);
        let close = false;
        for (const edgeIndex of index.candidates(a, b)) {
          const edge = index.edges[edgeIndex];
          if (!edge || bearingDiff(roadBearing, edge.bearing) > 55) continue;
          if (pointSegmentDistanceKm(mid, edge.a, edge.b) <= RAW_MATCH_TOLERANCE_KM) {
            close = true;
            break;
          }
        }
        if (close) total += lineLengthKm([a, b]);
      }
    }
    return total;
  }

  function extremeEndpoints(lines) {
    const endpoints = [];
    for (const line of lines || []) {
      if (!Array.isArray(line) || line.length < 2) continue;
      endpoints.push(line[0], line[line.length - 1]);
    }
    if (endpoints.length < 2) return null;
    const farthestFrom = point => {
      let best = point, bestDistance = -1;
      for (const candidate of endpoints) {
        const distance = haversineKm({ lat: point[0], lng: point[1] }, { lat: candidate[0], lng: candidate[1] });
        if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      }
      return best;
    };
    const a = farthestFrom(endpoints[0]);
    const b = farthestFrom(a);
    return [a, b];
  }

  function routeNearPoint(route, point, toleranceKm = ENDPOINT_TOLERANCE_KM) {
    if (!Array.isArray(route) || route.length < 2) return false;
    for (let i = 1; i < route.length; i++) {
      if (pointSegmentDistanceKm(point, route[i - 1], route[i]) <= toleranceKm) return true;
    }
    return false;
  }

  function completionEvidence(entry, tripLines, rawKm) {
    const endpoints = extremeEndpoints(entry?.lines || []);
    const totalKm = Number(entry?.totalKm) || 0;
    if (!endpoints || !totalKm) return { complete: false, ratio: 0, sameTrip: false, endpointsReached: false };
    const ratio = Math.min(1, rawKm / totalKm);
    const [a, b] = endpoints;
    const sameTrip = tripLines.some(route => routeNearPoint(route, a) && routeNearPoint(route, b));
    const aReached = tripLines.some(route => routeNearPoint(route, a));
    const bReached = tripLines.some(route => routeNearPoint(route, b));
    const endpointsReached = aReached && bReached;
    const complete = ratio >= NATURAL_COMPLETION_RATIO ||
      (sameTrip && ratio >= SAME_TRIP_COMPLETION_RATIO) ||
      (endpointsReached && ratio >= AGGREGATE_COMPLETION_RATIO);
    return { complete, ratio, sameTrip, endpointsReached, endpoints };
  }

  highwayProgress = async function highwayProgressContinuity(descriptor, entry) {
    const key = highwayCacheKey(descriptor);
    const signature = `${NETWORK_SCHEMA}|${progressSignature(entry)}`;
    const cached = await highwayDbGet(HIGHWAY_PROGRESS_STORE, key).catch(() => null);
    if (cached?.version === HIGHWAY_CACHE_VERSION && cached.signature === signature) return cached;

    const tripLines = state.trips
      .filter(trip => ["carro", "moto"].includes(trip.mode))
      .map(tripLatLngs)
      .filter(line => Array.isArray(line) && line.length > 1);
    const matched = matchingRoadSegments(entry.lines, tripLines);
    const rawKm = rawCoveredKm(entry.lines, tripLines);
    const evidence = completionEvidence(entry, tripLines, rawKm);

    const totalKm = Number(entry.totalKm) || entry.lines.reduce((sum, line) => sum + lineLengthKm(line), 0);
    const traveledKm = evidence.complete ? totalKm : Math.min(totalKm, matched.traveledKm);
    const percent = evidence.complete ? 100 : (totalKm ? Math.min(100, traveledKm / totalKm * 100) : 0);
    // Quando há evidência de percurso de ponta a ponta, todas as partes conhecidas da
    // rodovia são mostradas como concluídas. Interrupções de ref dentro de cidades não
    // reduzem artificialmente o status global.
    const segments = evidence.complete ? entry.lines : matched.segments;
    const result = {
      key,
      version: HIGHWAY_CACHE_VERSION,
      signature,
      totalKm,
      traveledKm,
      percent,
      segments,
      endToEndComplete: evidence.complete,
      rawCoveragePercent: Math.round(evidence.ratio * 1000) / 10,
      updatedAt: Date.now()
    };
    await highwayDbPut(HIGHWAY_PROGRESS_STORE, result).catch(() => {});
    return result;
  };

  // Remove apenas o progresso antigo; geometrias antigas são invalidadas sob demanda
  // pelo marcador NETWORK_SCHEMA e serão substituídas pela busca aditiva.
  (async () => {
    try {
      const db = await openHighwayDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HIGHWAY_PROGRESS_STORE, "readwrite");
        tx.objectStore(HIGHWAY_PROGRESS_STORE).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    } catch {}
  })();

  window.MinhasViagensRoadNetwork = {
    schema: NETWORK_SCHEMA,
    rawCoveredKm,
    completionEvidence
  };

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: geometria aditiva de rodovias e continuidade ponta-a-ponta habilitadas.`);
})();
