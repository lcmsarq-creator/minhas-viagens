const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const core = require("../iconic-routes-core.js");
const catalog = require("../iconic-routes-catalog.js");
const progress = require("../road-progress-core.js");

function decodePolyline(encoded, precision = 5) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.textContent = "";
    this._innerHTML = "";
  }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this[name] = value; }
  querySelector() { return null; }
  click() { this.listeners.click?.(); }
}

function fixture() {
  const panes = {};
  const layer = () => ({
    layers: [],
    addTo() { return this; },
    clearLayers() { this.layers = []; },
    getLayers() { return this.layers; }
  });
  const els = {
    iconicAchievementList: new FakeElement(),
    iconicOtherList: new FakeElement(),
    iconicMineTabBtn: new FakeElement(),
    iconicOtherTabBtn: new FakeElement(),
    iconicAchievementCount: new FakeElement()
  };
  const context = {
    console,
    MinhasViagensIconicCore: core,
    MinhasViagensIconicCatalog: catalog,
    MinhasViagensRoadProgress: progress,
    MinhasViagensGeometryCompact: { decodePolyline },
    state: { trips: [], activeTripDetailId: null, achievementView: "cities", tripRoadLayer: null, highwayLayer: null },
    els,
    map: {
      getPane: name => panes[name] || null,
      createPane(name) { panes[name] = { style: {} }; return panes[name]; },
      fitBounds() {}
    },
    L: {
      layerGroup: layer,
      polyline(_line, options) {
        return {
          options: { ...options },
          addTo(target) { target.layers.push(this); return this; },
          setStyle(next) { Object.assign(this.options, next); return this; }
        };
      },
      latLngBounds() { return { pad() { return this; } }; }
    },
    document: {
      createElement: () => new FakeElement(),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    fetch: async url => {
      const filename = String(url).split("?")[0];
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(filename, "utf8")) };
    },
    requestAnimationFrame: callback => { callback(); return 1; },
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    lineLengthKm: line => line.slice(1).reduce((sum, point, index) => sum + progress.haversineKm(line[index], point), 0),
    tripLatLngs: () => [],
    escapeHtml: value => String(value),
    closeFullHighway() {},
    closeTripRoadHighlight() {},
    setTripsSecondary() {},
    showFullHighway() {},
    overpassRoadDescriptor() {},
    cachedHighway: async () => null,
    highwayProgress: async () => ({ percent: 0 }),
    roadDisplayLabel: value => value
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("iconic-routes.js", "utf8"), context);
  return { context, els };
}

test("a interface carrega os 86 recortes em Outras rotas quando não há viagens", async () => {
  const { context, els } = fixture();
  for (let attempt = 0; attempt < 100 && els.iconicOtherList.children.length !== 86; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(context.MinhasViagensIconicRoutes.routes.length, 86);
  assert.equal(els.iconicOtherList.children.length, 86);
  assert.equal(els.iconicAchievementCount.textContent, "0");
  els.iconicOtherTabBtn.click();
  assert.equal(els.iconicOtherList.classList.contains("hidden"), false);
  assert.equal(els.iconicAchievementList.classList.contains("hidden"), true);
});


test("ao focar uma rota icônica, as demais ficam em meio-tom e voltam ao normal ao fechar", async () => {
  const { context, els } = fixture();
  for (let attempt = 0; attempt < 100 && els.iconicOtherList.children.length !== 86; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  const backgroundRoute = context.L.polyline([[0, 0], [1, 1]], { opacity: .94 })
    .addTo(context.state.iconicRouteLayer);

  els.iconicOtherList.children[0].click();
  assert.equal(backgroundRoute.options.opacity, .22);

  context.MinhasViagensIconicRoutes.clearPreview();
  assert.equal(backgroundRoute.options.opacity, .94);
});


test("rotas internacionais marcadas não revelam a geometria integral no preview", () => {
  const source = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(source, /previewTraveledOnly === true/);
  assert.match(source, /const traveledLines = \[\.\.\.\(result\.alternateCoverage\?\.segments \|\| \[\]\), \.\.\.\(result\.coverage\?\.segments \|\| \[\]\)\]/);
  assert.match(source, /const focusLines = result\.route\?\.previewTraveledOnly === true/);
});


test("Via Panam usa emblemas especiais por país sem revelar a rota inteira", () => {
  const source = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(source, /PANAM_EMBLEMS/);
  assert.match(source, /paintPanamEmblems/);
  assert.match(source, /via-panam-base\.svg/);
  assert.match(source, /previewTraveledOnly === true/);
});
