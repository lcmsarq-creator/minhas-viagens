const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("hotfix de navegação das cidades cruzadas existe e é carregado pelo bootstrap", () => {
  const navigation = fs.readFileSync("crossed-city-group-navigation-hotfix.js", "utf8");
  const bootstrap = fs.readFileSync("fetch-base.js", "utf8");
  assert.match(navigation, /renderGroup\(group\.key\)/);
  assert.match(navigation, /Voltar aos estados e países/);
  assert.match(navigation, /state-achievement-card/);
  assert.match(bootstrap, /crossed-city-group-navigation-hotfix\.js/);
});
