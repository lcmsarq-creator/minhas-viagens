const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = {
    console,
    INTERNATIONAL_ROADS: {},
    COUNTRY_CODE_BY_NAME: {},
    internationalRoadRef() { return ""; },
    roadShieldMarkup(label, size) { return `base-shield:${label}:${size}`; },
    parseRoadCode() { return null; },
    escapeHtml(value) { return String(value); }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("international-road-shields.js", "utf8"), context);
  return context;
}

test("Uruguai e Argentina são definidos pelo hint geográfico do próprio trecho", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;
  assert.equal(api.internationalRoadRef("Ruta 15", { countries:["UY","AR"], hint:"UY" }), "INT:UY:RU:15");
  assert.equal(api.internationalRoadRef("RN 9", { countries:["UY","AR"], hint:"AR" }), "INT:AR:RN:9");
  assert.equal(api.internationalRoadRef("Ruta 5", { countries:["UY","AR"], hint:"" }), "");
});

test("Colômbia aceita ref nacional numérica e América Central aceita redes nacionais", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;
  assert.equal(api.internationalRoadRef("25", { countries:["CO"], hint:"CO" }), "INT:CO:RN:25");
  assert.equal(api.internationalRoadRef("CA-1", { countries:["GT"], hint:"GT" }), "INT:GT:CA:1");
  assert.equal(api.internationalRoadRef("NIC-1", { countries:["NI"], hint:"NI" }), "INT:NI:NIC:1");
  assert.equal(api.internationalRoadRef("2", { countries:["CR"], hint:"CR" }), "INT:CR:N:2");
});

test("release v0.14.6 invalida o cache do shell e dos módulos", () => {
  const moduleSource = fs.readFileSync("international-road-shields.js", "utf8");
  const authSource = fs.readFileSync("auth.js", "utf8");
  const indexSource = fs.readFileSync("index.html", "utf8");
  assert.match(moduleSource, /APP_VERSION = "0\.13\.12"/);
  assert.match(authSource, /APP_VERSION=window\.MINHAS_VIAGENS_APP_VERSION\|\|"0\.14\.6"/);
  assert.match(indexSource, /MINHAS_VIAGENS_APP_VERSION = "0\.14\.6"/);
  assert.match(indexSource, /auth\.js\?v=0\.14\.6/);
});
