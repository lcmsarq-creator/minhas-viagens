const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Outras rotas intercepta o clique e abre geometria integral hospedada", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /MinhasViagensIconicRouteCatalog/);
  assert.match(source, /iconicOtherList\.contains\(card\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /showPreparedCatalogRoute\(route, ready, card\)/);
  assert.match(source, /map\.fitBounds\(bounds\.pad\(\.08\), \{ maxZoom: 13, animate: false \}\)/);
});

test("preview não consulta mais geometryPath detalhado no clique", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /hostedCatalog\.entryFor\(route\.id\)/);
  assert.match(source, /hostedCatalog\.loadRoute\(route\.id\)/);
  assert.doesNotMatch(source, /route\.geometryPath/);
  assert.doesNotMatch(source, /corridorCoverage/);
});

test("Minhas rotas continua entregue ao comportamento original", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /if \(!els\.iconicOtherList\.contains\(card\)\) \{/);
  assert.match(source, /activeSelection = null;/);
});

test("shell aguarda o bundle hospedado antes de iniciar as rotas icônicas", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  const iconic = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(auth, /iconic-route-catalog\.js/);
  assert.match(auth, /MinhasViagensIconicRouteCatalogReady/);
  assert.match(auth, /loading-iconic-catalog/);
  assert.match(auth, /MINHAS_VIAGENS_APP_VERSION\|\|"0\.13\.16"/);
  assert.match(index, /MINHAS_VIAGENS_APP_VERSION = "0\.13\.16"/);
  assert.match(iconic, /APP_VERSION = "0\.13\.16"/);
});
