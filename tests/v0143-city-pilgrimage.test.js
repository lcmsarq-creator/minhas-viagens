const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function route(id) {
  return JSON.parse(fs.readFileSync(path.join("iconic-routes", "v1", `${id}.json`), "utf8"));
}
function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} fora de ${expected} ± ${tolerance}`);
}

test("v0.14.8 separa cidades Destinos e Cruzadas sem agrupar cruzadas por estado", () => {
  const source = fs.readFileSync("v0142-adjustments.js", "utf8");
  assert.match(source, /route-city-crossings-v2-tabs/);
  assert.match(source, /data-city-mode="destinations"/);
  assert.match(source, /data-city-mode="crossed"/);
  assert.match(source, />Destinos <span>/);
  assert.match(source, />Cruzadas <span>/);
  assert.match(source, /region: ""/);
  assert.match(source, /trip\?\.routeCityConquests \|\| \[\]/);
  assert.doesNotMatch(source, /if \(trip\?\.visible === false\) continue;/);
  assert.match(source, /cityAchievementCount\.textContent = String\(destinations\.length \+ crossed\.length\)/);
});

test("rotas de peregrinação usam as geometrias exatas das fontes revisadas", () => {
  const expected = {
    "caminho-da-fe": [302.449, 1],
    "rota-da-luz-sp": [201.602, 1],
    "caminho-da-prece": [67.674, 2],
    "caminho-de-nha-chica": [269.718, 16],
    "caminhos-de-caravaggio": [216.168, 1],
    "caminho-das-capelas": [73.963, 1],
    "caminho-da-agonia": [57.425, 1],
    "vale-europeu": [213.19, 9]
  };
  for (const [id, [km, lines]] of Object.entries(expected)) {
    const data = route(id);
    close(data.totalKm, km, 0.02, id);
    assert.equal(data.encodedLines.length, lines, `${id}: número de trechos`);
    assert.ok(data.sourceUrl, `${id}: deve registrar fonte`);
  }
});

test("Rota do Vinho fica preservada mas desativada e Caminho da Agonia ocupa o catálogo ativo", () => {
  const wine = route("rota-do-vinho-sao-roque");
  assert.equal(wine.disabled, true);
  const source = fs.readFileSync("iconic-routes-catalog.js", "utf8");
  assert.doesNotMatch(source, /route\("rota-do-vinho-sao-roque"/);
  assert.match(source, /route\("caminho-da-agonia"/);
  const manifest = JSON.parse(fs.readFileSync(path.join("iconic-route-catalog", "v1", "manifest.json"), "utf8"));
  assert.equal(manifest.routeCount, 86);
  assert.equal(Boolean(manifest.routes["rota-do-vinho-sao-roque"]), false);
  assert.equal(Boolean(manifest.routes["caminho-da-agonia"]), true);
});

test("Caminho das Missões registra a revisão e Caminho do Céu mantém os marcos solicitados", () => {
  const catalog = fs.readFileSync("iconic-routes-catalog.js", "utf8");
  assert.match(catalog, /Portal das Missões/);
  assert.match(catalog, /São Borja → São Nicolau → São Luiz Gonzaga → São Miguel das Missões → Santo Ângelo/);
  const sky = route("caminho-do-ceu-canastra");
  close(sky.totalKm, 6.963, 0.02, "caminho-do-ceu-canastra");
  assert.ok(sky.bounds[0][0] <= -20.40687 && sky.bounds[1][0] >= -20.39567);
  assert.ok(sky.bounds[0][1] <= -46.61396 && sky.bounds[1][1] >= -46.57318);
});

test("Vale Europeu é composto pelas nove etapas GPX oficiais", () => {
  const data = route("vale-europeu");
  assert.equal(data.sourceType, "official-gpx");
  assert.equal(data.encodedLines.length, 9);
  close(data.totalKm, 213.19, 0.03, "vale-europeu");
  assert.match(data.routeNote, /Nove etapas GPX oficiais/);
});
