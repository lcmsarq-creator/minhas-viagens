const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

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
  assert.match(source, /appMap\.fitBounds\(bounds\.pad\(\.08\), \{ maxZoom: 13, animate: false \}\)/);
});

test("hotfix usa os bindings globais lexicais reais de script.js", () => {
  const appSource = fs.readFileSync("script.js", "utf8");
  const previewSource = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(appSource, /const state = \{/);
  assert.match(appSource, /const map = L\.map/);
  assert.match(appSource, /const els = \{/);
  assert.match(previewSource, /typeof map !== "undefined" \? map : null/);
  assert.match(previewSource, /typeof state !== "undefined" \? state : null/);
  assert.match(previewSource, /typeof els !== "undefined" \? els : null/);
  assert.doesNotMatch(previewSource, /!window\.map/);
  assert.doesNotMatch(previewSource, /window\.state\?\.iconicPreviewLayer/);
  assert.doesNotMatch(previewSource, /window\.els\?\.iconicOtherList/);
  assert.match(previewSource, /runtimeScope: "global-lexical-bindings"/);
});

test("hotfix realmente instala quando map state e els são const globais, mas não propriedades de window", () => {
  const source = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  const list = {
    children: [{}],
    querySelector() { return {}; },
    appendChild() {},
    innerHTML: ""
  };
  const context = {
    console,
    setTimeout() { throw new Error("waitForApp não deveria repetir quando os bindings lexicais existem"); },
    globalMap: { fitBounds() {} },
    globalState: {
      iconicPreviewLayer: { clearLayers() {} },
      iconicRouteLayer: { getLayers() { return []; } }
    },
    globalEls: {
      iconicOtherList: list,
      iconicOtherTabBtn: { addEventListener() {} }
    },
    document: {
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return {}; }
    }
  };
  context.window = context;
  context.window.L = {
    polyline() { return { addTo() {} }; },
    latLngBounds() { return { isValid() { return true; }, pad() { return this; } }; }
  };
  context.window.MinhasViagensIconicRoutes = { routes: [{ id: "demo" }], clearPreview() {} };
  context.window.MinhasViagensIconicCatalog = { routes: [{ id: "demo", name: "Demo", category: "Teste", region: "Teste" }] };
  context.window.MinhasViagensIconicRouteCatalog = {
    entryFor() { return { lines: [[[0, 0], [1, 1]]], alternateLines: [], bounds: [[0, 0], [1, 1]] }; },
    async loadRoute() { return null; },
    async loadBundle() { return true; },
    has() { return true; },
    decodedCount() { return 1; },
    stats: {}
  };

  vm.createContext(context);
  vm.runInContext("const map = globalMap; const state = globalState; const els = globalEls;", context);
  assert.equal(context.window.map, undefined);
  assert.equal(context.window.state, undefined);
  assert.equal(context.window.els, undefined);
  vm.runInContext(source, context);
  assert.equal(context.window.MinhasViagensIconicCatalogPreviewV2?.installed, true);
  assert.equal(context.window.MinhasViagensIconicCatalogPreviewV2?.runtimeScope, "global-lexical-bindings");
});
