const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = {
    console,
    MINHAS_VIAGENS_APP_VERSION: "0.14.0",
    INTERNATIONAL_ROADS: {},
    COUNTRY_CODE_BY_NAME: {},
    internationalRoadRef() { return ""; }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("north-central-road-support.js", "utf8"), context);
  return context;
}

test("México aceita somente a rede federal nesta camada", () => {
  const api = fixture().MinhasViagensNorthCentralRoads;
  assert.equal(api.internationalRoadRef("MEX 15D", "MX"), "INT:MX:MEX:15D");
  assert.equal(api.internationalRoadRef("México 57", "MX"), "INT:MX:MEX:57");
  assert.equal(api.internationalRoadRef("JAL 80", "MX"), "");
});

test("Estados Unidos aceita US Routes e Interstates", () => {
  const api = fixture().MinhasViagensNorthCentralRoads;
  assert.equal(api.internationalRoadRef("US 1", "US"), "INT:US:US:1");
  assert.equal(api.internationalRoadRef("US Route 101", "US"), "INT:US:US:101");
  assert.equal(api.internationalRoadRef("I-95", "US"), "INT:US:I:95");
  assert.equal(api.internationalRoadRef("Interstate 80", "US"), "INT:US:I:80");
});

test("Canadá restringe esta camada à Trans-Canada Highway", () => {
  const api = fixture().MinhasViagensNorthCentralRoads;
  assert.equal(api.internationalRoadRef("TCH 1", "CA"), "INT:CA:TCH:1");
  assert.equal(api.internationalRoadRef("Trans-Canada Highway 1", "CA"), "INT:CA:TCH:1");
  assert.equal(api.internationalRoadRef("ON 401", "CA"), "");
});

test("módulo não redefine os SVGs sul-americanos já carregados", () => {
  const source = fs.readFileSync("north-central-road-support.js", "utf8");
  for (const code of ["arg", "bol", "chl", "col", "ecu", "per", "pry", "ury", "ven"]) {
    assert.doesNotMatch(source, new RegExp(`assets/road-shields/${code}-national-default\\.svg`));
  }
});

test("suporte novo é carregado depois dos escudos existentes e antes dos marcadores", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const base = auth.indexOf('"international-road-shields.js"');
  const north = auth.indexOf('"north-central-road-support.js"');
  const marker = auth.indexOf('"road-marker-hotfix.js"');
  assert.ok(base >= 0 && north > base && marker > north);
});
