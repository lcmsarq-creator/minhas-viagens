const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const markerSource = fs.readFileSync("road-marker-hotfix.js", "utf8");
const shieldSource = fs.readFileSync("international-road-shields.js", "utf8");
const coreSource = fs.readFileSync("script.js", "utf8");

test("novo schema força reconstrução das placas já salvas", () => {
  assert.match(markerSource, /road-badges-v4-geographic-country-context/);
  assert.match(markerSource, /refreshTripRoadDataFromRoute/);
  assert.match(markerSource, /extractRoadSegmentsFromRouteByInternationalTimeline/);
});

test("RN e Ruta recebem país pelo trecho e não viram estado brasileiro fora do Brasil", () => {
  assert.match(markerSource, /countryHintFromCoordinates/);
  assert.match(markerSource, /routeRefFromHint/);
  assert.match(markerSource, /BRAZILIAN_ROAD_REF/);
  assert.match(markerSource, /countries\.includes\("BR"\)/);
  assert.match(markerSource, /INT:\$\{hint\}:\$\{network\}:/);
});

test("Uruguai, Argentina e Colômbia possuem rede internacional explícita", () => {
  assert.match(markerSource, /UY: "RU"/);
  assert.match(markerSource, /AR: "RN"/);
  assert.match(markerSource, /CO: "RN"/);
  assert.match(markerSource, /URUGUAY_POLYGON/);
});

test("países sem SVG próprio continuam no template internacional base usado pelo Peru", () => {
  assert.match(coreSource, /if \(parsed\.international\)/);
  assert.match(coreSource, /viewBox="0 0 100 120"/);
  assert.match(shieldSource, /return baseRoadShieldMarkup\(label, size\)/);
});

test("Equador, Uruguai e Bolívia mantêm seus SVGs próprios", () => {
  assert.match(shieldSource, /ecuadorShieldMarkup/);
  assert.match(shieldSource, /uruguayShieldMarkup/);
  assert.match(shieldSource, /boliviaShieldMarkup/);
});
