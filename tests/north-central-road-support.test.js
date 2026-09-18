const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function parseInternational(label) {
  const match = String(label || "").toUpperCase().match(/^INT:([A-Z]{2}):([A-Z]{1,3}):([0-9A-Z]{1,6})$/);
  return match ? { countryCode: match[1], network: match[2], number: match[3], international: true } : null;
}

function fixture() {
  const context = {
    console,
    MINHAS_VIAGENS_APP_VERSION: "0.14.0",
    INTERNATIONAL_ROADS: {},
    COUNTRY_CODE_BY_NAME: {},
    internationalRoadRef() { return ""; },
    roadShieldMarkup(label, size) { return `base-shield:${label}:${size}`; },
    escapeHtml(value) { return String(value); },
    MinhasViagensInternationalRoadShields: {
      assets: { AR: {}, BO: {}, CL: {}, CO: {}, EC: {}, PE: {}, PY: {}, UY: {}, VE: {} },
      countryMeta: {
        GT: { name: "GUATEMALA" }, NI: { name: "NICARAGUA" }, CR: { name: "COSTA RICA" },
        PA: { name: "PANAMA" }, HN: { name: "HONDURAS" }
      },
      parseInternational
    }
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
  assert.equal(api.internationalRoadRef("57", "MX"), "INT:MX:MEX:57");
  assert.equal(api.internationalRoadRef("JAL 80", "MX"), "");
});

test("Estados Unidos aceita US Routes e Interstates, mas não número estadual solto", () => {
  const api = fixture().MinhasViagensNorthCentralRoads;
  assert.equal(api.internationalRoadRef("US 1", "US"), "INT:US:US:1");
  assert.equal(api.internationalRoadRef("US Route 101", "US"), "INT:US:US:101");
  assert.equal(api.internationalRoadRef("I-95", "US"), "INT:US:I:95");
  assert.equal(api.internationalRoadRef("Interstate 80", "US"), "INT:US:I:80");
  assert.equal(api.internationalRoadRef("95", "US"), "");
});

test("Canadá restringe esta camada à Trans-Canada Highway", () => {
  const api = fixture().MinhasViagensNorthCentralRoads;
  assert.equal(api.internationalRoadRef("TCH 1", "CA"), "INT:CA:TCH:1");
  assert.equal(api.internationalRoadRef("Trans-Canada Highway 1", "CA"), "INT:CA:TCH:1");
  assert.equal(api.internationalRoadRef("ON 401", "CA"), "");
});

test("escudos específicos usam os SVGs enviados e numeração dinâmica", () => {
  const context = fixture();
  const cases = [
    ["INT:MX:MEX:15D", "mex-national-default.svg", ">15D</text>"],
    ["INT:GT:CA:13", "gtm-national-default.svg", ">CA-13</text>"],
    ["INT:NI:NIC:1", "nic-national-default.svg", ">NIC-1</text>"],
    ["INT:CR:N:32", "cri-national-default.svg", ">32</text>"],
    ["INT:PA:N:10", "pan-national-default.svg", ">10</text>"],
    ["INT:US:US:101", "usa-national-default.svg", ">101</text>"],
    ["INT:US:I:95", "usa-interstate-default.svg", ">95</text>"]
  ];
  for (const [label, asset, text] of cases) {
    const markup = context.roadShieldMarkup(label, "map");
    assert.match(markup, new RegExp(asset.replace(".", "\\.")));
    assert.ok(markup.includes(text), `${label} deve conter ${text}`);
  }
});

test("Interstate usa número branco e países sem asset usam o SVG genérico enviado", () => {
  const context = fixture();
  const interstate = context.roadShieldMarkup("INT:US:I:90", "map");
  assert.match(interstate, /fill="#fefefe"/);

  const honduras = context.roadShieldMarkup("INT:HN:RN:15", "map");
  assert.match(honduras, /generic-national-default\.svg/);
  assert.match(honduras, />15<\/text>/);

  const canada = context.roadShieldMarkup("INT:CA:TCH:1", "map");
  assert.match(canada, /generic-national-default\.svg/);
  assert.match(canada, />1<\/text>/);
});

test("escudos sul-americanos já carregados e Brasil continuam delegados ao renderer anterior", () => {
  const context = fixture();
  assert.equal(context.roadShieldMarkup("INT:AR:RN:40", "map"), "base-shield:INT:AR:RN:40:map");
  assert.equal(context.roadShieldMarkup("INT:BR:BR:101", "map"), "base-shield:INT:BR:BR:101:map");
  const source = fs.readFileSync("north-central-road-support.js", "utf8");
  for (const code of ["arg", "bol", "chl", "col", "ecu", "per", "pry", "ury", "ven"]) {
    assert.doesNotMatch(source, new RegExp(`assets/road-shields/${code}-national-default\\.svg`));
  }
});

test("todos os novos templates mantêm área segura, base vetorial e número de amostra", () => {
  const regular = [
    "mex-national-default.svg", "gtm-national-default.svg", "nic-national-default.svg",
    "cri-national-default.svg", "pan-national-default.svg", "usa-national-default.svg",
    "usa-interstate-default.svg", "generic-national-default.svg"
  ];
  for (const filename of regular) {
    const svg = fs.readFileSync(`assets/road-shields/${filename}`, "utf8");
    assert.match(svg, /viewBox=/, filename);
    assert.match(svg, /id="text-safe-area"/, filename);
    assert.match(svg, /id="shield-base"/, filename);
    assert.match(svg, /id="road-number-sample"/, filename);
  }
});

test("suporte novo é carregado depois dos escudos existentes e antes dos marcadores", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const base = auth.indexOf('"international-road-shields.js"');
  const north = auth.indexOf('"north-central-road-support.js"');
  const marker = auth.indexOf('"road-marker-hotfix.js"');
  assert.ok(base >= 0 && north > base && marker > north);
});
