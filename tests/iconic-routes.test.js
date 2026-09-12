const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../iconic-routes-core.js");

test("o teste da Graciosa aponta para a geometria integral da PR-410", () => {
  const file = path.join(__dirname, "..", "road-catalog", "v1", "br", "pr", "410.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(payload.key, "BR|PR|410");
  assert.equal(payload.partial, false);
  assert.ok(payload.totalKm > 29 && payload.totalKm < 31);
  assert.ok(payload.encodedLines.length > 0);
});

test("rotas longas recebem ouro a partir de 85%", () => {
  const route = { long: true, completionPercent: 85, minContinuousKm: 2 };
  assert.equal(core.routeAchievement(route, { percent: 84.9, longestContinuousKm: 100 }).completed, false);
  assert.equal(core.routeAchievement(route, { percent: 85, longestContinuousKm: 100 }).completed, true);
});

test("rota cênica curta é descoberta somente com 2 km contínuos", () => {
  const route = { long: false, minContinuousKm: 2 };
  assert.equal(core.routeAchievement(route, { percent: 50, longestContinuousKm: 1.99 }).completed, false);
  assert.equal(core.routeAchievement(route, { percent: 7, longestContinuousKm: 2 }).completed, true);
});

test("BR recebe ouro em 85% e não antes", () => {
  assert.equal(core.roadMedal("BR-040", 84.9), "");
  assert.equal(core.roadMedal("BR-040", 85), "gold");
});

test("estadual e secundária recebem prata em 90%", () => {
  assert.equal(core.roadMedal("PR-410", 89.9), "");
  assert.equal(core.roadMedal("PR-410", 90), "silver");
  assert.equal(core.roadMedal("ERS-324", 90), "silver");
  assert.equal(core.roadMedal("LMG-800", 90), "silver");
});

test("conquista icônica dá ouro ao emblema e prevalece sobre a prata", () => {
  assert.equal(core.roadMedal("PR-410", 12, true), "gold");
  assert.equal(core.roadMedal("PR-410", 100, true), "gold");
});
