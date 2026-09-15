const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const layout = require("../road-marker-layout.js");

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

function fixture() {
  const context = {
    console,
    internationalRoadRef(raw, countryCode) { return `base:${countryCode}:${raw}`; },
    roadShieldMarkup(label, size) { return `base-shield:${label}:${size}`; },
    parseRoadCode(label) {
      const match = String(label).match(/^INT:([A-Z]{2}):([A-Z]+):(\w+)$/);
      return match ? { international: true, countryCode: match[1], network: match[2], number: match[3] } : null;
    },
    escapeHtml(value) { return String(value); }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("international-road-shields.js", "utf8"), context);
  return context;
}

test("a Bolívia reconhece apenas referências da rede nacional F", () => {
  const context = fixture();
  const api = context.MinhasViagensInternationalRoadShields;

  assert.equal(api.boliviaRoadRef("F4", "BO"), "INT:BO:F:4");
  assert.equal(api.boliviaRoadRef("RN 4", "BO"), "INT:BO:F:4");
  assert.equal(api.boliviaRoadRef("Ruta Nacional 04", "BO"), "INT:BO:F:4");
  assert.equal(api.boliviaRoadRef("D4104", "BO"), "");
  assert.equal(api.boliviaRoadRef("F4", "AR"), "");
  assert.equal(context.internationalRoadRef("F4", "BO"), "INT:BO:F:4");
  assert.equal(context.internationalRoadRef("RN 4", "AR"), "base:AR:RN 4");
});

test("o Uruguai reconhece Ruta/Ruta Nacional/RN apenas no contexto uruguaio", () => {
  const context = fixture();
  const api = context.MinhasViagensInternationalRoadShields;

  assert.equal(api.uruguayRoadRef("Ruta 5", "UY"), "INT:UY:RU:5");
  assert.equal(api.uruguayRoadRef("Ruta Nacional 05", "UY"), "INT:UY:RU:5");
  assert.equal(api.uruguayRoadRef("RN 5", "UY"), "INT:UY:RU:5");
  assert.equal(api.uruguayRoadRef("Ruta 5", "AR"), "");
  assert.equal(context.internationalRoadRef("Ruta 5", "UY"), "INT:UY:RU:5");
});

test("rotas multinacionais inferem a rede estrangeira sem transformar RN em estado brasileiro", () => {
  const context = fixture();
  const api = context.MinhasViagensInternationalRoadShields;

  assert.equal(api.autoInternationalRoadRef("Ruta 15", "AUTO:UY,CO"), "INT:UY:RU:15");
  assert.equal(api.autoInternationalRoadRef("Ruta 9", "AUTO:UY,CO"), "INT:UY:RU:9");
  assert.equal(api.autoInternationalRoadRef("RN 14", "AUTO:UY,CO"), "INT:UY:RU:14");
  assert.equal(api.autoInternationalRoadRef("RN 119", "AUTO:AR,CO"), "INT:AR:RN:119");
  assert.equal(api.autoInternationalRoadRef("Ruta 8", { mode: "AUTO", countries: ["UY", "CO"], hint: "AR" }), "INT:AR:RN:8");
  assert.equal(api.autoInternationalRoadRef("PE-1N", "AUTO:UY,PE,CO"), "INT:PE:PE:1N");
  assert.equal(api.autoInternationalRoadRef("F4", "AUTO:AR,BO,CO"), "INT:BO:F:4");
  assert.equal(api.autoInternationalRoadRef("RN 14", "AUTO:BR,AR"), "");
  assert.equal(context.internationalRoadRef("Ruta Nacional 5", "AUTO:UY,CO"), "INT:UY:RU:5");
  assert.equal(context.internationalRoadRef("RN 14", "AUTO:AR,CO"), "INT:AR:RN:14");
});

test("F4 e Ruta 5 usam os templates vetoriais dos respectivos países", () => {
  const context = fixture();
  const bolivia = context.roadShieldMarkup("INT:BO:F:4", "map");
  const uruguay = context.roadShieldMarkup("INT:UY:RU:5", "map");

  assert.match(bolivia, /bol-national-default\.svg\?v=0\.13\.7#shield-base/);
  assert.match(bolivia, /bol-national-default\.svg\?v=0\.13\.7#road-glyph-4/);
  assert.match(uruguay, /ury-national-default\.svg\?v=0\.13\.7#shield-base/);
  assert.match(uruguay, /ury-national-default\.svg\?v=0\.13\.7#road-glyph-5/);
  assert.match(uruguay, /class="road-emblem-svg international uruguay map"/);
  assert.doesNotMatch(uruguay, /<text\b/);
  assert.equal(context.roadShieldMarkup("INT:AR:RN:5", "map"), "base-shield:INT:AR:RN:5:map");
});

test("os templates preservam viewBox, área segura invisível e IDs estáveis", () => {
  const bolivia = fs.readFileSync("assets/road-shields/bol-national-default.svg", "utf8");
  const uruguay = fs.readFileSync("assets/road-shields/ury-national-default.svg", "utf8");

  assert.match(bolivia, /viewBox="0 0 959\.0027 868\.7791"/);
  assert.match(bolivia, /id="road-glyph-4"/);
  assert.match(uruguay, /viewBox="0 0 694\.3001 868\.7791"/);
  assert.match(uruguay, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(uruguay, /id="shield-base"/);
  assert.match(uruguay, /id="text-safe-area" opacity="0"/);
  assert.match(uruguay, /id="road-glyph-5"/);
  assert.doesNotMatch(uruguay, /<image\b/);
});

test("a demonstração Cochabamba–Villa Tunari produz um único escudo F4", () => {
  const context = fixture();
  const demo = JSON.parse(fs.readFileSync("demo/bolivia-f4-route.json", "utf8"));
  const timeline = demo.segments.map(segment => ({
    label: context.MinhasViagensInternationalRoadShields.boliviaRoadRef(segment.ref, demo.countryCode),
    line: decodePolyline(segment.encodedPolyline, demo.precision)
  }));
  const markers = layout.markersFromTimeline(timeline, { normalizeLabel: value => String(value).toLowerCase() });

  assert.equal(demo.roadRef, "F4");
  assert.ok(demo.distanceKm > 150);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, "INT:BO:F:4");
  assert.ok(markers[0].distanceKm > 150);
});

test("a demonstração uruguaia referencia a relação OSM da Ruta 5 e produz um único escudo", () => {
  const context = fixture();
  const demo = JSON.parse(fs.readFileSync("demo/uruguay-ruta5-route.json", "utf8"));
  const timeline = demo.segments.map(segment => ({
    label: context.MinhasViagensInternationalRoadShields.uruguayRoadRef(segment.ref, demo.countryCode),
    line: decodePolyline(segment.encodedPolyline, demo.precision)
  }));
  const markers = layout.markersFromTimeline(timeline, { normalizeLabel: value => String(value).toLowerCase() });

  assert.equal(demo.osmRelationId, 2626183);
  assert.equal(demo.canonicalRoadId, "INT:UY:RU:5");
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, "INT:UY:RU:5");
  assert.ok(markers[0].distanceKm > 20);
});

test("o módulo internacional é carregado antes da consolidação dos marcadores", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.match(auth, /const APP_VERSION = "0\.13\.7"/);
  assert.ok(auth.indexOf('"international-road-shields.js"') > auth.indexOf('"secondary-roads-hotfix.js"'));
  assert.ok(auth.indexOf('"international-road-shields.js"') < auth.indexOf('"road-marker-hotfix.js"'));
});

test("as páginas de teste usam o mesmo motor sem persistir dados", () => {
  for (const fixtureName of ["bolivia-f4", "uruguay-ruta5"]) {
    const html = fs.readFileSync(`${fixtureName}-preview.html`, "utf8");
    const script = fs.readFileSync(`${fixtureName}-preview.js`, "utf8");
    assert.match(html, /road-marker-layout\.js\?v=0\.13\.7/);
    assert.match(html, /international-road-shields\.js\?v=0\.13\.7/);
    assert.match(script, /markersFromTimeline/);
    assert.doesNotMatch(script, /localStorage|sessionStorage|supabase|saveTrip|insert\s*\(/i);
  }
});
