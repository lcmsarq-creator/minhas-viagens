const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("qualquer cartão de rota icônica abre a geometria integral hospedada", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /MinhasViagensIconicRouteCatalog/);
  assert.match(source, /\.iconic-route-card\[data-iconic-route\]/);
  assert.doesNotMatch(source, /iconicOtherList\.contains\(card\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /showFullCatalogRoute\(route, card\)/);
  assert.match(source, /allCardsUseFullGeometry: true/);
});

test("Outras rotas é montada imediatamente sem aguardar cálculo detalhado de progresso", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /function renderFastCatalog\(\)/);
  assert.match(source, /for \(const route of catalog\.routes\)/);
  assert.match(source, /Trajeto completo pronto/);
  assert.match(source, /renderFastCatalog\(\);/);
  assert.doesNotMatch(source, /routeResults\(\)/);
  assert.doesNotMatch(source, /corridorCoverage/);
});

test("preview usa apenas catálogo hospedado e não consulta geometryPath no clique", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /hostedCatalog\.entryFor\(route\.id\)/);
  assert.match(source, /hostedCatalog\.loadRoute\(route\.id\)/);
  assert.doesNotMatch(source, /route\.geometryPath/);
});

test("trajeto completo faz fitBounds sem animação após o toque", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /paintFullGeometry\(geometry\)/);
  assert.match(source, /map\.fitBounds\(bounds\.pad\(\.08\), \{ maxZoom: 13, animate: false \}\)/);
});
