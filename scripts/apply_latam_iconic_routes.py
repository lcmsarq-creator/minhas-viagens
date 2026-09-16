#!/usr/bin/env python3
"""Idempotent release patch for the Latin-American iconic-route expansion."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP_VERSION = "0.13.13"


def ensure_once(text: str, marker: str, anchor: str, payload: str, label: str) -> str:
    if marker in text:
        return text
    if anchor not in text:
        raise SystemExit(f"Could not patch {label}: anchor not found")
    return text.replace(anchor, payload + anchor, 1)


def patch_catalog():
    path = ROOT / "iconic-routes-catalog.js"
    text = path.read_text(encoding="utf-8")

    if "emblemCountries:" not in text:
        text = text.replace(
            '    emblemKey: options.emblemKey || ""\n',
            '    emblemKey: options.emblemKey || "",\n    emblemCountries: Object.freeze(options.emblemCountries || [])\n',
            1,
        )

    panam_plain = 'family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam",'
    panam_canonical = 'family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam", emblemCountries: ["CO", "EC", "PE", "CL", "AR"],'
    if panam_plain in text:
        text = text.replace(panam_plain, panam_canonical, 1)
    text = re.sub(
        r'family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam",(?: emblemCountries: \["CO", "EC", "PE", "CL", "AR"\],)+',
        panam_canonical,
        text,
        count=1,
    )

    additions = '''    route("ruta-40-argentina", "Ruta Nacional 40", "Cênica", "Argentina — Cabo Vírgenes → La Quiaca", {
      family: "Ruta Nacional 40", long: true, roadRefs: ["INT:AR:RN:40"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/noticias/ruta-40-un-puente-al-conocimiento",
      note: "Corredor andino argentino com mais de 5.000 km, do extremo sul ao limite com a Bolívia."
    }),
    route("mexico-1-transpeninsular", "Carretera Transpeninsular — México 1", "Cênica", "México — Tijuana → Cabo San Lucas", {
      family: "Carretera Transpeninsular", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Eixo longitudinal da península da Baja California pela Carretera Federal 1."
    }),
    route("ruta-siete-lagos", "Ruta de los Siete Lagos", "Cênica", "Argentina — San Martín de los Andes → Villa La Angostura", {
      family: "Ruta de los Siete Lagos", long: true, roadRefs: ["INT:AR:RN:40"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/node/475018",
      note: "Trecho cênico da RN 40 entre os parques Lanín e Nahuel Huapi."
    }),
    route("ruta-3-fin-del-mundo", "Ruta Nacional 3 — Fin del Mundo", "Aventura", "Argentina — Buenos Aires → Bahía Lapataia", {
      family: "Ruta Nacional 3", long: true, roadRefs: ["INT:AR:RN:3"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/noticias/la-guia-turistica-de-la-ruta-nacional-3-esta-en-camino",
      note: "Corredor atlântico argentino até Ushuaia e o término da RN 3 em Bahía Lapataia; o recorte preserva a descontinuidade do Estreito de Magalhães."
    }),
    route("espinazo-del-diablo", "Espinazo del Diablo", "Serra", "México — Durango → Mazatlán", {
      family: "Espinazo del Diablo", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Trecho histórico da Federal 40 pela Sierra Madre Occidental."
    }),
    route("paso-de-jama", "Paso de Jama", "Internacional", "Argentina ↔ Chile", {
      family: "Paso de Jama", long: true, roadRefs: ["INT:AR:RN:52", "INT:CL:CH:27"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/seguridad/pasosinternacionales/detalle/ruta/19/Jama",
      note: "Travessia de alta montanha pela RN 52 e CH-27 entre Jujuy e San Pedro de Atacama."
    }),
    route("carretera-interoceanica-sur", "Carretera Interoceánica Sur", "Internacional", "Brasil ↔ Peru — Acre → Pacífico", {
      family: "Carretera Interoceánica Sur", long: true, roadRefs: ["BR-317"], previewTraveledOnly: true,
      sourceName: "PROMPERÚ", sourceUrl: "https://repositorio.promperu.gob.pe/items/0108979d-49a4-48ff-8a96-1fd3c580a3df",
      note: "Corredor Interoceânico Sul ligando o Acre a Madre de Dios e aos eixos peruanos rumo ao Pacífico."
    }),
    route("br-230-transamazonica", "BR-230 — Transamazônica", "Aventura", "Brasil — Cabedelo → Lábrea", {
      family: "Transamazônica", long: true, roadRefs: ["BR-230"],
      sourceName: "DNIT", sourceUrl: "https://www.gov.br/dnit/pt-br/assuntos/noticias/dnit-entrega-17-quilometros-revitalizados-da-br-230-aos-paraenses",
      note: "A BR-230 é a Rodovia Transamazônica; o recorte acompanha o eixo nacional de Cabedelo ao interior amazônico."
    }),
    route("paso-los-libertadores", "Paso Internacional Los Libertadores", "Internacional", "Argentina ↔ Chile — Mendoza → Santiago", {
      family: "Paso Los Libertadores", long: true, roadRefs: ["INT:AR:RN:7", "INT:CL:CH:60"], previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Clássico corredor transandino RN 7 / CH-60 entre Mendoza, Los Andes e Santiago."
    }),
    route("avenida-de-los-volcanes", "Avenida de los Volcanes — E35", "Cênica", "Equador — Quito → Cuenca", {
      family: "Avenida de los Volcanes", long: true, roadRefs: ["INT:EC:E:35"], previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Recorte cênico do corredor andino E35 entre Quito, Cotopaxi, Chimborazo e Cuenca."
    }),
    route("camino-de-los-yungas", "Camino de los Yungas — Camino de la Muerte", "Aventura", "Bolívia — La Cumbre → Yolosa", {
      family: "Camino de los Yungas", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Antiga estrada dos Yungas, descendo de La Cumbre em direção a Yolosa."
    }),
    route("ch5-atacama", "Ruta 5 — Deserto do Atacama", "Cênica", "Chile — La Serena → Arica", {
      family: "Ruta 5 Atacama", long: true, roadRefs: ["INT:CL:CH:5"], previewTraveledOnly: true,
      sourceName: "MOP Chile", sourceUrl: "https://concesiones.mop.gob.cl/project/ruta-5-tramo-caldera-antofagasta/",
      note: "Trecho da Ruta 5 / Panamericana através do Atacama, de La Serena a Arica."
    }),
'''
    anchor = '    route("br-319-manaus-porto-velho", "BR-319 — Manaus–Porto Velho", "Aventura", "AM e RO", {'
    text = ensure_once(text, 'route("ruta-40-argentina"', anchor, additions, "12 Latin-American routes")

    text = re.sub(r'version: "1\.[0-9]+\.[0-9]+"', 'version: "1.2.0"', text, count=1)
    text = re.sub(r'familyCount: \d+,', 'familyCount: 41,', text, count=1)
    path.write_text(text, encoding="utf-8")


def patch_ui():
    path = ROOT / "iconic-routes.js"
    text = path.read_text(encoding="utf-8")
    text = re.sub(r'const APP_VERSION = "[^"]+";', f'const APP_VERSION = "{APP_VERSION}";', text, count=1)

    anchor = '  const SECONDARY_OPACITY = .22;\n'
    helpers = '''  const PANAM_EMBLEMS = Object.freeze({
    CO: Object.freeze({ name: "COLÔMBIA" }),
    EC: Object.freeze({ name: "ECUADOR" }),
    PE: Object.freeze({ name: "PERU" }),
    CL: Object.freeze({ name: "CHILE" }),
    AR: Object.freeze({ name: "ARGENTINA" })
  });
  const PANAM_EMBLEM_ASSET = `assets/iconic-routes/via-panam-base.svg?v=${APP_VERSION}`;

'''
    text = ensure_once(text, 'const PANAM_EMBLEMS = Object.freeze', anchor, helpers, "Via Panam emblem registry")

    function_anchor = '  function formatKm(value) {\n'
    emblem_functions = '''  function panamEmblemMarkup(countryCode, mapMarker = false) {
    const emblem = PANAM_EMBLEMS[countryCode];
    if (!emblem) return "";
    const style = mapMarker
      ? "width:52px;height:44px;display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.28))"
      : "width:42px;height:35px;display:block";
    return `<svg viewBox="0 0 1374 1145" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(`${emblem.name}, Vía Panam`)}" style="${style}">
      <use href="${PANAM_EMBLEM_ASSET}#shield-base"></use>
      <text x="687" y="275" fill="#000" font-family="Arial, Helvetica, sans-serif" font-size="180" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(emblem.name)}</text>
    </svg>`;
  }

  function iconicEmblemsMarkup(route) {
    if (route?.emblemKey !== "via-panam") return "";
    const countries = (route.emblemCountries || []).filter(code => PANAM_EMBLEMS[code]);
    if (!countries.length) return "";
    return `<span class="iconic-emblem-strip" aria-label="Emblemas disponíveis da Via Panam" style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin-top:6px">${countries.map(code => panamEmblemMarkup(code)).join("")}</span>`;
  }

  function panamCountryForPoint(point) {
    const lat = Number(point?.[0]), lon = Number(point?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    if (lat >= .5 && lat <= 8.6 && lon >= -79.6 && lon <= -73.0) return "CO";
    if (lat < 1 && lat >= -4.7 && lon >= -81.6 && lon <= -76.5) return "EC";
    if (lat < -4.0 && lat >= -18.25 && lon >= -82.2 && lon <= -68.0) return "PE";
    if (lat < -18.2 && lat >= -33.2 && lon <= -69.5 && lon >= -72.5) return "CL";
    if (lat < -31.5 && lat >= -36.0 && lon > -70.3 && lon <= -57.0) return "AR";
    return "";
  }

  function paintPanamEmblems(result) {
    if (result.route?.emblemKey !== "via-panam" || typeof L?.marker !== "function" || typeof L?.divIcon !== "function") return;
    const segments = [...(result.alternateCoverage?.segments || []), ...(result.coverage?.segments || [])];
    const byCountry = new Map();
    for (const segment of segments) {
      for (const point of segment || []) {
        const code = panamCountryForPoint(point);
        if (code && PANAM_EMBLEMS[code]) {
          if (!byCountry.has(code)) byCountry.set(code, []);
          byCountry.get(code).push(point);
        }
      }
    }
    for (const [code, points] of byCountry) {
      const point = points[Math.floor(points.length / 2)];
      L.marker(point, {
        pane: "iconicRouteMain",
        interactive: false,
        icon: L.divIcon({
          className: "iconic-panam-marker",
          html: panamEmblemMarkup(code, true),
          iconSize: [52, 44],
          iconAnchor: [26, 22]
        })
      }).addTo(state.iconicPreviewLayer);
    }
  }

'''
    text = ensure_once(text, 'function panamEmblemMarkup(', function_anchor, emblem_functions, "Via Panam emblem renderer")

    if 'paintPanamEmblems(result);' not in text:
        old = '    paintTraveled(state.iconicPreviewLayer, result.alternateCoverage?.segments, "silver");\n    paintTraveled(state.iconicPreviewLayer, result.coverage?.segments, "gold");\n  }\n\n  function focusRoute'
        new = '    paintTraveled(state.iconicPreviewLayer, result.alternateCoverage?.segments, "silver");\n    paintTraveled(state.iconicPreviewLayer, result.coverage?.segments, "gold");\n    paintPanamEmblems(result);\n  }\n\n  function focusRoute'
        if old not in text:
            raise SystemExit("Could not connect Panam emblems to preview")
        text = text.replace(old, new, 1)

    if '${iconicEmblemsMarkup(route)}' not in text:
        old = '        <strong>${escapeHtml(route.name)}</strong>\n        <small>${escapeHtml(route.category)}'
        new = '        <strong>${escapeHtml(route.name)}</strong>\n        ${iconicEmblemsMarkup(route)}\n        <small>${escapeHtml(route.category)}'
        if old not in text:
            raise SystemExit("Could not add emblems to iconic route card")
        text = text.replace(old, new, 1)

    path.write_text(text, encoding="utf-8")


def patch_index():
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    text = text.replace("v0.13.12", f"v{APP_VERSION}")
    text = re.sub(r'(iconic-routes(?:-catalog|-core)?\.js\?v=)[^\"\']+', rf'\g<1>{APP_VERSION}', text)
    path.write_text(text, encoding="utf-8")


def patch_tests():
    route_test = ROOT / "tests" / "iconic-routes.test.js"
    text = route_test.read_text(encoding="utf-8")
    text = re.sub(r'test\("o catálogo expõe .*?", \(\) => \{', 'test("o catálogo expõe 41 famílias em 44 recortes", () => {', text, count=1)
    text = re.sub(r'assert\.equal\(catalog\.familyCount, \d+\);', 'assert.equal(catalog.familyCount, 41);', text, count=1)
    text = re.sub(r'assert\.equal\(catalog\.routeCount, \d+\);', 'assert.equal(catalog.routeCount, 44);', text, count=1)
    text = re.sub(r'assert\.equal\(new Set\(catalog\.routes\.map\(route => route\.id\)\)\.size, \d+\);', 'assert.equal(new Set(catalog.routes.map(route => route.id)).size, 44);', text, count=1)

    marker = 'test("a entrada BR-319 não é rotulada incorretamente como Transamazônica", () => {'
    added = '''test("as 12 novas rotas latino-americanas fazem parte do catálogo", () => {
  const ids = [
    "ruta-40-argentina", "mexico-1-transpeninsular", "ruta-siete-lagos", "ruta-3-fin-del-mundo",
    "espinazo-del-diablo", "paso-de-jama", "carretera-interoceanica-sur", "br-230-transamazonica",
    "paso-los-libertadores", "avenida-de-los-volcanes", "camino-de-los-yungas", "ch5-atacama"
  ];
  for (const id of ids) {
    const route = catalog.routes.find(item => item.id === id);
    assert.ok(route, `${id} deve existir`);
    assert.equal(route.long, true);
  }
  assert.equal(catalog.routes.find(item => item.id === "br-230-transamazonica").previewTraveledOnly, false);
  for (const id of ids.filter(id => id !== "br-230-transamazonica")) {
    assert.equal(catalog.routes.find(item => item.id === id).previewTraveledOnly, true, `${id} deve revelar somente o trecho viajado`);
  }
});

test("Via Panam registra inicialmente os cinco emblemas enviados", () => {
  const panam = catalog.routes.find(item => item.id === "via-panamericana");
  assert.deepEqual(Array.from(panam.emblemCountries), ["CO", "EC", "PE", "CL", "AR"]);
});

'''
    if 'as 12 novas rotas latino-americanas fazem parte do catálogo' not in text:
        if marker not in text:
            raise SystemExit("Could not extend route tests")
        text = text.replace(marker, added + marker, 1)
    route_test.write_text(text, encoding="utf-8")

    ui_test = ROOT / "tests" / "iconic-routes-ui.test.js"
    ui = ui_test.read_text(encoding="utf-8")
    ui = ui.replace("32 recortes", "44 recortes")
    ui = ui.replace("children.length !== 32", "children.length !== 44")
    ui = ui.replace("routes.length, 32", "routes.length, 44")
    ui = ui.replace("children.length, 32", "children.length, 44")
    extra = '''\n\ntest("Via Panam usa emblemas especiais por país sem revelar a rota inteira", () => {
  const source = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(source, /PANAM_EMBLEMS/);
  assert.match(source, /paintPanamEmblems/);
  assert.match(source, /via-panam-base[.]svg/);
  assert.match(source, /previewTraveledOnly === true/);
});
'''
    if 'Via Panam usa emblemas especiais por país' not in ui:
        ui += extra
    ui_test.write_text(ui, encoding="utf-8")


if __name__ == "__main__":
    patch_catalog()
    patch_ui()
    patch_index()
    patch_tests()
    print("Expanded Latin-American iconic-route catalog integrated.")
