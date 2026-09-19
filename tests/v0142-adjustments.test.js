const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseRoadCode(label) {
  const value = String(label || "").toUpperCase();
  let m = value.match(/^INT:([A-Z]{2}):([A-Z]+):(\d+[A-Z]?)$/);
  if (m) return { international: true, countryCode: m[1], prefix: m[2], number: m[3] };
  m = value.match(/^BR-(\d+[A-Z]?)$/);
  if (m) return { federal: true, prefix: "BR", number: m[1] };
  m = value.match(/^([A-Z]{2,3})-(\d+[A-Z]?)$/);
  if (m) return { federal: false, prefix: m[1], number: m[2] };
  return null;
}

function makeLayer(markers = []) {
  return {
    markers,
    getLayers() { return this.markers; },
    removeLayer(marker) { this.markers = this.markers.filter(item => item !== marker); },
    addLayer(marker) { if (!this.markers.includes(marker)) this.markers.push(marker); }
  };
}

function fixture({ withMarker = false } = {}) {
  const panes = {};
  const viewCalls = [];
  const trip = {
    id: "trip-1",
    mode: "carro",
    roadLabels: [
      { label: "SP-425" },
      { label: "BR-153" },
      { label: "SP-310" }
    ],
    conquests: { roads: ["BR-153", "SP-310", "SP-425", "MG-050"] }
  };
  const roadButton = { dataset: { road: "SP-425" } };
  const marker = withMarker ? {
    options: {
      icon: { options: { html: '<div class="road-map-shield-wrap" data-road="SP-425">shield</div>' } }
    },
    listeners: {},
    on(type, fn) { this.listeners[type] = fn; return this; },
    setZIndexOffset(value) { this.zIndex = value; },
    getElement() { return null; }
  } : null;
  const tripLayers = makeLayer(marker ? [marker] : []);
  const editGroup = makeLayer([]);
  let isolated = null;
  let baseEditCalls = 0;

  const roadList = {
    children: [],
    querySelectorAll() { return this.children; },
    appendChild(card) {
      this.children = this.children.filter(item => item !== card);
      this.children.push(card);
      return card;
    }
  };

  const context = {
    console: { info() {}, warn() {}, error() {}, log() {} },
    window: null,
    document: {
      querySelector() { return null; },
      createElement() { return { className: "", textContent: "", innerHTML: "", insertAdjacentElement() {} }; }
    },
    state: { trips: [trip], activeTripDetailId: "trip-1", editingTripId: null },
    els: {
      roadAchievementList: roadList,
      tripDetailContent: {
        querySelector(selector) {
          if (selector === ".detail-road-list") return null;
          if (selector === ".detail-no-roads") return null;
          if (selector === ".detail-iconic-routes") return null;
          return null;
        },
        querySelectorAll(selector) {
          return selector.includes("detail-road-list") ? [roadButton] : [];
        }
      }
    },
    map: {
      getPane(name) { return panes[name] || null; },
      createPane(name) { panes[name] = { style: {} }; return panes[name]; },
      getCenter() { return { lat: -20.1, lng: -46.2 }; },
      getZoom() { return 9; },
      setView(center, zoom, options) { viewCalls.push({ center, zoom, options }); }
    },
    L: { DomEvent: { stopPropagation() {} } },
    tripLayers,
    editGroup,
    normalizeSimple: normalize,
    normalizeKey: normalize,
    parseRoadCode,
    cleanRoadRef: value => String(value || "").trim(),
    isHighwayRef: value => Boolean(parseRoadCode(value)),
    extractRoadLabelsFromRoute: () => [],
    extractHighwaysFromRoute: () => [],
    cityConquestsForTrip: () => [],
    renderAchievements() {},
    renderTrips() {},
    renderTripDetail() {},
    beginRouteEdit() { baseEditCalls += 1; context.map.setView({ lat: 0, lng: 0 }, 3, {}); },
    createEditLayers() {},
    saveTrips() {},
    tripLatLngs: trip => trip.__line || [],
    showTripRoadSegment(tripArg, label, button) { isolated = { trip: tripArg, label, button }; },
    setTimeout() { return 1; },
    clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ elements: [] }) }),
    AbortController: global.AbortController
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0142-adjustments.js", "utf8"), context);
  return {
    context, panes, marker, trip, roadList, viewCalls,
    isolated: () => isolated,
    baseEditCalls: () => baseEditCalls
  };
}

test("loader 0.14.5 carrega a camada de ajustes por último", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  assert.match(auth, /APP_VERSION=window\.MINHAS_VIAGENS_APP_VERSION\|\|"0\.14\.5"/);
  assert.ok(auth.indexOf('"v0142-adjustments.js"') > auth.indexOf('"iconic-catalog-preview-hotfix.js"'));
  assert.match(index, /MINHAS_VIAGENS_APP_VERSION = "0\.14\.5"/);
});

test("rodovias de uma viagem preservam a sequência das placas ao longo do trajeto", () => {
  const { context, trip } = fixture();
  assert.deepEqual(
    Array.from(context.MinhasViagensV0142.orderedRoadsForTrip(trip)),
    ["SP-425", "BR-153", "SP-310", "MG-050"]
  );
});

test("conquistas rodoviárias agrupam BRs, estaduais por volume do estado e internacionais por último", () => {
  const { context, roadList } = fixture();
  const labels = ["INT:AR:RN:40", "MG-050", "SP-330", "BR-153", "ERS-235", "SP-425", "BR-040", "SP-270"];
  roadList.children = labels.map(label => ({ dataset: { road: label } }));
  context.MinhasViagensV0142.sortRoadAchievementCards();
  assert.deepEqual(
    roadList.children.map(card => card.dataset.road),
    ["BR-040", "BR-153", "SP-270", "SP-330", "SP-425", "MG-050", "ERS-235", "INT:AR:RN:40"]
  );
});


test("rodovias internacionais respeitam a ordem real da primeira conquista", () => {
  const { context, roadList } = fixture();
  const older = {
    id: "trip-old",
    roadLabels: [{ label: "INT:UY:RU:5" }],
    conquests: { roads: ["INT:UY:RU:5"] }
  };
  const newer = {
    id: "trip-new",
    roadLabels: [{ label: "INT:AR:RN:40" }],
    conquests: { roads: ["INT:AR:RN:40"] }
  };
  // Novas viagens são inseridas no início de state.trips.
  context.state.trips = [newer, older];
  roadList.children = ["INT:AR:RN:40", "INT:UY:RU:5"].map(label => ({ dataset: { road: label } }));
  context.MinhasViagensV0142.sortRoadAchievementCards();
  assert.deepEqual(
    roadList.children.map(card => card.dataset.road),
    ["INT:UY:RU:5", "INT:AR:RN:40"]
  );
});

test("placa do mapa usa pane acima do trajeto e isola sua rodovia ao clicar", () => {
  const { context, panes, marker, isolated } = fixture({ withMarker: true });
  assert.equal(panes.roadShields.style.zIndex, "690");
  assert.equal(marker.options.pane, "roadShields");
  assert.equal(marker.options.interactive, true);
  assert.equal(marker.zIndex, 1000);
  marker.listeners.click?.({});
  assert.equal(isolated().trip.id, "trip-1");
  assert.equal(isolated().label, "SP-425");
  assert.equal(isolated().button.dataset.road, "SP-425");
  assert.equal(context.state.activeTripDetailId, "trip-1");
});

test("ajustar rota restaura centro e zoom que estavam ativos", () => {
  const { context, viewCalls, baseEditCalls } = fixture();
  context.beginRouteEdit({ id: "trip-1" });
  assert.equal(baseEditCalls(), 1);
  assert.equal(viewCalls.length, 2);
  assert.deepEqual(viewCalls.at(-1).center, { lat: -20.1, lng: -46.2 });
  assert.equal(viewCalls.at(-1).zoom, 9);
  assert.equal(viewCalls.at(-1).options.animate, false);
});

test("cruzamento de perímetro urbano é detectado por interseção da linha com o polígono", () => {
  const { context } = fixture();
  const api = context.MinhasViagensV0142;
  const polygon = [[-20.1, -46.1], [-19.9, -46.1], [-19.9, -45.9], [-20.1, -45.9]];
  assert.equal(api.lineIntersectsPolygon([[-20, -46.3], [-20, -45.7]], polygon), true);
  assert.equal(api.lineIntersectsPolygon([[-20.4, -46.3], [-20.4, -45.7]], polygon), false);
  assert.equal(api.routeCrossesPlace([[-20, -46.3], [-20, -45.7]], { geometry: polygon.map(([lat, lon]) => ({ lat, lon })), tags: { place: "town" } }), true);
});

test("aba de rotas icônicas deixa de baixar e calcular todas as geometrias no startup", () => {
  const catalogSource = fs.readFileSync("iconic-route-catalog.js", "utf8");
  const routesSource = fs.readFileSync("iconic-routes.js", "utf8");
  const previewSource = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(catalogSource, /const ready = Promise\.resolve\(true\)/);
  assert.doesNotMatch(catalogSource, /const ready = loadBundle\(\)/);
  assert.match(catalogSource, /loadManifest\(\)\.catch\(\(\) => null\)/);
  assert.match(routesSource, /candidateRoutesForTrips/);
  assert.match(routesSource, /mapWithConcurrency/);
  assert.match(previewSource, /hostedCatalog\.loadManifest\?\.\(\)/);
  assert.doesNotMatch(previewSource, /iconicOtherTabBtn[\s\S]{0,180}hostedCatalog\.loadBundle\(\)/);
});

test("cartões de rotas icônicas oferecem abertura da geometria real no Google Maps", () => {
  const source = fs.readFileSync("iconic-routes.js", "utf8");
  const preview = fs.readFileSync("iconic-catalog-preview-hotfix.js", "utf8");
  assert.match(source, /data-iconic-google-maps="true"/);
  assert.match(source, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  assert.match(source, /travelmode=driving/);
  assert.match(preview, /googleMapsDirectionsUrl/);
  assert.match(preview, /hostedCatalog\.loadRoute\(route\.id\)/);
  assert.match(preview, /window\.open\("about:blank", "_blank"\)/);
  assert.match(preview, /popup\.location\.href = url/);
});
