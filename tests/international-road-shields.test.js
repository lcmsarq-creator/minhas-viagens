const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = {
    console,
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

function auto(countries, hint = "") {
  return { mode: "AUTO", countries, hint };
}

test("redes nacionais das Américas são canonicalizadas pelo país do trecho", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;
  assert.equal(api.internationalRoadRef("F4", auto(["BO"], "BO")), "INT:BO:F:4");
  assert.equal(api.internationalRoadRef("Ruta 5", auto(["UY", "AR"], "UY")), "INT:UY:RU:5");
  assert.equal(api.internationalRoadRef("RN 14", auto(["UY", "AR"], "AR")), "INT:AR:RN:14");
  assert.equal(api.internationalRoadRef("E35", auto(["EC", "CO"], "EC")), "INT:EC:E:35");
  assert.equal(api.internationalRoadRef("95", auto(["CO"], "CO")), "INT:CO:RN:95");
  assert.equal(api.internationalRoadRef("CH-60", auto(["CL"], "CL")), "INT:CL:CH:60");
  assert.equal(api.internationalRoadRef("Troncal 1", auto(["VE"], "VE")), "INT:VE:T:1");
  assert.equal(api.internationalRoadRef("PY 3", auto(["PY"], "PY")), "INT:PY:PY:3");
});

test("referências ambíguas não escolhem Argentina ou Uruguai sem hint geográfico", () => {
  const api = fixture().MinhasViagensInternationalRoadShields;
  assert.equal(api.internationalRoadRef("Ruta 5", auto(["UY", "AR"])), "");
  assert.equal(api.internationalRoadRef("RN 14", auto(["UY", "AR"])), "");
});

test("América Central produz referências internacionais e usa fallback internacional", () => {
  const context = fixture();
  const api = context.MinhasViagensInternationalRoadShields;
  assert.equal(api.internationalRoadRef("CA-1", auto(["GT"], "GT")), "INT:GT:CA:1");
  assert.equal(api.internationalRoadRef("NIC-2", auto(["NI"], "NI")), "INT:NI:NIC:2");
  const fallback = context.roadShieldMarkup("INT:GT:CA:1", "map");
  assert.match(fallback, /road-emblem-svg international generic map/);
  assert.match(fallback, />GUATEMALA<\/text>/);
  assert.match(fallback, />1<\/text>/);
  assert.doesNotMatch(fallback, /road-emblem-svg state/);
});

test("países com SVG próprio usam shield-base e número dinâmico", () => {
  const context = fixture();
  const cases = [
    ["INT:UY:RU:5", "ury-national-default.svg", "5", "364.2"],
    ["INT:EC:E:35", "ecu-national-default.svg", "E35", "293.8"],
    ["INT:AR:RN:293", "arg-national-default.svg", "293", "254.3"],
    ["INT:CO:RN:95", "col-national-default.svg", "95", "351.5"],
    ["INT:PE:PE:22", "per-national-default.svg", "22", "239.4"],
    ["INT:VE:T:1", "ven-national-default.svg", "1", "346.7"],
    ["INT:PY:PY:3", "pry-national-default.svg", "03", "334.1"],
    ["INT:CL:CH:5", "chl-national-default.svg", "5", "383.7"]
  ];
  for (const [label, asset, number, fontSize] of cases) {
    const markup = context.roadShieldMarkup(label, "map");
    assert.match(markup, new RegExp(asset.replace(".", "\\.")));
    assert.match(markup, /#shield-base/);
    assert.match(markup, new RegExp(`font-size="${fontSize}"`));
    assert.match(markup, new RegExp(`>${number}<\\/text>`));
  }
});

test("Chile usa exatamente o último SVG enviado", () => {
  const chile = fs.readFileSync("assets/road-shields/chl-national-default.svg", "utf8");
  assert.match(chile, /viewBox="0 0 949\.2581 867\.6"/);
  assert.match(chile, /rect x="151\.7435" y="245\.7459" width="612\.9412" height="383\.698"/);
  assert.match(chile, /id="shield-base"/);
  assert.match(chile, /id="road-number-sample"/);
  assert.doesNotMatch(chile, /I REGI[ÓO]N/i);
});

test("v0.14.5 carrega escudos antes da reconstrução das rodovias", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.match(auth, /APP_VERSION=window\.MINHAS_VIAGENS_APP_VERSION\|\|"0\.14\.5"/);
  assert.ok(auth.indexOf('"international-road-shields.js"') > auth.indexOf('"secondary-roads-hotfix.js"'));
  assert.ok(auth.indexOf('"international-road-shields.js"') < auth.indexOf('"road-marker-hotfix.js"'));
  const marker = fs.readFileSync("road-marker-hotfix.js", "utf8");
  assert.match(marker, /road-badges-v6-north-america-country-context/);
});
