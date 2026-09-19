(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.6";
  const FALLBACK_STYLES = {
    common: { color: "#2f6d50", width: 5 },
    silver: { color: "#aeb5ba", width: 5 }
  };

  function runtimeBindings() {
    let appMap = null;
    let appState = null;
    let appEls = null;
    try {
      appMap = typeof map !== "undefined" ? map : null;
      appState = typeof state !== "undefined" ? state : null;
      appEls = typeof els !== "undefined" ? els : null;
    } catch (_) {}
    return { appMap, appState, appEls };
  }

  const waitForApp = () => {
    const iconic = window.MinhasViagensIconicRoutes;
    const catalog = window.MinhasViagensIconicCatalog;
    const hostedCatalog = window.MinhasViagensIconicRouteCatalog;
    const { appMap, appState, appEls } = runtimeBindings();
    if (!iconic?.routes?.length || !catalog?.routes?.length || !hostedCatalog || !window.L || !appMap || !appState?.iconicPreviewLayer || !appEls?.iconicOtherList) {
      setTimeout(waitForApp, 30);
      return;
    }
    install(iconic, catalog, hostedCatalog, appMap, appState, appEls, window.L);
  };

  function install(iconic, catalog, hostedCatalog, appMap, appState, appEls, Leaflet) {
    if (window.MinhasViagensIconicCatalogPreviewV2?.installed) return;

    const routeById = new Map(catalog.routes.map(route => [String(route.id), route]));
    let activeSelection = null;
    let selectionGeneration = 0;

    const routeStyle = kind => window.MinhasViagensRouteStyleLab?.style?.(kind) || FALLBACK_STYLES[kind] || FALLBACK_STYLES.common;
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

    function renderFastCatalog() {
      const list = appEls.iconicOtherList;
      if (!list || list.querySelector(".iconic-route-card[data-iconic-route]")) return;
      list.innerHTML = "";
      for (const route of catalog.routes) {
        const card = document.createElement("div");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.dataset.iconicRoute = route.id;
        card.className = "achievement-card iconic-route-card hosted-iconic-route-card";
        card.setAttribute("aria-label", `Mostrar o trajeto completo de ${route.name} no mapa`);
        card.innerHTML = `
          <span class="achievement-icon iconic-route-icon">★</span>
          <div class="iconic-route-copy">
            <strong>${escapeHtml(route.name)}</strong>
            <small>${escapeHtml(route.category || "Rota icônica")} · ${escapeHtml(route.region || "")}</small>
            <span class="iconic-source-label">Trajeto completo pronto</span>
            <a class="iconic-google-maps-btn" data-iconic-google-maps="true" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.name || "Rota icônica")}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;margin-top:8px;font-size:.68rem;font-weight:700;color:inherit;text-decoration:underline;position:relative;z-index:2">Abrir no Google Maps ↗</a>
          </div>`;
        list.appendChild(card);
      }
      if (!list.children.length) list.innerHTML = '<p class="empty">Nenhuma rota icônica disponível.</p>';
    }

    function addStyledLine(line, options) {
      if (!Array.isArray(line) || line.length < 2) return;
      Leaflet.polyline(line, { interactive: false, smoothFactor: 3, ...options }).addTo(appState.iconicPreviewLayer);
    }

    function paintFullGeometry(geometry) {
      const common = routeStyle("common");
      const silver = routeStyle("silver");
      for (const line of geometry.lines || []) {
        addStyledLine(line, { pane: "iconicRoutePreview", color: "#fff", weight: common.width + 4, opacity: .92 });
        addStyledLine(line, { pane: "iconicRoutePreview", color: common.color, weight: common.width, opacity: .84 });
      }
      for (const line of geometry.alternateLines || []) {
        addStyledLine(line, { pane: "iconicRoutePreview", color: "#fff", weight: silver.width + 4, opacity: .88 });
        addStyledLine(line, { pane: "iconicRoutePreview", color: silver.color, weight: silver.width, opacity: .8, dashArray: "7 7" });
      }
    }

    function fullBounds(geometry) {
      if (Array.isArray(geometry.bounds) && geometry.bounds.length === 2) return Leaflet.latLngBounds(geometry.bounds);
      const points = [...(geometry.lines || []), ...(geometry.alternateLines || [])].flat();
      return points.length ? Leaflet.latLngBounds(points) : null;
    }

    function setBackgroundSecondary(secondary) {
      for (const layer of appState.iconicRouteLayer?.getLayers?.() || []) {
        if (typeof layer?.setStyle !== "function") continue;
        if (!Number.isFinite(layer._iconicPrimaryOpacity)) {
          const opacity = Number(layer.options?.opacity);
          layer._iconicPrimaryOpacity = Number.isFinite(opacity) ? opacity : 1;
        }
        layer.setStyle({ opacity: secondary ? .22 : layer._iconicPrimaryOpacity });
      }
    }

    function showPreparedRoute(route, geometry, card) {
      if (typeof closeFullHighway === "function") closeFullHighway();
      if (typeof closeTripRoadHighlight === "function") closeTripRoadHighlight();
      iconic.clearPreview?.();
      appState.iconicPreviewLayer?.clearLayers();
      setBackgroundSecondary(true);
      document.querySelectorAll(".iconic-route-card.active").forEach(item => item.classList.remove("active"));
      card?.classList.add("active");
      if (typeof setTripsSecondary === "function") setTripsSecondary(true);
      paintFullGeometry(geometry);
      const bounds = fullBounds(geometry);
      if (bounds?.isValid?.()) appMap.fitBounds(bounds.pad(.08), { maxZoom: 13, animate: false });
      activeSelection = { route, geometry, card };
    }

    async function showFullCatalogRoute(route, card) {
      const generation = ++selectionGeneration;
      let geometry = hostedCatalog.entryFor(route.id);
      if (!geometry) {
        card?.classList.add("loading");
        geometry = await hostedCatalog.loadRoute(route.id);
        card?.classList.remove("loading");
      }
      if (generation !== selectionGeneration) return;
      if (!geometry) throw new Error(`Geometria hospedada indisponível: ${route.id}`);
      showPreparedRoute(route, geometry, card);
    }

    function googleMapsDirectionsUrl(route, geometry) {
      const lines = [...(geometry?.lines || []), ...(geometry?.alternateLines || [])].filter(line => Array.isArray(line) && line.length > 1);
      if (!lines.length) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route?.name || "Rota icônica")}`;
      const line = lines.reduce((best, item) => item.length > best.length ? item : best, lines[0]);
      const maxPoints = 10;
      const indexes = line.length <= maxPoints
        ? line.map((_, index) => index)
        : Array.from({ length: maxPoints }, (_, index) => Math.round(index * (line.length - 1) / (maxPoints - 1)));
      const points = [...new Set(indexes)].map(index => line[index]).filter(Boolean);
      if (points.length < 2) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route?.name || "Rota icônica")}`;
      const format = point => `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`;
      const origin = format(points[0]);
      const destination = format(points[points.length - 1]);
      const waypoints = points.slice(1, -1).map(format).join("|");
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
    }

    async function openGoogleRoute(route, link, popup) {
      let geometry = hostedCatalog.entryFor(route.id);
      if (!geometry) {
        link?.classList.add("loading");
        geometry = await hostedCatalog.loadRoute(route.id);
        link?.classList.remove("loading");
      }
      const url = googleMapsDirectionsUrl(route, geometry);
      if (popup && !popup.closed) popup.location.href = url;
      return url;
    }

    document.addEventListener("click", event => {
      const googleLink = event.target?.closest?.("[data-iconic-google-maps]");
      const card = event.target?.closest?.(".iconic-route-card[data-iconic-route]");
      if (!card) return;
      const route = routeById.get(String(card.dataset.iconicRoute || ""));
      if (!route) return;
      if (googleLink) {
        const popup = typeof window.open === "function" ? window.open("about:blank", "_blank") : null;
        if (!popup) return; // mantém o href de busca como fallback caso o popup seja bloqueado
        try { popup.opener = null; } catch (_) {}
        event.preventDefault();
        event.stopImmediatePropagation();
        openGoogleRoute(route, googleLink, popup).catch(error => {
          console.warn("Não foi possível montar a rota no Google Maps", error);
          if (!popup.closed) popup.location.href = googleLink.href;
        });
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      showFullCatalogRoute(route, card).catch(error => console.warn("Não foi possível abrir a rota icônica completa", error));
    }, true);

    const warmFromEvent = event => {
      if (event.target?.closest?.("[data-iconic-google-maps]")) return;
      const card = event.target?.closest?.(".iconic-route-card[data-iconic-route]");
      if (!card) return;
      const route = routeById.get(String(card.dataset.iconicRoute || ""));
      if (route && !hostedCatalog.has(route.id)) hostedCatalog.loadRoute(route.id).catch(() => {});
    };
    document.addEventListener("pointerdown", warmFromEvent, { capture: true, passive: true });
    document.addEventListener("touchstart", warmFromEvent, { capture: true, passive: true });

    appEls.iconicOtherTabBtn?.addEventListener("click", () => {
      renderFastCatalog();
      hostedCatalog.loadManifest?.().catch(() => null);
    }, true);

    window.MinhasViagensRouteStyleLab?.subscribe?.(() => {
      if (!activeSelection) return;
      appState.iconicPreviewLayer?.clearLayers();
      paintFullGeometry(activeSelection.geometry);
    });

    renderFastCatalog();

    window.MinhasViagensIconicCatalogPreview = {
      installed: true,
      version: VERSION,
      hosted: true,
      runtimeScope: "global-lexical-bindings",
      allCardsUseFullGeometry: true,
      showFullCatalogRoute,
      openGoogleRoute,
      googleMapsDirectionsUrl,
      preloadAllGeometries: () => hostedCatalog.loadBundle(),
      preparedCount: () => hostedCatalog.decodedCount(),
      stats: hostedCatalog.stats
    };
    window.MinhasViagensIconicCatalogPreviewV2 = window.MinhasViagensIconicCatalogPreview;

    const brandCopy = document.querySelector(".brand p");
    if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
  }

  waitForApp();
})();
