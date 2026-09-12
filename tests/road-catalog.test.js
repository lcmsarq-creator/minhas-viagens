const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function encodePolyline(points, precision = 5) {
  const factor = 10 ** precision;
  let previousLat = 0, previousLon = 0, output = "";
  const encode = value => {
    let transformed = value < 0 ? ~(value << 1) : value << 1;
    while (transformed >= 0x20) {
      output += String.fromCharCode((0x20 | (transformed & 0x1f)) + 63);
      transformed >>= 5;
    }
    output += String.fromCharCode(transformed + 63);
  };
  for (const [lat, lon] of points) {
    const currentLat = Math.round(lat * factor), currentLon = Math.round(lon * factor);
    encode(currentLat - previousLat);
    encode(currentLon - previousLon);
    previousLat = currentLat;
    previousLon = currentLon;
  }
  return output;
}

function decodePolyline(encoded, precision = 5) {
  const factor = 10 ** precision, points = [];
  let index = 0, lat = 0, lon = 0;
  while (index < encoded.length) {
    const values = [];
    for (let axis = 0; axis < 2; axis++) {
      let result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      values.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    lat += values[0]; lon += values[1];
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

function fixture({ catalogHasRoad = true, trustedLocal = false } = {}) {
  const descriptor = { countryCode: "BR", network: "SP", number: "425", ref: "SP-425" };
  const key = "BR|SP|425";
  const manifest = {
    schema: "road-catalog-manifest-v1",
    catalogSchema: "road-catalog-polyline5-v1",
    validationSchema: "complete-road-catalog-v1",
    revision: "test",
    roadCount: catalogHasRoad ? 1 : 0,
    roads: catalogHasRoad ? { [key]: { path: "br/sp/425.json" } } : {}
  };
  const payload = {
    kind: "road_geometry_catalog",
    schema: "road-catalog-polyline5-v1",
    validationSchema: "complete-road-catalog-v1",
    key,
    cacheVersion: 2,
    precision: 5,
    partial: false,
    totalKm: 10,
    encodedLines: [encodePolyline([[-20, -49], [-20.1, -49.1]])]
  };
  let overpassCalls = 0;
  const writes = [];
  const legacy = trustedLocal ? {
    key, version: 2, lines: [[[-20, -49], [-20.1, -49.1]]], partial: false,
    needsNetworkRefresh: false, cloudValidationSchema: "complete-road-v3"
  } : { key, version: 2, lines: [[[-20, -49], [-20.01, -49.01]]], partial: true };
  const context = {
    console,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    document: { baseURI: "https://example.test/app/", querySelector: () => null },
    fetch: async url => ({
      ok: true,
      status: 200,
      json: async () => String(url).includes("manifest.json") ? manifest : payload
    }),
    cachedHighway: async () => legacy,
    fetchFullHighway: async () => { overpassCalls += 1; return { source: "overpass" }; },
    highwayCacheKey: () => key,
    highwayDbPut: async (_store, entry) => writes.push(entry),
    lineLengthKm: () => 10,
    HIGHWAY_GEOMETRY_STORE: "geometries",
    HIGHWAY_CACHE_VERSION: 2,
    HIGHWAY_CACHE_TTL: 1000,
  };
  context.window = context;
  context.MinhasViagensGeometryCompact = { decodePolyline };
  context.MinhasViagensRoadNetwork = { schema: "road-network-additive-v3" };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("road-catalog-hotfix.js", "utf8"), context);
  return { context, descriptor, writes, getOverpassCalls: () => overpassCalls };
}

test("catálogo substitui cache legado parcial", async () => {
  const value = fixture();
  const entry = await value.context.cachedHighway(value.descriptor, true);
  assert.equal(entry.catalogValidationSchema, "complete-road-catalog-v1");
  assert.equal(entry.partial, false);
  assert.equal(value.writes.length, 1);
});

test("rodovia ausente mantém fallback Overpass", async () => {
  const value = fixture({ catalogHasRoad: false });
  const entry = await value.context.fetchFullHighway(value.descriptor, null);
  assert.equal(entry.source, "overpass");
  assert.equal(value.getOverpassCalls(), 1);
});

test("cache v3 validado evita download repetido", async () => {
  const value = fixture({ trustedLocal: true });
  const entry = await value.context.cachedHighway(value.descriptor, true);
  assert.equal(entry.cloudValidationSchema, "complete-road-v3");
  assert.equal(value.context.MinhasViagensRoadCatalogStats.localHits, 1);
  assert.equal(value.writes.length, 0);
});
