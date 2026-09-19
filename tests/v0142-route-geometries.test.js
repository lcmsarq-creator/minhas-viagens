const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function payload(id) {
  return JSON.parse(fs.readFileSync(`iconic-routes/v1/${id}.json`, "utf8"));
}

function decodePolyline(encoded, precision = 5) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0, lat = 0, lon = 0;
  const next = () => {
    let result = 0, shift = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lon += next();
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

function firstLast(id) {
  const item = payload(id);
  const points = decodePolyline(item.encodedLines[0], item.precision || 5);
  return { item, points, first: points[0], last: points.at(-1) };
}

function near(actual, expected, tolerance = 1.1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} não está próximo de ${expected}`);
}

test("Caminho do Céu respeita os dois marcos revisados e não faz o antigo desvio longo", () => {
  const { item, first, last } = firstLast("caminho-do-ceu-canastra");
  near(first[0], -20.395664820555236); near(first[1], -46.57317399774923);
  near(last[0], -20.406878225530573); near(last[1], -46.6139660336841);
  assert.ok(item.totalKm > 6.5 && item.totalKm < 7.5);
  assert.equal(item.sourceType, "openstreetmap-local-network");
});

test("Serra Branca respeita os marcos revisados", () => {
  const { item, first, last } = firstLast("serra-branca-canastra");
  near(first[0], -20.37843776657122); near(first[1], -46.569853819726454);
  near(last[0], -20.395664820555236); near(last[1], -46.57317399774923);
  assert.ok(item.totalKm > 3 && item.totalKm < 3.7);
});

test("Caminhos de São Tiago usa a camada compartilhada de alta resolução", () => {
  const { item, points } = firstLast("caminhos-de-sao-tiago");
  assert.equal(item.sourceType, "google-mymaps-kml");
  assert.equal(points.length, 6311);
  assert.ok(item.totalKm > 250 && item.totalKm < 270);
  assert.match(item.sourceUrl || "", /ATwdHEVMy8ZMJH4T6/);
});

test("Caminhos de Pedra começa exatamente no entroncamento com a ERS-448", () => {
  const { item, first, last } = firstLast("caminhos-de-pedra");
  near(first[0], -29.181258); near(first[1], -51.383589);
  assert.ok(first[1] > last[1], "o primeiro ponto deve estar no entroncamento ERS-448 / VRS-855");
  assert.ok(item.totalKm > 17 && item.totalKm < 18);
  assert.equal(item.sourceType, "official-access-plus-routed-waypoints");
});

test("Brejo Grande cobre o lote oficial de aproximadamente 6,43 km", () => {
  const { item } = firstLast("estrada-parque-brejo-grande");
  assert.ok(item.totalKm > 6.3 && item.totalKm < 6.55);
  assert.equal(item.sourceType, "official-endpoints-osrm");
});

test("Litoral Norte termina no entroncamento da SE-439", () => {
  const { item, last } = firstLast("estrada-parque-se100-litoral-norte");
  near(last[0], -10.5524); near(last[1], -36.61582);
  assert.ok(item.totalKm > 25 && item.totalKm < 27.2);
  assert.match(item.routeNote || "", /27,09/);
});

test("Maringá–Maromba alcança os dois núcleos urbanos pela RJ-151", () => {
  const { item, first, last } = firstLast("estrada-parque-maringa-maromba");
  assert.ok(item.totalKm > 3 && item.totalKm < 3.5);
  assert.ok(first[1] > -44.58);
  assert.ok(last[1] < -44.596);
});

test("Morro do Diabo é limitado pelo perímetro do parque e mede cerca de 14 km", () => {
  const { item } = firstLast("estrada-parque-morro-do-diabo");
  assert.ok(item.totalKm > 13.9 && item.totalKm < 14.2);
  assert.equal(item.sourceType, "osm-protected-area-intersection");
  assert.match(item.routeNote || "", /3915018|perímetro|relação OSM/i);
});

test("Terra Vermelha–Garatuba permanece coerente com os 6,99 km oficiais", () => {
  const item = payload("estrada-parque-terra-vermelha-garatuba");
  assert.ok(item.totalKm > 6.7 && item.totalKm < 7.1);
});

test("Serra Dona Francisca permanece baseada na SC-418 para revisão posterior", () => {
  const item = payload("serra-dona-francisca");
  assert.deepEqual(item.roadCatalogPaths, ["sc/418.json"]);
  assert.ok(item.totalKm > 62 && item.totalKm < 64);
});
