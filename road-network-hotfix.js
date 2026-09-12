(() => {
  "use strict";

  const APP_VERSION = "0.11.8";
  const NETWORK_SCHEMA = "road-network-additive-v3";
  const PROGRESS_SCHEMA = "road-progress-corridor-v2";
  const RAW_MATCH_TOLERANCE_KM = 0.20;
  const NATURAL_COMPLETION_RATIO = 0.985;
  const progressEngine = window.MinhasViagensRoadProgress;

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
      entry.needsNetworkRefresh = entry.networkFetchSchema !== NETWORK_SCHEMA;
      return entry;
    };
  }

  if (baseCacheHighway) {
    cacheHighway = async function cacheHighwayNetworkAware(descriptor, lines, partial = false) {
      const entry = await baseCacheHighway(descriptor, dedupeLines(lines), partial);
      if (!entry) return entry;
      entry.networkFetchSchema = NETWORK_SCHEMA;
      entry.needsNetworkRefresh = false;
      try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry); } catch {}
      return entry;
    };
  }

  fetchFullHighway = async function fetchFullHighwayAdditive(descriptor, signal, onStatus = () => {}) {
    const collected = [];
    const succeeded = new Set();
    const kinds = [
      ["relations", "Buscando relações da rodovia…"],
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
    return cacheHighway(descriptor, lines, !succeeded.has("ways") || !succeeded.has("relations"));
  };

  function rawCoverage(lines, routes) {
    if (!progressEngine?.corridorCoverage) {
      throw new Error("Motor de progresso de rodovias não carregado");
    }
    return progressEngine.corridorCoverage(lines, routes, {
      toleranceKm: RAW_MATCH_TOLERANCE_KM,
      bearingToleranceDeg: 55,
      edgeLengthKm: (a, b) => lineLengthKm([a, b])
    });
  }

  function rawCoveredKm(lines, routes) {
    return rawCoverage(lines, routes).traveledKm;
  }

  function completionEvidence(entry, _tripLines, rawKm) {
    const totalKm = Number(entry?.totalKm) || 0;
    if (!totalKm) return { complete: false, ratio: 0 };
    const ratio = Math.min(1, rawKm / totalKm);
    return { complete: ratio >= NATURAL_COMPLETION_RATIO, ratio };
  }

  highwayProgress = async function highwayProgressContinuity(descriptor, entry) {
    const key = highwayCacheKey(descriptor);
    const signature = `${PROGRESS_SCHEMA}|${NETWORK_SCHEMA}|${progressSignature(entry)}`;
    const cached = await highwayDbGet(HIGHWAY_PROGRESS_STORE, key).catch(() => null);
    if (cached?.version === HIGHWAY_CACHE_VERSION && cached.signature === signature) return cached;

    const tripLines = state.trips
      .filter(trip => ["carro", "moto"].includes(trip.mode))
      .map(tripLatLngs)
      .filter(line => Array.isArray(line) && line.length > 1);
    const coverage = rawCoverage(entry.lines, tripLines);
    const rawKm = coverage.traveledKm;
    const evidence = completionEvidence(entry, tripLines, rawKm);

    const totalKm = Number(entry.totalKm) || entry.lines.reduce((sum, line) => sum + lineLengthKm(line), 0);
    const traveledKm = evidence.complete ? totalKm : Math.min(totalKm, rawKm);
    const percent = evidence.complete ? 100 : (totalKm ? Math.min(100, traveledKm / totalKm * 100) : 0);
    const segments = evidence.complete ? entry.lines : coverage.segments;
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

  window.MinhasViagensRoadNetwork = {
    schema: NETWORK_SCHEMA,
    progressSchema: PROGRESS_SCHEMA,
    rawCoverage,
    rawCoveredKm,
    completionEvidence
  };

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: progresso por corredor habilitado sem descartar fragmentos curtos do mapa.`);
})();
