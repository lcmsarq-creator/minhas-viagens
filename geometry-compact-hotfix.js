(() => {
  "use strict";

  const APP_VERSION = "0.10.13";
  const TRIP_TOLERANCE_M = 15;
  const HIGHWAY_TOLERANCE_M = 25;
  const POLYLINE_PRECISION = 5;
  const COMPACT_TAG = "rdp-polyline5-v1";

  const stats = window.MinhasViagensGeometryStats = {
    version: APP_VERSION,
    tripToleranceM: TRIP_TOLERANCE_M,
    highwayToleranceM: HIGHWAY_TOLERANCE_M,
    tripRoutesCompacted: 0,
    tripPointsBefore: 0,
    tripPointsAfter: 0,
    highwayReadsCompacted: 0,
    highwayPointsBefore: 0,
    highwayPointsAfter: 0
  };

  function validPoint(point) {
    return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function pointSegmentDistanceSqM(point, a, b) {
    const refLat = ((Number(point[0]) + Number(a[0]) + Number(b[0])) / 3) * Math.PI / 180;
    const xScale = 111320 * Math.max(0.15, Math.cos(refLat));
    const yScale = 110540;
    const px = Number(point[1]) * xScale;
    const py = Number(point[0]) * yScale;
    const ax = Number(a[1]) * xScale;
    const ay = Number(a[0]) * yScale;
    const bx = Number(b[1]) * xScale;
    const by = Number(b[0]) * yScale;
    const dx = bx - ax;
    const dy = by - ay;
    if (!dx && !dy) {
      const ex = px - ax, ey = py - ay;
      return ex * ex + ey * ey;
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const ex = px - qx, ey = py - qy;
    return ex * ex + ey * ey;
  }

  function simplifyIndices(points, toleranceM) {
    if (!Array.isArray(points) || points.length <= 2 || toleranceM <= 0) {
      return Array.isArray(points) ? points.map((_, index) => index) : [];
    }
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    const toleranceSq = toleranceM * toleranceM;

    while (stack.length) {
      const [start, end] = stack.pop();
      if (end <= start + 1) continue;
      let maxSq = toleranceSq;
      let maxIndex = -1;
      const a = points[start], b = points[end];
      for (let index = start + 1; index < end; index++) {
        const sq = pointSegmentDistanceSqM(points[index], a, b);
        if (sq > maxSq) {
          maxSq = sq;
          maxIndex = index;
        }
      }
      if (maxIndex > start && maxIndex < end) {
        keep[maxIndex] = 1;
        stack.push([start, maxIndex], [maxIndex, end]);
      }
    }

    const indexes = [];
    for (let index = 0; index < keep.length; index++) if (keep[index]) indexes.push(index);
    return indexes;
  }

  function simplifyLine(points, toleranceM) {
    const clean = (Array.isArray(points) ? points : [])
      .filter(validPoint)
      .map(point => [Number(point[0]), Number(point[1])]);
    if (clean.length <= 2) return clean;
    return simplifyIndices(clean, toleranceM).map(index => clean[index]);
  }

  function compactLines(lines, toleranceM) {
    return (Array.isArray(lines) ? lines : [])
      .map(line => simplifyLine(line, toleranceM))
      .filter(line => line.length > 1);
  }

  function encodeSigned(value) {
    let current = value < 0 ? ~(value << 1) : (value << 1);
    let out = "";
    while (current >= 0x20) {
      out += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
      current >>= 5;
    }
    return out + String.fromCharCode(current + 63);
  }

  function encodePolyline(points, precision = POLYLINE_PRECISION) {
    const factor = 10 ** precision;
    let lastLat = 0, lastLng = 0, out = "";
    for (const point of points || []) {
      const lat = Math.round(Number(point[0]) * factor);
      const lng = Math.round(Number(point[1]) * factor);
      out += encodeSigned(lat - lastLat);
      out += encodeSigned(lng - lastLng);
      lastLat = lat;
      lastLng = lng;
    }
    return out;
  }

  function decodePolyline(encoded, precision = POLYLINE_PRECISION) {
    if (typeof encoded !== "string" || !encoded.length) return [];
    const factor = 10 ** precision;
    const points = [];
    let index = 0, lat = 0, lng = 0;

    const nextValue = () => {
      let result = 0, shift = 0, byte;
      do {
        if (index >= encoded.length) throw new Error("Polyline compactada inválida");
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return (result & 1) ? ~(result >> 1) : (result >> 1);
    };

    try {
      while (index < encoded.length) {
        lat += nextValue();
        lng += nextValue();
        points.push([lat / factor, lng / factor]);
      }
    } catch (error) {
      console.warn("Não foi possível decodificar uma geometria compactada", error);
      return [];
    }
    return points;
  }

  function compactRouteGeometry(geometry) {
    if (!geometry || typeof geometry !== "object") return { geometry, changed: false, before: 0, after: 0 };
    if (typeof geometry.encodedPolyline === "string" && geometry.compactEncoding === COMPACT_TAG) {
      const count = Number(geometry.pointCount) || decodePolyline(geometry.encodedPolyline, Number(geometry.precision) || POLYLINE_PRECISION).length;
      return { geometry, changed: false, before: count, after: count };
    }
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      return { geometry, changed: false, before: 0, after: 0 };
    }

    const latLngs = geometry.coordinates
      .map(point => Array.isArray(point) ? [Number(point[1]), Number(point[0])] : null)
      .filter(validPoint);
    if (latLngs.length < 2) return { geometry, changed: false, before: latLngs.length, after: latLngs.length };
    const simplified = simplifyLine(latLngs, TRIP_TOLERANCE_M);
    const next = {
      type: geometry.type || "LineString",
      encodedPolyline: encodePolyline(simplified, POLYLINE_PRECISION),
      precision: POLYLINE_PRECISION,
      compactEncoding: COMPACT_TAG,
      compactToleranceM: TRIP_TOLERANCE_M,
      originalPointCount: Number(geometry.originalPointCount) || latLngs.length,
      pointCount: simplified.length
    };
    return { geometry: next, changed: true, before: latLngs.length, after: simplified.length };
  }

  function compactManualPoints(trip) {
    if (trip?.routeGeometry || !Array.isArray(trip?.points) || trip.points.length <= 2) return false;
    const latLngs = trip.points.map(point => [Number(point?.lat), Number(point?.lng)]);
    if (!latLngs.every(validPoint)) return false;
    const indexes = simplifyIndices(latLngs, TRIP_TOLERANCE_M);
    if (indexes.length >= trip.points.length) return false;
    stats.tripPointsBefore += trip.points.length;
    trip.points = indexes.map(index => trip.points[index]);
    stats.tripPointsAfter += trip.points.length;
    stats.tripRoutesCompacted += 1;
    return true;
  }

  function compactTrip(trip) {
    if (!trip || typeof trip !== "object") return false;
    let changed = false;
    if (trip.routeGeometry) {
      const result = compactRouteGeometry(trip.routeGeometry);
      if (result.changed) {
        stats.tripPointsBefore += result.before;
        stats.tripPointsAfter += result.after;
        stats.tripRoutesCompacted += 1;
        trip.routeGeometry = result.geometry;
        changed = true;
      }
    } else if (compactManualPoints(trip)) changed = true;

    if (trip.roadSegments && typeof trip.roadSegments === "object") {
      for (const [road, lines] of Object.entries(trip.roadSegments)) {
        const compacted = compactLines(lines, TRIP_TOLERANCE_M);
        if (compacted.length) trip.roadSegments[road] = compacted;
      }
    }
    return changed;
  }

  const baseTripLatLngs = typeof tripLatLngs === "function" ? tripLatLngs : null;
  if (baseTripLatLngs) {
    tripLatLngs = function tripLatLngsCompactAware(trip) {
      const geometry = trip?.routeGeometry;
      if (geometry?.compactEncoding === COMPACT_TAG && typeof geometry.encodedPolyline === "string") {
        const decoded = decodePolyline(geometry.encodedPolyline, Number(geometry.precision) || POLYLINE_PRECISION);
        if (decoded.length) return decoded;
      }
      return baseTripLatLngs(trip);
    };
  }

  const baseSaveTrips = typeof saveTrips === "function" ? saveTrips : null;
  if (baseSaveTrips) {
    saveTrips = function saveTripsGeometryCompact() {
      for (const trip of state.trips || []) compactTrip(trip);
      return baseSaveTrips();
    };
  }

  const basePutTripRoadSegments = window.__mvPutTripRoadSegments;
  if (typeof basePutTripRoadSegments === "function") {
    window.__mvPutTripRoadSegments = function putCompactTripRoadSegments(tripId, road, lines) {
      return basePutTripRoadSegments(tripId, road, compactLines(lines, TRIP_TOLERANCE_M));
    };
  }

  const baseGetTripRoadSegments = window.__mvGetTripRoadSegments;
  if (typeof baseGetTripRoadSegments === "function") {
    window.__mvGetTripRoadSegments = async function getCompactTripRoadSegments(tripId, road) {
      const lines = await baseGetTripRoadSegments(tripId, road);
      const compacted = compactLines(lines, TRIP_TOLERANCE_M);
      if (compacted.length && JSON.stringify(compacted).length < JSON.stringify(lines || []).length) {
        try { await window.__mvPutTripRoadSegments?.(tripId, road, compacted); } catch {}
      }
      return compacted;
    };
  }

  function pointCount(lines) {
    return (lines || []).reduce((sum, line) => sum + (Array.isArray(line) ? line.length : 0), 0);
  }

  function storageHighwayEntry(value) {
    if (!value || !Array.isArray(value.lines)) return value;
    const before = pointCount(value.lines);
    const lines = compactLines(value.lines, HIGHWAY_TOLERANCE_M);
    const after = pointCount(lines);
    const meta = typeof geometryMetadata === "function" ? geometryMetadata(lines) : {};
    const stored = { ...value, ...meta };
    delete stored.lines;
    stored.geometryEncoding = COMPACT_TAG;
    stored.geometryPrecision = POLYLINE_PRECISION;
    stored.compactToleranceM = HIGHWAY_TOLERANCE_M;
    stored.originalPointCount = Number(value.originalPointCount) || before;
    stored.pointCount = after;
    stored.encodedLines = lines.map(line => encodePolyline(line, POLYLINE_PRECISION));
    return stored;
  }

  function hydrateHighwayEntry(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value.lines)) return value;
    if (value.geometryEncoding !== COMPACT_TAG || !Array.isArray(value.encodedLines)) return value;
    const lines = value.encodedLines.map(line => decodePolyline(line, Number(value.geometryPrecision) || POLYLINE_PRECISION)).filter(line => line.length > 1);
    return { ...value, lines };
  }

  const baseHighwayDbPut = typeof highwayDbPut === "function" ? highwayDbPut : null;
  const baseHighwayDbGet = typeof highwayDbGet === "function" ? highwayDbGet : null;

  if (baseHighwayDbPut) {
    highwayDbPut = async function highwayDbPutCompact(store, value) {
      if (store === HIGHWAY_GEOMETRY_STORE && Array.isArray(value?.lines)) {
        return baseHighwayDbPut(store, storageHighwayEntry(value));
      }
      return baseHighwayDbPut(store, value);
    };
  }

  if (baseHighwayDbGet) {
    highwayDbGet = async function highwayDbGetCompact(store, key) {
      const stored = await baseHighwayDbGet(store, key);
      if (store !== HIGHWAY_GEOMETRY_STORE || !stored) return stored;
      if (Array.isArray(stored.lines)) {
        const before = pointCount(stored.lines);
        const compacted = storageHighwayEntry(stored);
        const after = Number(compacted.pointCount) || before;
        stats.highwayReadsCompacted += 1;
        stats.highwayPointsBefore += before;
        stats.highwayPointsAfter += after;
        baseHighwayDbPut(store, compacted).catch(() => {});
        return hydrateHighwayEntry(compacted);
      }
      return hydrateHighwayEntry(stored);
    };
  }

  const baseCacheHighway = typeof cacheHighway === "function" ? cacheHighway : null;
  if (baseCacheHighway) {
    cacheHighway = function cacheHighwayCompact(descriptor, lines, partial = false) {
      return baseCacheHighway(descriptor, compactLines(lines, HIGHWAY_TOLERANCE_M), partial);
    };
  }

  let existingChanged = false;
  for (const trip of state.trips || []) existingChanged = compactTrip(trip) || existingChanged;
  if (existingChanged && baseSaveTrips) baseSaveTrips();

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  window.MinhasViagensGeometryCompact = {
    simplifyLine,
    encodePolyline,
    decodePolyline,
    compactTrip,
    stats
  };

  console.info(`Minhas Viagens ${APP_VERSION}: rotas simplificadas a ${TRIP_TOLERANCE_M} m e rodovias completas a ${HIGHWAY_TOLERANCE_M} m com armazenamento Polyline5.`);
})();
