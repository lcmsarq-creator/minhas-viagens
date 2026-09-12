const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("achievements.js", "utf8"), context);

const api = context.MinhasViagensAchievements;
assert.ok(api, "achievement grouping API should be available");
for (const state of api.states) assert.ok(fs.existsSync(state.flagUrl), `missing flag for ${state.uf}`);
assert.equal(api.stateFromValue("São Paulo").uf, "SP");
assert.equal(api.stateFromValue("BR-MG").name, "Minas Gerais");
assert.equal(api.stateFromValue("State of Rio de Janeiro").uf, "RJ");
assert.equal(api.stateFromValue("Presidente Venceslau, SP, Brasil").uf, "SP");
assert.equal(api.stateFromValue("Campo Grande, Mato Grosso do Sul, Brasil").uf, "MS");
assert.equal(api.stateFromValue("São Paulo").flagUrl, "assets/flags/states/sp.svg");

const groups = api.groupCities([
  { city: "Campinas", region: "São Paulo", countryCode: "BR" },
  { city: "Uberaba", region: "MG", country: "Brasil" },
  { city: "São Paulo", region: "BR-SP", countryCode: "BR" },
  { city: "Montevidéu", region: "Montevideo", countryCode: "UY", country: "Uruguai" },
  { city: "Colônia", region: "Colonia", countryCode: "URY", country: "Uruguay" },
  { city: "Buenos Aires", region: "Buenos Aires", countryCode: "AR", country: "Argentina" }
]);

assert.deepEqual(Array.from(groups, group => group.key), ["BR-MG", "BR-SP", "COUNTRY-AR", "COUNTRY-UY"]);
assert.equal(groups[1].cities.length, 2);
assert.equal(groups[2].name, "Argentina");
assert.equal(groups[3].name, "Uruguai");
assert.equal(groups[3].cities.length, 2);
assert.equal(groups[3].flagUrl, "assets/flags/countries/uy.svg");
assert.ok(fs.existsSync(groups[2].flagUrl), "missing Argentina flag");
assert.ok(fs.existsSync(groups[3].flagUrl), "missing Uruguay flag");
console.log("achievement grouping tests passed");
