#!/usr/bin/env python3
"""Apply the Pan-American Highway and Carretera Austral to the iconic-route UI.

Kept as an idempotent release patch so the generated route data and the app catalog
are validated together on GitHub Actions before the branch is merged.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not patch {label}: expected anchor not found")
    return text.replace(old, new, 1)


def patch_catalog():
    path = ROOT / "iconic-routes-catalog.js"
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '    sourceUrl: options.sourceUrl || "https://www.openstreetmap.org/copyright",\n    note: options.note || ""\n',
        '    sourceUrl: options.sourceUrl || "https://www.openstreetmap.org/copyright",\n'
        '    note: options.note || "",\n'
        '    previewTraveledOnly: options.previewTraveledOnly === true,\n'
        '    emblemKey: options.emblemKey || ""\n',
        "catalog route options",
    )

    new_routes = '''    route("via-panamericana", "Via Panamericana", "Internacional", "México → Buenos Aires", {
      family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam",
      sourceName: "OpenStreetMap Wiki",
      sourceUrl: "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
      note: "Eixo principal latino-americano em dois trechos separados pelo Tapón del Darién. Ramais para Quellón e Ushuaia ficam fora deste recorte inicial."
    }),
    route("carretera-austral", "Carretera Austral", "Cênica", "Chile — Puerto Montt → Villa O’Higgins", {
      family: "Carretera Austral", long: true, roadRefs: ["INT:CL:CH:7"], previewTraveledOnly: true,
      sourceName: "Dirección de Vialidad · MOP Chile",
      sourceUrl: "https://vialidad.mop.gob.cl/2024/12/30/el-director-nacional-de-vialidad-del-mop-horacio-pfeiffer-firmo-la-declaratoria-que-define-a-la-carretera-austral-como-ruta-escenica/",
      note: "Ruta 7 / Longitudinal Austral; inclui as conexões marítimas que fazem parte da travessia."
    }),
'''
    anchor = '    route("br-319-manaus-porto-velho", "BR-319 — Manaus–Porto Velho", "Aventura", "AM e RO", {'
    if 'route("via-panamericana"' not in text:
        if anchor not in text:
            raise SystemExit("Could not insert international iconic routes")
        text = text.replace(anchor, new_routes + anchor, 1)

    text = text.replace('    version: "1.0.0",', '    version: "1.1.0",')
    text = text.replace('    familyCount: 27,', '    familyCount: 29,')
    path.write_text(text, encoding="utf-8")


def patch_ui():
    path = ROOT / "iconic-routes.js"
    text = path.read_text(encoding="utf-8")

    old_preview = '''  function paintRoutePreview(result) {
    state.iconicPreviewLayer?.clearLayers();
    const commonStyle = routeStyle("common");
    const silverStyle = routeStyle("silver");
    for (const line of result.geometry.lines) {
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: commonStyle.width + 4, opacity: .88 });
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: commonStyle.color, weight: commonStyle.width, opacity: .55 });
    }
    for (const line of result.geometry.alternateLines) {
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: silverStyle.width + 4, opacity: .82 });
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: silverStyle.color, weight: silverStyle.width, opacity: .65, dashArray: "7 7" });
    }
    paintTraveled(state.iconicPreviewLayer, result.alternateCoverage?.segments, "silver");
    paintTraveled(state.iconicPreviewLayer, result.coverage?.segments, "gold");
  }

  function focusRoute(result, card) {
    const points = [...result.geometry.lines, ...result.geometry.alternateLines].flat();
    if (!points.length) return;
'''
    new_preview = '''  function paintRoutePreview(result) {
    state.iconicPreviewLayer?.clearLayers();
    const commonStyle = routeStyle("common");
    const silverStyle = routeStyle("silver");
    const traveledOnly = result.route?.previewTraveledOnly === true;
    if (!traveledOnly) {
      for (const line of result.geometry.lines) {
        addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: commonStyle.width + 4, opacity: .88 });
        addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: commonStyle.color, weight: commonStyle.width, opacity: .55 });
      }
      for (const line of result.geometry.alternateLines) {
        addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: silverStyle.width + 4, opacity: .82 });
        addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: silverStyle.color, weight: silverStyle.width, opacity: .65, dashArray: "7 7" });
      }
    }
    paintTraveled(state.iconicPreviewLayer, result.alternateCoverage?.segments, "silver");
    paintTraveled(state.iconicPreviewLayer, result.coverage?.segments, "gold");
  }

  function focusRoute(result, card) {
    const traveledLines = [...(result.alternateCoverage?.segments || []), ...(result.coverage?.segments || [])];
    const focusLines = result.route?.previewTraveledOnly === true
      ? traveledLines
      : [...result.geometry.lines, ...result.geometry.alternateLines];
    const points = focusLines.flat();
    if (!points.length) return;
'''
    text = replace_once(text, old_preview, new_preview, "traveled-only iconic preview")
    path.write_text(text, encoding="utf-8")


def patch_tests():
    route_test = ROOT / "tests" / "iconic-routes.test.js"
    text = route_test.read_text(encoding="utf-8")
    text = text.replace('test("o catálogo expõe as 27 rotas pedidas em 30 recortes", () => {', 'test("o catálogo expõe 29 famílias em 32 recortes", () => {')
    text = text.replace('  assert.equal(catalog.familyCount, 27);', '  assert.equal(catalog.familyCount, 29);')
    text = text.replace('  assert.equal(catalog.routeCount, 30);', '  assert.equal(catalog.routeCount, 32);')
    text = text.replace('  assert.equal(new Set(catalog.routes.map(route => route.id)).size, 30);', '  assert.equal(new Set(catalog.routes.map(route => route.id)).size, 32);')

    marker = '''test("a entrada BR-319 não é rotulada incorretamente como Transamazônica", () => {
'''
    added = '''test("Panamericana e Carretera Austral preservam somente o trecho percorrido ao focar", () => {
  const panam = catalog.routes.find(item => item.id === "via-panamericana");
  const austral = catalog.routes.find(item => item.id === "carretera-austral");
  assert.equal(panam.long, true);
  assert.equal(panam.previewTraveledOnly, true);
  assert.equal(panam.emblemKey, "via-panam");
  assert.deepEqual(Array.from(panam.roadRefs), []);
  assert.match(panam.note, /Darién/);
  assert.equal(austral.long, true);
  assert.equal(austral.previewTraveledOnly, true);
  assert.deepEqual(Array.from(austral.roadRefs), ["INT:CL:CH:7"]);
});

test("geometrias latino-americanas mantêm o Darién separado e a Austral integral", () => {
  const panam = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "iconic-routes", "v1", "via-panamericana.json"), "utf8"));
  const austral = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "iconic-routes", "v1", "carretera-austral.json"), "utf8"));
  assert.equal(panam.encodedLines.length, 2);
  assert.ok(panam.totalKm > 13000 && panam.totalKm < 14000);
  assert.deepEqual(panam.osmRelationIds, [1661488, 240861]);
  assert.equal(austral.encodedLines.length, 1);
  assert.ok(austral.totalKm > 1150 && austral.totalKm < 1300);
  assert.deepEqual(austral.osmRelationIds, [6582701]);
});

'''
    if 'Panamericana e Carretera Austral preservam somente o trecho percorrido' not in text:
        if marker not in text:
            raise SystemExit("Could not extend iconic route tests")
        text = text.replace(marker, added + marker, 1)
    route_test.write_text(text, encoding="utf-8")

    ui_test = ROOT / "tests" / "iconic-routes-ui.test.js"
    ui = ui_test.read_text(encoding="utf-8")
    ui = ui.replace('test("a interface carrega os 30 recortes em Outras rotas quando não há viagens", async () => {', 'test("a interface carrega os 32 recortes em Outras rotas quando não há viagens", async () => {')
    ui = ui.replace('els.iconicOtherList.children.length !== 30', 'els.iconicOtherList.children.length !== 32')
    ui = ui.replace('assert.equal(context.MinhasViagensIconicRoutes.routes.length, 30);', 'assert.equal(context.MinhasViagensIconicRoutes.routes.length, 32);')
    ui = ui.replace('assert.equal(els.iconicOtherList.children.length, 30);', 'assert.equal(els.iconicOtherList.children.length, 32);')
    static_test = '''\n\ntest("rotas internacionais marcadas não revelam a geometria integral no preview", () => {
  const source = fs.readFileSync("iconic-routes.js", "utf8");
  assert.match(source, /previewTraveledOnly === true/);
  assert.match(source, /const traveledLines = \[\.\.\.\(result\.alternateCoverage\?\.segments \|\| \[\]\), \.\.\.\(result\.coverage\?\.segments \|\| \[\]\)\]/);
  assert.match(source, /const focusLines = result\.route\?\.previewTraveledOnly === true/);
});
'''
    if 'rotas internacionais marcadas não revelam a geometria integral' not in ui:
        ui += static_test
    ui_test.write_text(ui, encoding="utf-8")


if __name__ == "__main__":
    patch_catalog()
    patch_ui()
    patch_tests()
    print("Panamericana and Carretera Austral integrated into the iconic-route catalog.")
