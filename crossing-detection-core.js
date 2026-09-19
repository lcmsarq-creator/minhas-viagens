((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MinhasViagensCrossingDetection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const IBGE_UF = Object.freeze({
    "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
    "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA",
    "31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF"
  });
  const COUNTRY_NAMES = Object.freeze({BR:"Brasil",AR:"Argentina",UY:"Uruguai",PY:"Paraguai",CL:"Chile",BO:"Bolívia",PE:"Peru",EC:"Equador",CO:"Colômbia",VE:"Venezuela",GY:"Guiana",SR:"Suriname",GF:"Guiana Francesa",PA:"Panamá",CR:"Costa Rica",NI:"Nicarágua",HN:"Honduras",SV:"El Salvador",GT:"Guatemala",BZ:"Belize",MX:"México",US:"Estados Unidos",CA:"Canadá"});

  function normalizeSimple(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function isPoint(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function haversineKm(a, b) {
    if (!isPoint(a) || !isPoint(b)) return Infinity;
    const toRad = value => Number(value) * Math.PI / 180;
    const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
    const dLat = lat2 - lat1, dLon = toRad(Number(b[1]) - Number(a[1]));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function pointSegmentDistanceKm(point, a, b) {
    if (![point, a, b].every(isPoint)) return Infinity;
    const latScale = 111.32;
    const lngScale = Math.max(.01, Math.cos(Number(point[0]) * Math.PI / 180)) * 111.32;
    const px = Number(point[1]) * lngScale, py = Number(point[0]) * latScale;
    const ax = Number(a[1]) * lngScale, ay = Number(a[0]) * latScale;
    const bx = Number(b[1]) * lngScale, by = Number(b[0]) * latScale;
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy;
    const t = denom ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function orientation(a, b, c) {
    const value = (Number(b[1]) - Number(a[1])) * (Number(c[0]) - Number(a[0])) - (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(a[1]));
    if (Math.abs(value) <= 1e-12) return 0;
    return value > 0 ? 1 : -1;
  }

  function onSegment(a, b, p) {
    if (orientation(a, b, p) !== 0) return false;
    const eps = 1e-10;
    return Number(p[0]) >= Math.min(Number(a[0]), Number(b[0])) - eps && Number(p[0]) <= Math.max(Number(a[0]), Number(b[0])) + eps &&
      Number(p[1]) >= Math.min(Number(a[1]), Number(b[1])) - eps && Number(p[1]) <= Math.max(Number(a[1]), Number(b[1])) + eps;
  }

  function segmentsIntersect(a, b, c, d) {
    if (![a,b,c,d].every(isPoint)) return false;
    const o1 = orientation(a,b,c), o2 = orientation(a,b,d), o3 = orientation(c,d,a), o4 = orientation(c,d,b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSegment(a,b,c)) || (o2 === 0 && onSegment(a,b,d)) || (o3 === 0 && onSegment(c,d,a)) || (o4 === 0 && onSegment(c,d,b));
  }

  function bearing(a, b) {
    const lat1 = Number(a[0]) * Math.PI / 180, lat2 = Number(b[0]) * Math.PI / 180;
    const dLon = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function bearingDifference(a, b) {
    const raw = Math.abs(Number(a) - Number(b)) % 180;
    return Math.min(raw, 180 - raw);
  }

  function segmentDistanceKm(a, b, c, d) {
    if (segmentsIntersect(a,b,c,d)) return 0;
    return Math.min(pointSegmentDistanceKm(a,c,d), pointSegmentDistanceKm(b,c,d), pointSegmentDistanceKm(c,a,b), pointSegmentDistanceKm(d,a,b));
  }

  function linesCross(first, second, options = {}) {
    const toleranceKm = Number.isFinite(Number(options.toleranceKm)) ? Number(options.toleranceKm) : .04;
    const minAngleDeg = Number.isFinite(Number(options.minAngleDeg)) ? Number(options.minAngleDeg) : 25;
    if (!Array.isArray(first) || !Array.isArray(second)) return false;
    for (let i = 1; i < first.length; i++) {
      const a = first[i - 1], b = first[i];
      if (!isPoint(a) || !isPoint(b)) continue;
      const ba = bearing(a,b);
      for (let j = 1; j < second.length; j++) {
        const c = second[j - 1], d = second[j];
        if (!isPoint(c) || !isPoint(d)) continue;
        if (segmentsIntersect(a,b,c,d)) return true;
        if (toleranceKm <= 0) continue;
        const angle = bearingDifference(ba, bearing(c,d));
        if (angle >= minAngleDeg && segmentDistanceKm(a,b,c,d) <= toleranceKm) return true;
      }
    }
    return false;
  }

  function routeCrossesGeometry(tripLine, geometryLines, options = {}) {
    return (geometryLines || []).some(line => linesCross(tripLine, line, options));
  }

  function pointInPolygon(point, polygon) {
    if (!isPoint(point) || !Array.isArray(polygon) || polygon.length < 3) return false;
    const y = Number(point[0]), x = Number(point[1]);
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const yi = Number(polygon[i]?.[0]), xi = Number(polygon[i]?.[1]);
      const yj = Number(polygon[j]?.[0]), xj = Number(polygon[j]?.[1]);
      if (![xi,yi,xj,yj].every(Number.isFinite)) continue;
      if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
    }
    return inside;
  }

  function sameCoordinate(a, b, toleranceDeg = 1e-5) {
    return isPoint(a) && isPoint(b) && Math.abs(Number(a[0]) - Number(b[0])) <= toleranceDeg && Math.abs(Number(a[1]) - Number(b[1])) <= toleranceDeg;
  }

  function relationOuterLines(element) {
    const memberLines = (element?.members || [])
      .filter(member => !member.role || member.role === "outer")
      .map(member => (member.geometry || []).map(item => [Number(item.lat), Number(item.lon)]).filter(isPoint))
      .filter(line => line.length >= 2);
    if (memberLines.length) return memberLines;
    const direct = (element?.geometry || []).map(item => [Number(item.lat), Number(item.lon)]).filter(isPoint);
    return direct.length >= 2 ? [direct] : [];
  }

  function stitchRings(lines, toleranceDeg = 1e-5) {
    const remaining = (lines || []).map(line => line.slice()).filter(line => line.length >= 2);
    const rings = [];
    while (remaining.length) {
      let ring = remaining.shift();
      let changed = true;
      while (changed && remaining.length && !sameCoordinate(ring[0], ring[ring.length - 1], toleranceDeg)) {
        changed = false;
        for (let i = 0; i < remaining.length; i++) {
          const line = remaining[i];
          if (sameCoordinate(ring[ring.length - 1], line[0], toleranceDeg)) { ring = ring.concat(line.slice(1)); remaining.splice(i,1); changed = true; break; }
          if (sameCoordinate(ring[ring.length - 1], line[line.length - 1], toleranceDeg)) { ring = ring.concat(line.slice(0,-1).reverse()); remaining.splice(i,1); changed = true; break; }
          if (sameCoordinate(ring[0], line[line.length - 1], toleranceDeg)) { ring = line.slice(0,-1).concat(ring); remaining.splice(i,1); changed = true; break; }
          if (sameCoordinate(ring[0], line[0], toleranceDeg)) { ring = line.slice(1).reverse().concat(ring); remaining.splice(i,1); changed = true; break; }
        }
      }
      if (ring.length >= 4 && sameCoordinate(ring[0], ring[ring.length - 1], toleranceDeg)) rings.push(ring);
    }
    return rings;
  }

  function administrativeBoundaryReliable(element) {
    const tags = element?.tags || {};
    const level = Number(tags.admin_level);
    if (tags.boundary !== "administrative" || ![7,8,9].includes(level) || !tags.name) return false;
    const lines = relationOuterLines(element);
    return lines.length > 0 && lines.reduce((sum, line) => sum + line.length, 0) >= 4;
  }

  function routeIntersectsAdministrativeBoundary(line, element) {
    const outer = relationOuterLines(element);
    if (!outer.length) return false;
    if (outer.some(boundary => linesCross(line, boundary, { toleranceKm: 0, minAngleDeg: 0 }))) return true;
    const rings = stitchRings(outer);
    return rings.some(ring => (line || []).some(point => pointInPolygon(point, ring)));
  }

  function elementPoint(element) {
    if (Number.isFinite(Number(element?.lat)) && Number.isFinite(Number(element?.lon))) return [Number(element.lat), Number(element.lon)];
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) return [Number(element.center.lat), Number(element.center.lon)];
    const b = element?.bounds;
    if ([b?.minlat,b?.minlon,b?.maxlat,b?.maxlon].every(value => Number.isFinite(Number(value)))) return [(Number(b.minlat)+Number(b.maxlat))/2,(Number(b.minlon)+Number(b.maxlon))/2];
    const first = relationOuterLines(element)[0]?.[0];
    return first && isPoint(first) ? first : null;
  }

  function metadataFromTags(tags = {}) {
    const ibge = String(tags["IBGE:GEOCODIGO"] || tags["ref:IBGE"] || tags["ref:ibge"] || "").replace(/\D/g, "");
    const iso2 = String(tags["ISO3166-2"] || tags["addr:state_code"] || "").toUpperCase();
    let region = String(tags["is_in:state_code"] || tags["addr:state"] || tags["is_in:state"] || "").trim();
    let countryCode = String(tags["ISO3166-1:alpha2"] || tags["ISO3166-1"] || tags["addr:country"] || tags["is_in:country_code"] || "").toUpperCase().trim();
    if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(iso2)) {
      if (!countryCode) countryCode = iso2.slice(0,2);
      if (!region) region = iso2.split("-")[1];
    }
    if (ibge.length >= 2 && IBGE_UF[ibge.slice(0,2)]) {
      countryCode = countryCode || "BR";
      region = region || IBGE_UF[ibge.slice(0,2)];
    }
    const country = String(tags["is_in:country"] || "").trim() || COUNTRY_NAMES[countryCode] || "";
    return { region, country, countryCode };
  }

  function cityRecordFromElement(element, source = "route-admin-crossing") {
    const tags = element?.tags || {};
    const city = String(tags.name || tags["name:pt"] || "").trim();
    if (!city) return null;
    const point = elementPoint(element) || [];
    const meta = metadataFromTags(tags);
    const label = [city, meta.region, meta.country].filter(Boolean).join(", ");
    return {
      label: label || city,
      city,
      region: meta.region,
      country: meta.country,
      countryCode: meta.countryCode,
      lat: Number(point[0]),
      lng: Number(point[1]),
      osmType: String(element?.type || ""),
      osmId: element?.id == null ? "" : String(element.id),
      source
    };
  }

  function cityIdentity(city) {
    const type = String(city?.osmType || "");
    const id = String(city?.osmId || "");
    if (type && id) return `osm:${type}:${id}`;
    const lat = Number(city?.lat), lng = Number(city?.lng);
    const coord = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}|${lng.toFixed(4)}` : "";
    return `${normalizeSimple(city?.city || city?.label)}|${normalizeSimple(city?.region)}|${String(city?.countryCode || "").toUpperCase()}|${coord}`;
  }

  function sameCity(a, b) {
    const nameA = normalizeSimple(a?.city || a?.label), nameB = normalizeSimple(b?.city || b?.label);
    if (!nameA || nameA !== nameB) return false;
    const aid = a?.osmId != null && a?.osmId !== "" ? `${a?.osmType || ""}:${a.osmId}` : "";
    const bid = b?.osmId != null && b?.osmId !== "" ? `${b?.osmType || ""}:${b.osmId}` : "";
    if (aid && bid) return aid === bid;
    const regionA = normalizeSimple(a?.region), regionB = normalizeSimple(b?.region);
    const countryA = String(a?.countryCode || "").toUpperCase(), countryB = String(b?.countryCode || "").toUpperCase();
    if (regionA && regionB && regionA !== regionB) return false;
    if (countryA && countryB && countryA !== countryB) return false;
    if ((regionA && regionB) || (countryA && countryB)) return true;
    const pa = [Number(a?.lat), Number(a?.lng)], pb = [Number(b?.lat), Number(b?.lng)];
    return pa.every(Number.isFinite) && pb.every(Number.isFinite) ? haversineKm(pa,pb) <= 25 : false;
  }

  function uniqueCities(cities) {
    const output = [];
    for (const city of cities || []) {
      if (!city || output.some(existing => sameCity(existing, city))) continue;
      output.push(city);
    }
    return output;
  }

  return Object.freeze({
    normalizeSimple, haversineKm, pointSegmentDistanceKm, segmentsIntersect, bearingDifference,
    linesCross, routeCrossesGeometry, pointInPolygon, relationOuterLines, stitchRings,
    administrativeBoundaryReliable, routeIntersectsAdministrativeBoundary, metadataFromTags,
    cityRecordFromElement, cityIdentity, sameCity, uniqueCities
  });
});
