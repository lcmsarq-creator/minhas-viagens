const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Outras rotas intercepta o clique e abre geometria integral", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /iconicOtherList\.contains\(card\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /paintFullGeometry\(geometry\)/);
  assert.match(source, /map\.fitBounds\(bounds\.pad\(\.08\)/);
});

test("preview integral usa geometria leve sem alterar a base de progresso", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /MAX_PREVIEW_POINTS = 4500/);
  assert.match(source, /function previewLine\(line\)/);
  assert.match(source, /sourceLines\.map\(previewLine\)/);
  assert.doesNotMatch(source, /corridorCoverage/);
});

test("abrir Outras rotas pré-carrega as geometrias", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /function preloadOtherGeometries\(\)/);
  assert.match(source, /iconicOtherTabBtn\?\.addEventListener\("click"/);
});

test("Minhas rotas continua entregue ao comportamento original", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /if \(!els\.iconicOtherList\.contains\(card\)\) \{/);
  assert.match(source, /activeSelection = null;/);
});

test("shell carrega a camada de catálogo na versão 0.13.14", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  const iconic = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(auth, /iconic-catalog-preview-hotfix\.js/);
  assert.match(auth, /MINHAS_VIAGENS_APP_VERSION\|\|"0\.13\.14"/);
  assert.match(index, /MINHAS_VIAGENS_APP_VERSION = "0\.13\.14"/);
  assert.match(iconic, /APP_VERSION = "0\.13\.14"/);
});
