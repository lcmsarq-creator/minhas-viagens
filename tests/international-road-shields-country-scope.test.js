const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = {
    console,
    internationalRoadRef(raw, countryCode) { return `base:${countryCode}:${raw}`; },
    roadShieldMarkup(label, size) { return `base-shield:${label}:${size}`; },
    parseRoadCode(label) {
      const match = String(label).match(/^INT:([A-Z]{2}):([A-Z]+):(\w+)$/);
      return match ? { international: true, countryCode: match[1], network: match[2], number: match[3] } : null;
    },
    escapeHtml(value) { return String(value); }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("international-road-shields.js", "utf8"), context);
  return context;
}

test("Ruta/RN não recebe escudo uruguaio quando Argentina e Uruguai estão ambos no contexto", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;

  assert.equal(api.autoInternationalRoadRef("Ruta 5", "AUTO:UY,AR,CL"), "");
  assert.equal(api.autoInternationalRoadRef("Ruta 40", "AUTO:UY,AR,CL"), "");
  assert.equal(api.autoInternationalRoadRef("RN 22", "AUTO:UY,AR,CL"), "");
  assert.equal(api.autoInternationalRoadRef("Ruta Nacional 35", "AUTO:UY,AR,CL"), "");
});

test("contexto inequívoco ou hint explícito continua identificando o país correto", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;

  assert.equal(api.autoInternationalRoadRef("Ruta 5", "AUTO:UY,CL"), "INT:UY:RU:5");
  assert.equal(api.autoInternationalRoadRef("Ruta 40", "AUTO:AR,CL"), "INT:AR:RN:40");
  assert.equal(api.autoInternationalRoadRef("Ruta 5", { countries: ["UY", "AR", "CL"], hint: "UY" }), "INT:UY:RU:5");
  assert.equal(api.autoInternationalRoadRef("Ruta 40", { countries: ["UY", "AR", "CL"], hint: "AR" }), "INT:AR:RN:40");
});

test("release usa v0.13.9 para invalidar cache", () => {
  const moduleSource = fs.readFileSync("international-road-shields.js", "utf8");
  const authSource = fs.readFileSync("auth.js", "utf8");
  const indexSource = fs.readFileSync("index.html", "utf8");

  assert.match(moduleSource, /const APP_VERSION = "0\.13\.9"/);
  assert.match(authSource, /const APP_VERSION = "0\.13\.9"/);
  assert.match(indexSource, /MINHAS_VIAGENS_APP_VERSION = "0\.13\.9"/);
  assert.match(indexSource, /auth\.js\?v=0\.13\.9/);
});
