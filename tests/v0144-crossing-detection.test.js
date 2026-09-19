const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const core = require("../crossing-detection-core.js");

function adminRelation(id, name, uf, polygon) {
  return {
    id,
    type: "relation",
    tags: { name, boundary: "administrative", admin_level: "8", "ISO3166-2": `BR-${uf}` },
    center: { lat: polygon.reduce((s,p)=>s+p[0],0)/polygon.length, lon: polygon.reduce((s,p)=>s+p[1],0)/polygon.length },
    members: [{ role: "outer", geometry: polygon.map(([lat,lon]) => ({lat,lon})) }]
  };
}

test("cruzamento perpendicular real é detectado mesmo sem 2 km percorridos", () => {
  const iconic = [[-20.0,-46.0],[-20.0,-45.98]];
  const trip = [[-20.01,-45.99],[-19.99,-45.99]];
  assert.equal(core.linesCross(trip, iconic, { toleranceKm:.04, minAngleDeg:25 }), true);
  assert.equal(core.routeCrossesGeometry(trip, [iconic], { toleranceKm:.04, minAngleDeg:25 }), true);
});

test("linha paralela próxima não é classificada como cruzamento", () => {
  const iconic = [[-20.0,-46.0],[-20.0,-45.98]];
  const trip = [[-20.0013,-46.0],[-20.0013,-45.98]]; // ~144 m ao sul, mesma direção
  assert.ok(core.pointSegmentDistanceKm(trip[0], iconic[0], iconic[1]) < .20);
  assert.equal(core.linesCross(trip, iconic, { toleranceKm:.20, minAngleDeg:25 }), false);
});

test("rota dentro de limite municipal é contabilizada por polígono administrativo", () => {
  const polygon = [[-20.02,-46.02],[-20.02,-45.98],[-19.98,-45.98],[-19.98,-46.02],[-20.02,-46.02]];
  const relation = adminRelation(1001,"Cidade Teste","MG",polygon);
  const route = [[-20.005,-46.01],[-19.995,-45.99]];
  assert.equal(core.administrativeBoundaryReliable(relation), true);
  assert.equal(core.routeIntersectsAdministrativeBoundary(route, relation), true);
  const record = core.cityRecordFromElement(relation);
  assert.equal(record.city,"Cidade Teste");
  assert.equal(record.region,"MG");
  assert.equal(record.countryCode,"BR");
});

test("rota fora do limite municipal não conquista a cidade", () => {
  const polygon = [[-20.02,-46.02],[-20.02,-45.98],[-19.98,-45.98],[-19.98,-46.02],[-20.02,-46.02]];
  const relation = adminRelation(1001,"Cidade Teste","MG",polygon);
  const route = [[-20.10,-46.10],[-20.08,-46.08]];
  assert.equal(core.routeIntersectsAdministrativeBoundary(route, relation), false);
});

test("Santa Maria em estados diferentes permanece como cidades distintas", () => {
  const rs = { city:"Santa Maria", region:"RS", countryCode:"BR", lat:-29.69, lng:-53.81 };
  const df = { city:"Santa Maria", region:"DF", countryCode:"BR", lat:-16.01, lng:-48.01 };
  assert.equal(core.sameCity(rs,df), false);
  assert.equal(core.uniqueCities([rs,df]).length, 2);
});

test("mesma cidade em destino e cruzada é reconhecida por nome + estado", () => {
  const destination = { city:"Campinas", region:"SP", countryCode:"BR", lat:-22.90, lng:-47.06 };
  const crossing = { city:"Campinas", region:"SP", countryCode:"BR", lat:-22.91, lng:-47.05, osmType:"relation", osmId:"298285" };
  assert.equal(core.sameCity(destination,crossing), true);
});

test("IBGE permite recuperar UF e país quando tags de endereço não existem", () => {
  const meta = core.metadataFromTags({ "IBGE:GEOCODIGO":"3549805" });
  assert.equal(meta.region,"SP");
  assert.equal(meta.countryCode,"BR");
  assert.equal(meta.country,"Brasil");
});

test("v0.14.6 usa limites administrativos e deixa fallback explícito", () => {
  const source = fs.readFileSync("v0144-crossing-fix.js","utf8");
  assert.match(source,/route-city-crossings-v3-admin/);
  assert.match(source,/boundary\"=\"administrative/);
  assert.match(source,/admin_level/);
  assert.match(source,/routeIntersectsAdministrativeBoundary/);
  assert.match(source,/Fallback somente quando o OSM não devolve nenhum limite administrativo confiável/);
  assert.match(source,/crossingType:\"crossed\"/);
  assert.match(source,/Cruzamento detectado · interseção geométrica/);
});
