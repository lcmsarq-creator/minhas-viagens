const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("achievements.js", "utf8"), context);

const api = context.MinhasViagensAchievements;
assert.ok(api, "achievement grouping API should be available");
assert.equal(api.stateFromValue("São Paulo").uf, "SP");
assert.equal(api.stateFromValue("BR-MG").name, "Minas Gerais");
assert.equal(api.stateFromValue("State of Rio de Janeiro").uf, "RJ");
assert.equal(api.stateFromValue("Presidente Venceslau, SP, Brasil").uf, "SP");
assert.equal(api.stateFromValue("Campo Grande, Mato Grosso do Sul, Brasil").uf, "MS");

const groups = api.groupCities([
  { city: "Campinas", region: "São Paulo", countryCode: "BR" },
  { city: "Uberaba", region: "MG", country: "Brasil" },
  { city: "São Paulo", region: "BR-SP", countryCode: "BR" },
  { city: "Montevidéu", region: "Montevideo", countryCode: "UY", country: "Uruguai" }
]);

assert.deepEqual(Array.from(groups, group => group.key), ["BR-MG", "BR-SP", "EXTERIOR"]);
assert.equal(groups[1].cities.length, 2);
assert.equal(groups[2].name, "Exterior");
console.log("achievement grouping tests passed");
