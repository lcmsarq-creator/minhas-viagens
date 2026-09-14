((root, factory) => {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MinhasViagensRoadMarkerLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const MIN_BADGE_ROAD_KM = 20;
  const MAX_MINOR_INTERRUPTION_KM = 20;

  function isPoint(point) {
    return Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function normalizeLine(line) {
    return (Array.isArray(line) ? line : [])
      .filter(isPoint)
      .map(point => [Number(point[0]), Number(point[1])]);
  }

  function haversineKm(a, b) {
    const toRad = value => value * Math.PI / 180;
    const lat1 = toRad(Number(a[0]));
    const lat2 = toRad(Number(b[0]));
    const dLat = lat2 - lat1;
    const dLng = toRad(Number(b[1]) - Number(a[1]));
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function lineLengthKm(line) {
    let total = 0;
    for (let index = 1; index < line.length; index += 1) {
      total += haversineKm(line[index - 1], line[index]);
    }
    return total;
  }

  function midpointAlongPieces(pieces) {
    const usable = (pieces || []).map(normalizeLine).filter(line => line.length > 1);
    const totalKm = usable.reduce((sum, line) => sum + lineLengthKm(line), 0);
    if (!(totalKm > 0)) return null;

    let remainingKm = totalKm / 2;
    for (const line of usable) {
      for (let index = 1; index < line.length; index += 1) {
        const start = line[index - 1];
        const end = line[index];
        const edgeKm = haversineKm(start, end);
        if (!(edgeKm > 0)) continue;
        if (remainingKm <= edgeKm) {
          const ratio = remainingKm / edgeKm;
          return [
            start[0] + (end[0] - start[0]) * ratio,
            start[1] + (end[1] - start[1]) * ratio
          ];
        }
        remainingKm -= edgeKm;
      }
    }
    return usable.at(-1)?.at(-1) || null;
  }

  function optionsWithDefaults(options = {}) {
    return {
      minRoadKm: Number.isFinite(Number(options.minRoadKm)) ? Number(options.minRoadKm) : MIN_BADGE_ROAD_KM,
      maxInterruptionKm: Number.isFinite(Number(options.maxInterruptionKm))
        ? Number(options.maxInterruptionKm)
        : MAX_MINOR_INTERRUPTION_KM,
      normalizeLabel: typeof options.normalizeLabel === "function"
        ? options.normalizeLabel
        : value => String(value || "").trim().toLocaleLowerCase("pt-BR")
    };
  }

  function markerForGroup(group, settings) {
    if (!group || !(group.roadKm > settings.minRoadKm)) return null;
    const midpoint = midpointAlongPieces(group.pieces);
    if (!midpoint) return null;
    return {
      label: group.label,
      lat: midpoint[0],
      lng: midpoint[1],
      distanceKm: group.roadKm,
      routeOrder: group.routeOrder
    };
  }

  function markersFromTimeline(chunks, options = {}) {
    const settings = optionsWithDefaults(options);
    const timeline = (Array.isArray(chunks) ? chunks : []).map((chunk, routeOrder) => {
      const line = normalizeLine(chunk?.line);
      const label = String(chunk?.label || "").trim();
      return {
        label,
        key: label ? settings.normalizeLabel(label) : "",
        line,
        km: line.length > 1 ? lineLengthKm(line) : 0,
        routeOrder
      };
    }).filter(chunk => chunk.km > 0);

    const labels = new Map();
    for (const chunk of timeline) {
      if (chunk.key && !labels.has(chunk.key)) labels.set(chunk.key, chunk.label);
    }

    const markers = [];
    for (const [key, label] of labels) {
      let group = null;
      let interruptionKm = 0;

      const finish = () => {
        const marker = markerForGroup(group, settings);
        if (marker) markers.push(marker);
        group = null;
        interruptionKm = 0;
      };

      for (const chunk of timeline) {
        if (chunk.key === key) {
          if (group && interruptionKm > settings.maxInterruptionKm) finish();
          if (!group) group = { label, roadKm: 0, pieces: [], routeOrder: chunk.routeOrder };
          group.roadKm += chunk.km;
          group.pieces.push(chunk.line);
          interruptionKm = 0;
        } else if (group) {
          interruptionKm += chunk.km;
        }
      }
      finish();
    }

    return markers.sort((a, b) => a.routeOrder - b.routeOrder).map(({ routeOrder, ...marker }) => marker);
  }

  function markersFromSegmentMap(segmentMap, options = {}) {
    const settings = optionsWithDefaults(options);
    const markers = [];

    for (const [label, sourceLines] of Object.entries(segmentMap || {})) {
      const lines = (Array.isArray(sourceLines) ? sourceLines : [])
        .map(normalizeLine)
        .filter(line => line.length > 1 && lineLengthKm(line) > 0);
      let group = null;

      const finish = () => {
        const marker = markerForGroup(group, settings);
        if (marker) markers.push(marker);
        group = null;
      };

      for (const sourceLine of lines) {
        let line = sourceLine;
        if (group) {
          const previousEnd = group.pieces.at(-1).at(-1);
          const gapToStart = haversineKm(previousEnd, line[0]);
          const gapToEnd = haversineKm(previousEnd, line.at(-1));
          if (gapToEnd < gapToStart) line = [...line].reverse();
          const interruptionKm = Math.min(gapToStart, gapToEnd);
          if (interruptionKm > settings.maxInterruptionKm) finish();
        }
        if (!group) group = { label, roadKm: 0, pieces: [], routeOrder: markers.length };
        group.roadKm += lineLengthKm(line);
        group.pieces.push(line);
      }
      finish();
    }

    return markers.map(({ routeOrder, ...marker }) => marker);
  }

  return Object.freeze({
    MIN_BADGE_ROAD_KM,
    MAX_MINOR_INTERRUPTION_KM,
    haversineKm,
    lineLengthKm,
    midpointAlongPieces,
    markersFromTimeline,
    markersFromSegmentMap
  });
});
