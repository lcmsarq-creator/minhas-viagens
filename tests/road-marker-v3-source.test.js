const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("road marker v6 força reconstrução e mantém países de trânsito", () => {
  const source = fs.readFileSync("road-marker-hotfix.js", "utf8");
  assert.match(source, /const APP_VERSION = window\.MINHAS_VIAGENS_APP_VERSION \|\| "0\.14\.6"/);
  assert.match(source, /road-badges-v6-north-america-country-context/);
  for (const code of ["UY", "AR", "PY", "CL", "BO", "PE", "EC", "CO", "VE", "MX", "US", "CA"]) assert.match(source, new RegExp(`"${code}"`));
  assert.match(source, /refreshTripRoadDataFromRoute/);
  assert.match(source, /trip\.roadLabels=extractRoadLabelsFromRoute/);
  assert.match(source, /trip\.conquests\.roads=extractHighwaysFromRoute/);
  assert.match(source, /extractRoadSegmentsFromRoute/);
});

test("loader publica v0.14.6", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  assert.match(auth, /APP_VERSION=window\.MINHAS_VIAGENS_APP_VERSION\|\|"0\.14\.6"/);
  assert.match(index, /MINHAS_VIAGENS_APP_VERSION = "0\.14\.6"/);
  assert.match(index, /auth\.js\?v=0\.14\.6/);
});
