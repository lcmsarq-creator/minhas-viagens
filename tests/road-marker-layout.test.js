const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const layout = require("../road-marker-layout.js");

const KM_PER_DEGREE = 111.19508;

function eastboundLine(startKm, lengthKm) {
  return [
    [0, startKm / KM_PER_DEGREE],
    [0, (startKm + lengthKm) / KM_PER_DEGREE]
  ];
}

test("um trecho de até 20 km não recebe escudo e um trecho maior recebe apenas um", () => {
  assert.equal(layout.markersFromTimeline([{ label: "SP-425", line: eastboundLine(0, 19.9) }]).length, 0);
  const exactLimitLine = eastboundLine(0, 20);
  const exactLimitKm = layout.lineLengthKm(exactLimitLine);
  assert.equal(layout.markersFromTimeline(
    [{ label: "SP-425", line: exactLimitLine }],
    { minRoadKm: exactLimitKm }
  ).length, 0, "o limite é estritamente superior a 20 km");

  const markers = layout.markersFromTimeline([{ label: "SP-425", line: eastboundLine(0, 20.1) }]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, "SP-425");
  assert.ok(Math.abs(markers[0].distanceKm - 20.1) < .02);
  assert.ok(Math.abs(markers[0].lng * KM_PER_DEGREE - 10.05) < .02);
});

test("Barretos–Presidente Prudente: uma interrupção longa cria dois escudos da SP-425", () => {
  const timeline = [
    { label: "SP-425", line: eastboundLine(0, 35) },
    { label: "BR-153", line: eastboundLine(35, 28) },
    { label: "SP-425", line: eastboundLine(63, 42) }
  ];

  const markers = layout.markersFromTimeline(timeline);
  assert.deepEqual(markers.map(marker => marker.label), ["SP-425", "BR-153", "SP-425"]);
  assert.ok(Math.abs(markers[0].lng * KM_PER_DEGREE - 17.5) < .03);
  assert.ok(Math.abs(markers[1].lng * KM_PER_DEGREE - 49) < .03);
  assert.ok(Math.abs(markers[2].lng * KM_PER_DEGREE - 84) < .03);
});

test("uma interrupção curta é absorvida e o escudo continua sobre a própria rodovia", () => {
  const timeline = [
    { label: "SP-425", line: eastboundLine(0, 15) },
    { label: "SP-270", line: eastboundLine(15, 5) },
    { label: "SP-425", line: eastboundLine(20, 11) }
  ];

  const markers = layout.markersFromTimeline(timeline);
  assert.deepEqual(markers.map(marker => marker.label), ["SP-425"]);
  assert.ok(markers[0].lng * KM_PER_DEGREE < 15, "o ponto médio não pode cair na interrupção da SP-270");
  assert.ok(Math.abs(markers[0].distanceKm - 26) < .03);
});

test("segmentos históricos próximos são unidos, mas uma separação grande cria outro grupo", () => {
  const markers = layout.markersFromSegmentMap({
    "BR-040": [
      eastboundLine(0, 12),
      eastboundLine(16, 12),
      eastboundLine(55, 24)
    ]
  });

  assert.equal(markers.length, 2);
  assert.ok(Math.abs(markers[0].distanceKm - 24) < .03);
  assert.ok(Math.abs(markers[1].distanceKm - 24) < .03);
});

test("o núcleo é carregado antes do mapa e o hotfix depois dos parsers de rodovias", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.ok(auth.indexOf('"road-marker-layout.js"') < auth.indexOf('"script.js"'));
  assert.ok(auth.indexOf('"road-marker-hotfix.js"') > auth.indexOf('"secondary-roads-hotfix.js"'));
});

test("o hotfix converte diretamente as etapas OSRM nos três marcadores do exemplo", () => {
  const context = {
    console,
    MinhasViagensRoadMarkerLayout: layout,
    extractRoadLabelsFromRoute() { return [{ label: "SP-425", lat: 0, lng: 0 }]; },
    extractHighwaysFromRoute() { return []; },
    tripRoadCountry() { return "BR"; },
    roadRefsFromStep(step) { return step.ref ? [step.ref] : []; },
    cleanRoadRef(value) { return String(value || "").trim(); },
    isHighwayRef(value) { return /^(?:BR|SP)-\d+$/.test(value); },
    normalizeKey(value) { return String(value || "").toLowerCase(); },
    state: { trips: [] },
    saveTrips() {},
    renderTrips() {},
    document: { querySelector() { return null; } },
    setTimeout() { return 1; },
    clearTimeout() {},
    MinhasViagensApp: { replaceTrips() {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("road-marker-hotfix.js", "utf8"), context);

  const trip = {};
  const route = {
    legs: [{ steps: [
      { ref: "SP-425", geometry: { coordinates: eastboundLine(0, 35).map(([lat, lng]) => [lng, lat]) } },
      { ref: "BR-153", geometry: { coordinates: eastboundLine(35, 28).map(([lat, lng]) => [lng, lat]) } },
      { ref: "SP-425", geometry: { coordinates: eastboundLine(63, 42).map(([lat, lng]) => [lng, lat]) } }
    ] }]
  };

  const markers = context.extractRoadLabelsFromRoute(route, trip);
  assert.deepEqual(Array.from(markers, marker => marker.label), ["SP-425", "BR-153", "SP-425"]);
  assert.deepEqual(Array.from(context.extractHighwaysFromRoute(route, trip)), ["SP-425"]);
  assert.equal(trip.roadBadgeLayoutVersion, "road-badges-v2-country-context");

  const shortRoute = {
    legs: [{ steps: [
      { ref: "SP-425", geometry: { coordinates: eastboundLine(0, 5).map(([lat, lng]) => [lng, lat]) } }
    ] }]
  };
  assert.equal(context.extractRoadLabelsFromRoute(shortRoute, trip).length, 0, "5 km não desenham escudo");
  assert.deepEqual(Array.from(context.extractHighwaysFromRoute(shortRoute, trip)), ["SP-425"], "5 km ainda concedem a rodovia");
});
