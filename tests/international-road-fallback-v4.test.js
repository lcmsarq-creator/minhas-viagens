const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const markerSource = fs.readFileSync("road-marker-hotfix.js", "utf8");
const shieldSource = fs.readFileSync("international-road-shields.js", "utf8");
const coreSource = fs.readFileSync("script.js", "utf8");

test("schema v5 força reconstrução das placas já salvas", () => {
  assert.match(markerSource, /road-badges-v5-americas-country-context/);
  assert.match(markerSource, /refreshTripRoadDataFromRoute/);
  assert.match(markerSource, /extractRoadSegmentsFromRouteAmericas/);
});

test("rodovia federal brasileira sobrevive mesmo quando Brasil é apenas trânsito", () => {
  assert.match(markerSource, /BRAZIL_FEDERAL_REF/);
  assert.match(markerSource, /if\(BRAZIL_FEDERAL_REF\.test\(value\)\)return true/);
});

test("placa estadual brasileira só é aceita em step localizado no Brasil", () => {
  assert.match(markerSource, /BRAZIL_STATE_REF/);
  assert.match(markerSource, /return hint==="BR"/);
});

test("país sem SVG próprio usa o template internacional base e nunca o estadual brasileiro", () => {
  assert.match(shieldSource, /genericInternationalShield/);
  assert.match(shieldSource, /viewBox="0 0 100 120"/);
  assert.match(coreSource, /if \(parsed\.international\)/);
});

test("SVGs próprios estão ligados aos países enviados", () => {
  for (const code of ["arg", "chl", "col", "ecu", "per", "pry", "ven"]) {
    assert.match(shieldSource, new RegExp(`assets/road-shields/${code}-national-default\\.svg`));
  }
});
