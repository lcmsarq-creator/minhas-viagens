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

test("o F4 usa o desenho e o algarismo vetorial enviados, com recorte de segurança", () => {
  const context = fixture();
  const markup = context.roadShieldMarkup("INT:BO:F:4", "map");

  assert.match(markup, /bol-national-default\.svg\?v=0\.13\.5#shield-base/);
  assert.match(markup, /bol-national-default\.svg\?v=0\.13\.5#road-glyph-4/);
  assert.match(markup, /clipPath/);
  assert.doesNotMatch(markup, /<text\b/);
  assert.equal(context.roadShieldMarkup("INT:AR:RN:4", "map"), "base-shield:INT:AR:RN:4:map");
});

test("o template preserva viewBox, área segura invisível e IDs estáveis", () => {
  const svg = fs.readFileSync("assets/road-shields/bol-national-default.svg", "utf8");
  assert.match(svg, /viewBox="0 0 959\.0027 868\.7791"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /id="shield-base"/);
  assert.match(svg, /id="text-safe-area" opacity="0"/);
  assert.match(svg, /id="road-glyph-4"/);
  assert.doesNotMatch(svg, /<image\b/);
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

test("o módulo internacional é carregado antes da consolidação dos marcadores", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.ok(auth.indexOf('"international-road-shields.js"') > auth.indexOf('"secondary-roads-hotfix.js"'));
  assert.ok(auth.indexOf('"international-road-shields.js"') < auth.indexOf('"road-marker-hotfix.js"'));
});

test("a página de teste usa o mesmo motor de marcadores sem persistir dados", () => {
  const html = fs.readFileSync("bolivia-f4-preview.html", "utf8");
  const script = fs.readFileSync("bolivia-f4-preview.js", "utf8");

  assert.match(html, /id="preview-map"/);
  assert.match(html, /road-marker-layout\.js\?v=0\.13\.5/);
  assert.match(html, /international-road-shields\.js\?v=0\.13\.5/);
  assert.match(script, /demo\/bolivia-f4-route\.json/);
  assert.match(script, /markersFromTimeline/);
  assert.match(script, /boliviaShieldMarkup/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|supabase|saveTrip|insert\s*\(/i);
});
