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
  assert.equal(api.autoInternationalRoadRef("Ruta Nacional 5", "AUTO:UY,CO"), "INT:UY:RU:5");
  assert.equal(api.autoInternationalRoadRef("RN 119", "AUTO:AR,CO"), "INT:AR:RN:119");
  assert.equal(api.autoInternationalRoadRef("Ruta 8", { mode: "AUTO", countries: ["UY", "CO"], hint: "AR" }), "INT:AR:RN:8");
  assert.equal(api.autoInternationalRoadRef("PE-1N", "AUTO:UY,PE,CO"), "INT:PE:PE:1N");
  assert.equal(api.autoInternationalRoadRef("F4", "AUTO:AR,BO,CO"), "INT:BO:F:4");
  assert.equal(api.autoInternationalRoadRef("RN 14", "AUTO:BR,AR"), "");
  assert.equal(context.internationalRoadRef("RN 14", "AUTO:UY,CO"), "INT:UY:RU:14");
});

test("o F4 usa o desenho e o algarismo vetorial enviados, com recorte de segurança", () => {
  const context = fixture();
  const markup = context.roadShieldMarkup("INT:BO:F:4", "map");

  assert.match(markup, /bol-national-default\.svg\?v=0\.13\.6#shield-base/);
  assert.match(markup, /bol-national-default\.svg\?v=0\.13\.6#road-glyph-4/);
  assert.match(markup, /clipPath/);
  assert.doesNotMatch(markup, /<text\b/);
  assert.equal(context.roadShieldMarkup("INT:AR:RN:4", "map"), "base-shield:INT:AR:RN:4:map");
});

test("a Ruta 5 usa o escudo e o algarismo vetorial enviados para o Uruguai", () => {
  const context = fixture();
  const markup = context.roadShieldMarkup("INT:UY:RU:5", "map");

  assert.match(markup, /ury-national-default\.svg\?v=0\.13\.6#shield-base/);
  assert.match(markup, /ury-national-default\.svg\?v=0\.13\.6#road-glyph-5/);
  assert.match(markup, /clipPath/);
  assert.doesNotMatch(markup, /<text\b/);
});

test("os templates preservam viewBox, área segura invisível e IDs estáveis", () => {
  const bolivia = fs.readFileSync("assets/road-shields/bol-national-default.svg", "utf8");
  assert.match(bolivia, /viewBox="0 0 959\.0027 868\.7791"/);
  assert.match(bolivia, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(bolivia, /id="shield-base"/);
  assert.match(bolivia, /id="text-safe-area" opacity="0"/);
  assert.match(bolivia, /id="road-glyph-4"/);
  assert.doesNotMatch(bolivia, /<image\b/);

  const uruguay = fs.readFileSync("assets/road-shields/ury-national-default.svg", "utf8");
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
  assert.ok(markers[0].lat < -16 && markers[0].lat > -18);
  assert.ok(markers[0].lng < -65 && markers[0].lng > -67);
});

test("a demonstração Progreso–Florida produz um único escudo Ruta 5", () => {
  const context = fixture();
  const demo = JSON.parse(fs.readFileSync("demo/uruguay-ruta5-route.json", "utf8"));
  const timeline = demo.segments.map(segment => ({
    label: context.MinhasViagensInternationalRoadShields.uruguayRoadRef(segment.ref, demo.countryCode),
    line: decodePolyline(segment.encodedPolyline, demo.precision)
  }));
  const markers = layout.markersFromTimeline(timeline, { normalizeLabel: value => String(value).toLowerCase() });

  assert.equal(demo.roadRef, "Ruta 5");
  assert.equal(demo.osmRelationId, 2626183);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].label, "INT:UY:RU:5");
  assert.ok(markers[0].distanceKm > 60);
  assert.ok(markers[0].lat < -34 && markers[0].lat > -35);
  assert.ok(markers[0].lng < -56 && markers[0].lng > -57);
});

test("o módulo internacional é carregado antes da consolidação dos marcadores", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.ok(auth.indexOf('"international-road-shields.js"') > auth.indexOf('"secondary-roads-hotfix.js"'));
  assert.ok(auth.indexOf('"international-road-shields.js"') < auth.indexOf('"road-marker-hotfix.js"'));
});

test("as páginas de teste usam o mesmo motor de marcadores sem persistir dados", () => {
  const boliviaHtml = fs.readFileSync("bolivia-f4-preview.html", "utf8");
  const boliviaScript = fs.readFileSync("bolivia-f4-preview.js", "utf8");
  const uruguayHtml = fs.readFileSync("uruguay-ruta5-preview.html", "utf8");
  const uruguayScript = fs.readFileSync("uruguay-ruta5-preview.js", "utf8");

  assert.match(boliviaHtml, /id="preview-map"/);
  assert.match(boliviaHtml, /road-marker-layout\.js\?v=0\.13\.6/);
  assert.match(boliviaHtml, /international-road-shields\.js\?v=0\.13\.6/);
  assert.match(boliviaScript, /demo\/bolivia-f4-route\.json/);
  assert.match(boliviaScript, /markersFromTimeline/);
  assert.match(boliviaScript, /boliviaShieldMarkup/);
  assert.doesNotMatch(boliviaScript, /localStorage|sessionStorage|supabase|saveTrip|insert\s*\(/i);

  assert.match(uruguayHtml, /id="preview-map"/);
  assert.match(uruguayHtml, /international-road-shields\.js\?v=0\.13\.6/);
  assert.match(uruguayScript, /demo\/uruguay-ruta5-route\.json/);
  assert.match(uruguayScript, /markersFromTimeline/);
  assert.match(uruguayScript, /uruguayShieldMarkup/);
  assert.doesNotMatch(uruguayScript, /localStorage|sessionStorage|supabase|saveTrip|insert\s*\(/i);
});
