#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.13.14"

HOTFIX = r'''(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.13.14";
  const MAX_PREVIEW_POINTS = 4500;
  const FALLBACK_STYLES = {
    common: { color: "#2f6d50", width: 5 },
    silver: { color: "#aeb5ba", width: 5 }
  };
  const PANAM_EMBLEMS = Object.freeze({
    CO: "COLÔMBIA",
    EC: "ECUADOR",
    PE: "PERU",
    CL: "CHILE",
    AR: "ARGENTINA"
  });

  const waitForApp = () => {
    const iconic = window.MinhasViagensIconicRoutes;
    const catalog = window.MinhasViagensIconicCatalog;
    const compact = window.MinhasViagensGeometryCompact;
    if (!iconic?.routes?.length || !catalog?.routes?.length || !compact?.decodePolyline || !window.map || !window.L || !window.state?.iconicPreviewLayer || !window.els?.iconicOtherList) {
      setTimeout(waitForApp, 40);
      return;
    }
    install(iconic, catalog, compact);
  };

  function install(iconic, catalog, compact) {
    if (window.MinhasViagensIconicCatalogPreview?.installed) return;

    const geometryCache = new Map();
    let activeSelection = null;
    let selectionGeneration = 0;

    const routeStyle = kind => window.MinhasViagensRouteStyleLab?.style?.(kind) || FALLBACK_STYLES[kind] || FALLBACK_STYLES.common;
    const routeById = new Map(catalog.routes.map(route => [route.id, route]));

    function decodeLines(values, precision) {
      return (values || [])
        .map(value => compact.decodePolyline(value, precision))
        .filter(line => Array.isArray(line) && line.length > 1);
    }

    function previewLine(line) {
      if (!Array.isArray(line) || line.length <= MAX_PREVIEW_POINTS) return line || [];
      const last = line.length - 1;
      const sampled = [];
      for (let i = 0; i < MAX_PREVIEW_POINTS; i += 1) {
        sampled.push(line[Math.round(i * last / (MAX_PREVIEW_POINTS - 1))]);
      }
      return sampled;
    }

    async function loadGeometry(route) {
      if (geometryCache.has(route.id)) return geometryCache.get(route.id);
      const coreVersion = iconic.version || VERSION;
      const promise = fetch(`${route.geometryPath}?v=${coreVersion}`, { cache: "force-cache" })
        .then(response => {
          if (!response.ok) throw new Error(`Geometria ${response.status}`);
          return response.json();
        })
        .then(payload => {
          const precision = Number(payload.precision) || 5;
          const sourceLines = decodeLines(payload.encodedLines, precision);
          const sourceAlternateLines = decodeLines(payload.alternateEncodedLines, precision);
          if (!sourceLines.length) throw new Error("Geometria da rota icônica vazia");
          return {
            lines: sourceLines.map(previewLine),
            alternateLines: sourceAlternateLines.map(previewLine),
            bounds: payload.bounds || null
          };
        });
      geometryCache.set(route.id, promise);
      return promise;
    }

    function addStyledLine(line, options) {
      if (!Array.isArray(line) || line.length < 2) return;
      L.polyline(line, { interactive: false, smoothFactor: 2.2, ...options }).addTo(state.iconicPreviewLayer);
    }

    function paintFullGeometry(geometry) {
      const common = routeStyle("common");
      const silver = routeStyle("silver");
      for (const line of geometry.lines) {
        addStyledLine(line, { pane: "iconicRoutePreview", color: "#fff", weight: common.width + 4, opacity: .92 });
        addStyledLine(line, { pane: "iconicRoutePreview", color: common.color, weight: common.width, opacity: .82 });
      }
      for (const line of geometry.alternateLines) {
        addStyledLine(line, { pane: "iconicRoutePreview", color: "#fff", weight: silver.width + 4, opacity: .86 });
        addStyledLine(line, { pane: "iconicRoutePreview", color: silver.color, weight: silver.width, opacity: .78, dashArray: "7 7" });
      }
    }

    function setBackgroundSecondary(secondary) {
      for (const layer of state.iconicRouteLayer?.getLayers?.() || []) {
        if (typeof layer?.setStyle !== "function") continue;
        if (!Number.isFinite(layer._iconicPrimaryOpacity)) {
          const opacity = Number(layer.options?.opacity);
          layer._iconicPrimaryOpacity = Number.isFinite(opacity) ? opacity : 1;
        }
        layer.setStyle({ opacity: secondary ? .22 : layer._iconicPrimaryOpacity });
      }
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

    function panamEmblemMarkup(code) {
      const name = PANAM_EMBLEMS[code];
      if (!name) return "";
      const asset = `assets/iconic-routes/via-panam-base.svg?v=${VERSION}`;
      return `<svg viewBox="0 0 1374 1145" preserveAspectRatio="xMidYMid meet" aria-label="${name}, Vía Panam" style="width:52px;height:44px;display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.28))"><use href="${asset}#shield-base"></use><text x="687" y="275" fill="#000" font-family="Arial, Helvetica, sans-serif" font-size="180" font-weight="700" text-anchor="middle" dominant-baseline="middle">${name}</text></svg>`;
    }

    function paintPanamFullEmblems(route, geometry) {
      if (route?.emblemKey !== "via-panam" || typeof L.marker !== "function" || typeof L.divIcon !== "function") return;
      const allowed = new Set(route.emblemCountries || []);
      const pointsByCountry = new Map();
      for (const line of geometry.lines) {
        for (let index = 0; index < line.length; index += Math.max(1, Math.floor(line.length / 800))) {
          const point = line[index];
          const code = panamCountryForPoint(point);
          if (!code || !allowed.has(code) || !PANAM_EMBLEMS[code]) continue;
          if (!pointsByCountry.has(code)) pointsByCountry.set(code, []);
          pointsByCountry.get(code).push(point);
        }
      }
      for (const [code, points] of pointsByCountry) {
        const point = points[Math.floor(points.length / 2)];
        L.marker(point, {
          pane: "iconicRouteMain",
          interactive: false,
          icon: L.divIcon({
            className: "iconic-panam-marker",
            html: panamEmblemMarkup(code),
            iconSize: [52, 44],
            iconAnchor: [26, 22]
          })
        }).addTo(state.iconicPreviewLayer);
      }
    }

    function fullBounds(geometry) {
      if (Array.isArray(geometry.bounds) && geometry.bounds.length === 2) return L.latLngBounds(geometry.bounds);
      const points = [...geometry.lines, ...geometry.alternateLines].flat();
      return points.length ? L.latLngBounds(points) : null;
    }

    async function showFullCatalogRoute(route, card) {
      const generation = ++selectionGeneration;
      card?.classList.add("loading");
      try {
        const geometry = await loadGeometry(route);
        if (generation !== selectionGeneration) return;
        if (typeof closeFullHighway === "function") closeFullHighway();
        if (typeof closeTripRoadHighlight === "function") closeTripRoadHighlight();
        iconic.clearPreview?.();
        state.iconicPreviewLayer?.clearLayers();
        setBackgroundSecondary(true);
        card?.classList.add("active");
        if (typeof setTripsSecondary === "function") setTripsSecondary(true);
        paintFullGeometry(geometry);
        paintPanamFullEmblems(route, geometry);
        const bounds = fullBounds(geometry);
        if (bounds) map.fitBounds(bounds.pad(.08), { maxZoom: 13 });
        activeSelection = { route, geometry, card };
      } finally {
        card?.classList.remove("loading");
      }
    }

    function otherRouteIds() {
      return [...els.iconicOtherList.querySelectorAll?.("[data-iconic-route]") || []]
        .map(card => card.dataset.iconicRoute)
        .filter(Boolean);
    }

    async function preloadOtherGeometries() {
      const ids = otherRouteIds();
      for (const id of ids) {
        const route = routeById.get(id);
        if (route) loadGeometry(route).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    document.addEventListener("click", event => {
      const card = event.target?.closest?.(".iconic-route-card[data-iconic-route]");
      if (!card) return;
      if (!els.iconicOtherList.contains(card)) {
        activeSelection = null;
        return;
      }
      const route = routeById.get(card.dataset.iconicRoute);
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showFullCatalogRoute(route, card).catch(error => console.warn("Não foi possível abrir a rota icônica completa", error));
    }, true);

    document.addEventListener("pointerenter", event => {
      const card = event.target?.closest?.(".iconic-route-card[data-iconic-route]");
      if (!card || !els.iconicOtherList.contains(card)) return;
      const route = routeById.get(card.dataset.iconicRoute);
      if (route) loadGeometry(route).catch(() => {});
    }, true);

    document.addEventListener("touchstart", event => {
      const card = event.target?.closest?.(".iconic-route-card[data-iconic-route]");
      if (!card || !els.iconicOtherList.contains(card)) return;
      const route = routeById.get(card.dataset.iconicRoute);
      if (route) loadGeometry(route).catch(() => {});
    }, { capture: true, passive: true });

    els.iconicOtherTabBtn?.addEventListener("click", () => {
      preloadOtherGeometries().catch(() => {});
    });

    window.MinhasViagensRouteStyleLab?.subscribe?.(() => {
      if (!activeSelection) return;
      state.iconicPreviewLayer?.clearLayers();
      paintFullGeometry(activeSelection.geometry);
      paintPanamFullEmblems(activeSelection.route, activeSelection.geometry);
    });

    window.MinhasViagensIconicCatalogPreview = {
      installed: true,
      version: VERSION,
      loadGeometry,
      preloadOtherGeometries,
      showFullCatalogRoute,
      maxPreviewPoints: MAX_PREVIEW_POINTS
    };
  }

  waitForApp();
})();
'''

TEST = r'''const test = require("node:test");
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
'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 ocorrência, encontrado {count}")
    return text.replace(old, new, 1)


def main():
    (ROOT / "iconic-catalog-preview-hotfix.js").write_text(HOTFIX, encoding="utf-8")
    (ROOT / "tests" / "iconic-catalog-preview-hotfix.test.js").write_text(TEST, encoding="utf-8")

    auth_path = ROOT / "auth.js"
    auth = auth_path.read_text(encoding="utf-8")
    auth = replace_once(auth, 'const APP_VERSION="0.13.12";', 'const APP_VERSION=window.MINHAS_VIAGENS_APP_VERSION||"0.13.14";', "auth version")
    auth = replace_once(auth, '"iconic-routes-catalog.js","iconic-routes.js"]', '"iconic-routes-catalog.js","iconic-routes.js","iconic-catalog-preview-hotfix.js"]', "auth sources")
    auth_path.write_text(auth, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = replace_once(index, 'window.MINHAS_VIAGENS_APP_VERSION = "0.13.12";', 'window.MINHAS_VIAGENS_APP_VERSION = "0.13.14";', "index version")
    index = replace_once(index, 'config.js?v=0.13.12', 'config.js?v=0.13.14', "config cache")
    index = replace_once(index, 'auth.js?v=0.13.12', 'auth.js?v=0.13.14', "auth cache")
    index_path.write_text(index, encoding="utf-8")

    iconic_path = ROOT / "iconic-routes.js"
    iconic = iconic_path.read_text(encoding="utf-8")
    iconic = replace_once(iconic, 'const APP_VERSION = "0.13.13";', 'const APP_VERSION = "0.13.14";', "iconic version")
    iconic_path.write_text(iconic, encoding="utf-8")

    print("Iconic catalog full-preview layer applied for v0.13.14")


if __name__ == "__main__":
    main()
