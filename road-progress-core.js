((root, factory) => {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MinhasViagensRoadProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const DEFAULT_TOLERANCE_KM = 0.20;
  const DEFAULT_BEARING_TOLERANCE_DEG = 55;
  const DEFAULT_CELL_SIZE_DEG = 0.012;

  function isPoint(point) {
    return Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function haversineKm(a, b) {
    const toRad = value => value * Math.PI / 180;
    const lat1 = toRad(Number(a[0]));
    const lat2 = toRad(Number(b[0]));
    const dLat = lat2 - lat1;
    const dLon = toRad(Number(b[1]) - Number(a[1]));
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function pointSegmentDistanceKm(point, a, b) {
    const latScale = 111.32;
    const lngScale = Math.max(0.01, Math.cos(Number(point[0]) * Math.PI / 180)) * 111.32;
    const px = Number(point[1]) * lngScale;
    const py = Number(point[0]) * latScale;
    const ax = Number(a[1]) * lngScale;
    const ay = Number(a[0]) * latScale;
    const bx = Number(b[1]) * lngScale;
    const by = Number(b[0]) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function bearing(a, b) {
    const lat1 = Number(a[0]) * Math.PI / 180;
    const lat2 = Number(b[0]) * Math.PI / 180;
    const dLon = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function bearingDifference(a, b) {
    const difference = Math.abs(a - b) % 180;
    return Math.min(difference, 180 - difference);
  }

  function coordinatePadding(a, b, toleranceKm) {
    const latitude = Math.max(Math.abs(Number(a[0])), Math.abs(Number(b[0])));
    const cosine = Math.max(0.05, Math.cos(latitude * Math.PI / 180));
    return {
      latitude: toleranceKm / 110.574,
      longitude: toleranceKm / (111.32 * cosine)
    };
  }

  function buildTripEdgeIndex(routes, toleranceKm, cellSize) {
    const edges = [];
    const grid = new Map();
    const cellKey = (x, y) => `${x}:${y}`;
    const cellRange = (min, max) => [Math.floor(min / cellSize), Math.floor(max / cellSize)];

    function cellsForEdge(a, b) {
      const padding = coordinatePadding(a, b, toleranceKm);
      const [x0, x1] = cellRange(
        Math.min(Number(a[1]), Number(b[1])) - padding.longitude,
        Math.max(Number(a[1]), Number(b[1])) + padding.longitude
      );
      const [y0, y1] = cellRange(
        Math.min(Number(a[0]), Number(b[0])) - padding.latitude,
        Math.max(Number(a[0]), Number(b[0])) + padding.latitude
      );
      return { x0, x1, y0, y1 };
    }

    for (const route of routes || []) {
      if (!Array.isArray(route)) continue;
      for (let index = 1; index < route.length; index++) {
        const a = route[index - 1];
        const b = route[index];
        if (!isPoint(a) || !isPoint(b) || haversineKm(a, b) <= 0.000001) continue;
        const edgeIndex = edges.length;
        edges.push({ a, b, bearing: bearing(a, b) });
        const { x0, x1, y0, y1 } = cellsForEdge(a, b);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(edgeIndex);
          }
        }
      }
    }

    function candidates(a, b) {
      const { x0, x1, y0, y1 } = cellsForEdge(a, b);
      const found = new Set();
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (const edgeIndex of grid.get(cellKey(x, y)) || []) found.add(edgeIndex);
        }
      }
      return found;
    }

    return { edges, candidates };
  }

  function samePoint(a, b) {
    return a && b && Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);
  }

  function corridorCoverage(lines, routes, options = {}) {
    const toleranceKm = Number(options.toleranceKm) > 0
      ? Number(options.toleranceKm)
      : DEFAULT_TOLERANCE_KM;
    const bearingToleranceDeg = Number.isFinite(Number(options.bearingToleranceDeg))
      ? Number(options.bearingToleranceDeg)
      : DEFAULT_BEARING_TOLERANCE_DEG;
    const cellSize = Number(options.cellSizeDeg) > 0
      ? Number(options.cellSizeDeg)
      : DEFAULT_CELL_SIZE_DEG;
    const edgeLengthKm = typeof options.edgeLengthKm === "function"
      ? options.edgeLengthKm
      : haversineKm;
    const tripIndex = buildTripEdgeIndex(routes, toleranceKm, cellSize);
    const segments = [];
    let traveledKm = 0;
    let totalKm = 0;
    let coveredEdgeCount = 0;
    let totalEdgeCount = 0;

    for (const line of lines || []) {
      if (!Array.isArray(line) || line.length < 2) continue;
      let run = [];
      const flush = () => {
        if (run.length > 1) segments.push(run);
        run = [];
      };

      for (let index = 1; index < line.length; index++) {
        const a = line[index - 1];
        const b = line[index];
        if (!isPoint(a) || !isPoint(b)) {
          flush();
          continue;
        }

        const lengthKm = Number(edgeLengthKm(a, b)) || 0;
        if (lengthKm <= 0) continue;
        totalKm += lengthKm;
        totalEdgeCount += 1;

        const midpoint = [
          (Number(a[0]) + Number(b[0])) / 2,
          (Number(a[1]) + Number(b[1])) / 2
        ];
        const roadBearing = bearing(a, b);
        let covered = false;
        for (const edgeIndex of tripIndex.candidates(a, b)) {
          const tripEdge = tripIndex.edges[edgeIndex];
          if (!tripEdge || bearingDifference(roadBearing, tripEdge.bearing) > bearingToleranceDeg) continue;
          if (pointSegmentDistanceKm(midpoint, tripEdge.a, tripEdge.b) <= toleranceKm) {
            covered = true;
            break;
          }
        }

        if (!covered) {
          flush();
          continue;
        }

        if (!run.length) run.push(a);
        else if (!samePoint(run[run.length - 1], a)) {
          flush();
          run.push(a);
        }
        run.push(b);
        traveledKm += lengthKm;
        coveredEdgeCount += 1;
      }
      flush();
    }

    return { segments, traveledKm, totalKm, coveredEdgeCount, totalEdgeCount };
  }

  return Object.freeze({
    DEFAULT_TOLERANCE_KM,
    DEFAULT_BEARING_TOLERANCE_DEG,
    corridorCoverage,
    haversineKm,
    pointSegmentDistanceKm,
    bearingDifference
  });
});
