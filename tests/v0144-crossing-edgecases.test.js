const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const core = require("../crossing-detection-core.js");

test("homônimos no mesmo país sem UF não colapsam quando estão longe", () => {
  const a = { city:"Santa Maria", countryCode:"BR", lat:-29.69, lng:-53.81 };
  const b = { city:"Santa Maria", countryCode:"BR", lat:-16.01, lng:-48.01 };
  assert.equal(core.sameCity(a,b), false);
  assert.equal(core.uniqueCities([a,b]).length, 2);
});

test("admin level 9 não é tratado como município confiável", () => {
  const relation = {
    type:"relation", id:9,
    tags:{name:"Distrito",boundary:"administrative",admin_level:"9"},
    members:[{role:"outer",geometry:[{lat:-20,lon:-46},{lat:-20,lon:-45.9},{lat:-19.9,lon:-45.9},{lat:-20,lon:-46}]}]
  };
  assert.equal(core.administrativeBoundaryReliable(relation), false);
});

test("auth carrega core e correção depois da camada v0142", () => {
  const source = fs.readFileSync("auth.js","utf8");
  const oldIndex = source.indexOf('"v0142-adjustments.js"');
  const coreIndex = source.indexOf('"crossing-detection-core.js"');
  const fixIndex = source.indexOf('"v0144-crossing-fix.js"');
  assert.ok(oldIndex >= 0 && coreIndex > oldIndex && fixIndex > coreIndex);
});
