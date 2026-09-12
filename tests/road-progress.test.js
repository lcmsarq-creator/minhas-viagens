const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const progress = require("../road-progress-core.js");

function northSouthFragments(count = 4, step = 0.009) {
  return Array.from({ length: count }, (_, index) => [
    [-20 + index * step, -49],
    [-20 + (index + 1) * step, -49]
  ]);
}

test("fragmentos OSM menores que 2 km continuam contando no progresso", () => {
  const lines = northSouthFragments();
  const route = [[-20, -49], [-20 + 4 * 0.009, -49]];
  const result = progress.corridorCoverage(lines, [route]);

  assert.equal(result.segments.length, 4);
  assert.equal(result.coveredEdgeCount, 4);
  assert.ok(result.traveledKm > 3.9 && result.traveledKm < 4.1);
  assert.ok(Math.abs(result.traveledKm - result.totalKm) < 0.001);
});

test("uma parte realmente não percorrida permanece fora do percentual", () => {
  const lines = northSouthFragments();
  const route = [[-20, -49], [-20 + 2 * 0.009, -49]];
  const result = progress.corridorCoverage(lines, [route]);

  assert.equal(result.coveredEdgeCount, 2);
  assert.equal(result.totalEdgeCount, 4);
  assert.ok(result.traveledKm / result.totalKm > 0.49);
  assert.ok(result.traveledKm / result.totalKm < 0.51);
});

test("pista paralela dentro do corredor é reconhecida", () => {
  const road = [[[-20, -49], [-20, -48.98]]];
  const nearbyParallelRoute = [[[-19.999, -49], [-19.999, -48.98]]];
  const distantParallelRoute = [[[-19.996, -49], [-19.996, -48.98]]];

  assert.equal(progress.corridorCoverage(road, nearbyParallelRoute).coveredEdgeCount, 1);
  assert.equal(progress.corridorCoverage(road, distantParallelRoute).coveredEdgeCount, 0);
});

test("uma rota que apenas cruza a rodovia não gera falso progresso", () => {
  const road = [[[-20, -49.01], [-20, -48.99]]];
  const crossingRoute = [[[-20.01, -49], [-19.99, -49]]];
  const result = progress.corridorCoverage(road, crossingRoute);

  assert.equal(result.coveredEdgeCount, 0);
  assert.equal(result.traveledKm, 0);
  assert.deepEqual(result.segments, []);
});

function loadRoadNetwork({ lines, route }) {
  let stored = null;
  const context = {
    console,
    document: { querySelector: () => null },
    cachedHighway: async () => null,
    cacheHighway: async (_descriptor, value) => ({ lines: value }),
    fetchFullHighway: async () => null,
    highwayProgress: async () => null,
    highwayCacheKey: () => "BR|SP|425",
    progressSignature: () => "geometry|trips",
    highwayDbGet: async () => null,
    highwayDbPut: async (_store, value) => { stored = value; },
    lineLengthKm: line => progress.haversineKm(line[0], line[1]),
    state: { trips: [{ mode: "carro", line: route }] },
    tripLatLngs: trip => trip.line,
    HIGHWAY_CACHE_VERSION: 2,
    HIGHWAY_PROGRESS_STORE: "progress",
    MinhasViagensRoadProgress: progress
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("road-network-hotfix.js", "utf8"), context);
  return { context, entry: { lines, totalKm: lines.reduce((sum, line) => sum + progress.haversineKm(line[0], line[1]), 0) }, stored: () => stored };
}

test("motor exibido usa a cobertura bruta e uma assinatura de cache própria", async () => {
  const lines = northSouthFragments();
  const route = [[-20, -49], [-20 + 2 * 0.009, -49]];
  const fixture = loadRoadNetwork({ lines, route });
  const result = await fixture.context.highwayProgress({}, fixture.entry);

  assert.ok(result.percent > 49 && result.percent < 51);
  assert.equal(result.segments.length, 2);
  assert.match(fixture.stored().signature, /^road-progress-corridor-v2\|road-network-additive-v3\|/);
});

test("chegar às extremidades não promove cobertura parcial a 100%", () => {
  const lines = northSouthFragments();
  const route = [[-20, -49], [-20 + 4 * 0.009, -49]];
  const fixture = loadRoadNetwork({ lines, route });

  assert.equal(fixture.context.MinhasViagensRoadNetwork.completionEvidence({ totalKm: 100 }, [route], 55).complete, false);
  assert.equal(fixture.context.MinhasViagensRoadNetwork.completionEvidence({ totalKm: 100 }, [route], 98.5).complete, true);
});

test("limite de 2 km continua valendo apenas para conceder a conquista", () => {
  const oneKmSegments = northSouthFragments();
  const context = {
    console,
    document: { querySelector: () => null },
    window: null,
    state: { trips: [] },
    matchingRoadSegments: () => ({ segments: oneKmSegments, traveledKm: 4 }),
    lineLengthKm: line => progress.haversineKm(line[0], line[line.length - 1])
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("road-threshold-hotfix.js", "utf8"), context);

  const conquestMatch = context.matchingRoadSegments([], []);
  const visualProgress = progress.corridorCoverage(oneKmSegments, [[[-20, -49], [-20 + 4 * 0.009, -49]]]);
  assert.equal(conquestMatch.traveledKm, 0);
  assert.ok(visualProgress.traveledKm > 3.9);
});
