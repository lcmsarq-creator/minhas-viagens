const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../iconic-routes-core.js");
const catalog = require("../iconic-routes-catalog.js");

test("o catálogo expõe 83 famílias em 86 recortes", () => {
  assert.equal(catalog.familyCount, 83);
  assert.equal(catalog.routeCount, 86);
  assert.equal(new Set(catalog.routes.map(route => route.id)).size, 86);
  assert.equal(catalog.routes.filter(route => route.family === "Estrada Real").length, 4);
});

test("as novas estradas-parque e caminhos veiculares fazem parte do catálogo sem duplicar as existentes", () => {
  const ids = ["transpantaneira", "estrada-parque-pocone-porto-cercado", "estrada-parque-cachoeira-da-fumaca", "estrada-parque-cuiaba-chapada", "estrada-parque-santo-antonio-porto-de-fora", "estrada-parque-piraputanga", "estrada-parque-itaquirai", "estrada-parque-veadeiros-go239", "estrada-parque-go327", "estrada-parque-pireneus", "estrada-parque-terra-ronca", "estrada-parque-rota-ecologica", "estrada-parque-guajara-nova-mamore", "estrada-parque-romeiros", "estrada-parque-castelhanos", "estrada-parque-serra-guararu", "estrada-parque-morro-do-diabo", "estrada-parque-visconde-maua", "estrada-parque-maringa-maromba", "estrada-parque-paraty-cunha", "estrada-parque-caparao-es190", "estrada-parque-alcides-daniel-da-costa", "estrada-parque-passos-dos-fundadores", "estrada-parque-bispo-dom-helvecio", "estrada-parque-brigadeiro-silva-paes", "estrada-parque-da-cidadania", "estrada-parque-se100-litoral-norte", "estrada-parque-brejo-grande", "estrada-parque-terra-vermelha-garatuba", "caminhos-de-sao-tiago", "caminho-sao-miguel-arcanjo", "crer-caminho-religioso-estrada-real", "rota-da-luz-sp", "caminho-da-luz", "caminho-da-prece", "caminho-de-nha-chica", "caminhos-de-caravaggio", "caminhos-de-nossa-senhora", "caminhos-franciscanos", "caminhos-de-padre-liberio", "caminho-das-capelas", "caminho-de-sao-jose-patriarca"];
  assert.equal(ids.length, 42);
  for (const id of ids) assert.ok(catalog.routes.some(route => route.id === id), `${id} deve existir`);
  assert.equal(catalog.routes.filter(route => route.id === "caminho-da-fe").length, 1);
  assert.equal(catalog.routes.filter(route => route.id === "rota-das-missoes").length, 1);
  assert.equal(catalog.routes.filter(route => route.id === "estrada-parque-pantanal").length, 1);
  assert.equal(catalog.routes.filter(route => route.id === "serra-da-macaca").length, 1);
  assert.equal(catalog.routes.filter(route => route.id === "estrada-da-graciosa").length, 1);
  assert.equal(catalog.routes.filter(route => route.id === "estrada-parque-da-serra").length, 1);
  assert.equal(catalog.routes.filter(route => route.family === "Estrada Real").length, 4);
  assert.equal(catalog.routes.some(route => /peabiru|itupava/i.test(`${route.id} ${route.name}`)), false);
  assert.equal(catalog.routes.find(route => route.id === "rota-das-missoes").name, "Caminho das Missões");
  assert.equal(catalog.routes.find(route => route.id === "estrada-parque-bispo-dom-helvecio").roadRefs[0], "AMG-900");
});

test("cada recorte tem uma geometria estática válida", () => {
  for (const route of catalog.routes) {
    const file = path.join(__dirname, "..", route.geometryPath);
    assert.ok(fs.existsSync(file), `${route.id} deve possuir geometria`);
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(payload.id, route.id);
    assert.equal(payload.precision, 5);
    assert.ok(payload.totalKm > 1, `${route.id} deve possuir extensão coerente`);
    assert.ok(payload.encodedLines.length > 0, `${route.id} deve possuir linhas`);
    assert.ok(Array.isArray(payload.bounds) && payload.bounds.length === 2);
  }
});

test("os quatro caminhos da Estrada Real preservam base oficial e alternativa rodoviária", () => {
  for (const route of catalog.routes.filter(item => item.family === "Estrada Real")) {
    const payload = JSON.parse(fs.readFileSync(path.join(__dirname, "..", route.geometryPath), "utf8"));
    assert.equal(route.officialAndAlternative, true);
    assert.equal(payload.sourceType, "official-gpx");
    assert.ok(payload.encodedLines.length > 0);
    assert.ok(payload.alternateEncodedLines.length > 0);
    assert.ok(payload.alternateTotalKm > 1);
  }
});

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

test("Panamericana e Carretera Austral preservam somente o trecho percorrido ao focar", () => {
  const panam = catalog.routes.find(item => item.id === "via-panamericana");
  const austral = catalog.routes.find(item => item.id === "carretera-austral");
  assert.equal(panam.long, true);
  assert.equal(panam.previewTraveledOnly, true);
  assert.equal(panam.emblemKey, "via-panam");
  assert.deepEqual(Array.from(panam.roadRefs), []);
  assert.match(panam.note, /Darién/);
  assert.equal(austral.long, true);
  assert.equal(austral.previewTraveledOnly, true);
  assert.deepEqual(Array.from(austral.roadRefs), ["INT:CL:CH:7"]);
});

test("geometrias latino-americanas mantêm o Darién separado e a Austral integral", () => {
  const panam = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "iconic-routes", "v1", "via-panamericana.json"), "utf8"));
  const austral = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "iconic-routes", "v1", "carretera-austral.json"), "utf8"));
  assert.equal(panam.encodedLines.length, 2);
  assert.ok(panam.totalKm > 13000 && panam.totalKm < 14000);
  assert.deepEqual(panam.osmRelationIds, [1661488, 240861]);
  assert.equal(austral.encodedLines.length, 1);
  assert.ok(austral.totalKm > 1150 && austral.totalKm < 1300);
  assert.deepEqual(austral.osmRelationIds, [6582701]);
});

test("as 12 novas rotas latino-americanas fazem parte do catálogo", () => {
  const ids = [
    "ruta-40-argentina", "mexico-1-transpeninsular", "ruta-siete-lagos", "ruta-3-fin-del-mundo",
    "espinazo-del-diablo", "paso-de-jama", "carretera-interoceanica-sur", "br-230-transamazonica",
    "paso-los-libertadores", "avenida-de-los-volcanes", "camino-de-los-yungas", "ch5-atacama"
  ];
  for (const id of ids) {
    const route = catalog.routes.find(item => item.id === id);
    assert.ok(route, `${id} deve existir`);
    assert.equal(route.long, true);
  }
  assert.equal(catalog.routes.find(item => item.id === "br-230-transamazonica").previewTraveledOnly, false);
  for (const id of ids.filter(id => id !== "br-230-transamazonica")) {
    assert.equal(catalog.routes.find(item => item.id === id).previewTraveledOnly, true, `${id} deve revelar somente o trecho viajado`);
  }
});

test("Via Panam registra inicialmente os cinco emblemas enviados", () => {
  const panam = catalog.routes.find(item => item.id === "via-panamericana");
  assert.deepEqual(Array.from(panam.emblemCountries), ["CO", "EC", "PE", "CL", "AR"]);
});

test("a entrada BR-319 não é rotulada incorretamente como Transamazônica", () => {
  const route = catalog.routes.find(item => item.id === "br-319-manaus-porto-velho");
  assert.equal(route.name, "BR-319 — Manaus–Porto Velho");
  assert.match(route.note, /BR-230/);
});
