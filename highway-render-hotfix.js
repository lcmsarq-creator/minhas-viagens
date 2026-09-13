(() => {
  "use strict";

  const APP_VERSION = "0.10.14";
  const MAX_MEMORY_ROADS = 16;
  const memoryCache = new Map();

  const stats = window.MinhasViagensHighwayRenderStats = {
    version: APP_VERSION,
    memoryHits: 0,
    memoryMisses: 0,
    renderedRoads: 0,
    renderedFragments: 0
  };

  function remember(key, entry) {
    if (!key || !entry) return entry;
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    while (memoryCache.size > MAX_MEMORY_ROADS) {
      memoryCache.delete(memoryCache.keys().next().value);
    }
    return entry;
  }

  function validCachedEntry(entry, allowExpired) {
    return entry?.version === HIGHWAY_CACHE_VERSION &&
      (allowExpired || Date.now() - Number(entry.updatedAt || 0) < HIGHWAY_CACHE_TTL);
  }

  const baseCachedHighway = typeof cachedHighway === "function" ? cachedHighway : null;
  if (baseCachedHighway) {
    cachedHighway = async function cachedHighwayMemoryFirst(descriptor, allowExpired = false) {
      const key = highwayCacheKey(descriptor);
      const memoryEntry = memoryCache.get(key);
      if (validCachedEntry(memoryEntry, allowExpired)) {
        stats.memoryHits += 1;
        remember(key, memoryEntry);
        return memoryEntry;
      }
      stats.memoryMisses += 1;
      const entry = await baseCachedHighway(descriptor, allowExpired);
      return entry ? remember(key, entry) : null;
    };
  }

  const baseCacheHighway = typeof cacheHighway === "function" ? cacheHighway : null;
  if (baseCacheHighway) {
    cacheHighway = async function cacheHighwayAndRemember(descriptor, lines, partial = false) {
      const entry = await baseCacheHighway(descriptor, lines, partial);
      return remember(highwayCacheKey(descriptor), entry);
    };
  }

  const outlineRenderer = L.canvas({ pane: "fullHighwayOutline", padding: 0.45 });
  const mainRenderer = L.canvas({ pane: "fullHighwayMain", padding: 0.45 });
  const progressRenderer = L.canvas({ pane: "fullHighwayMain", padding: 0.45 });

  const baseDrawFullHighway = typeof drawFullHighway === "function" ? drawFullHighway : null;
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  if (baseDrawFullHighway) {
    drawFullHighway = async function drawFullHighwayFast(entry, item, descriptor) {
      const lines = (entry?.lines || []).filter(line => Array.isArray(line) && line.length > 1);
      if (!lines.length) return baseDrawFullHighway(entry, item, descriptor);
      const palette = window.MinhasViagensIconicRoutes?.roadPalette?.(item.label, item.medal) ||
        { base: "#c77b00", progress: "#168447", banner: "#d09a2a" };

      const outline = L.polyline(lines, {
        renderer: outlineRenderer,
        pane: "fullHighwayOutline",
        color: "#fff",
        weight: 9,
        opacity: .9,
        interactive: false,
        smoothFactor: 1.5
      });
      const main = L.polyline(lines, {
        renderer: mainRenderer,
        pane: "fullHighwayMain",
        color: palette.base,
        weight: 5,
        opacity: .9,
        interactive: false,
        smoothFactor: 1.5
      });

      state.highwayLayer = L.featureGroup([outline, main]).addTo(map);
      state.highwayBounds = state.highwayLayer.getBounds();
      setTripsSecondary(true);
      fitHighwayBounds();
      els.highwayBannerTitle.textContent = roadDisplayLabel(item.label);
      els.highwayBanner.style.borderColor = palette.banner;
      els.highwayBannerStatus.textContent = entry.partial
        ? "Geometria parcial encontrada · calculando progresso…"
        : "Rodovia carregada · calculando progresso…";

      stats.renderedRoads += 1;
      stats.renderedFragments += lines.length;

      // Entrega a rodovia ao Canvas antes de iniciar a análise de progresso.
      await nextPaint();
      const progress = await highwayProgress(descriptor, entry);
      if (state.highwayKey !== highwayCacheKey(descriptor)) return;

      if (state.highwayProgressLayer) map.removeLayer(state.highwayProgressLayer);
      const traveled = (progress.segments || []).filter(line => Array.isArray(line) && line.length > 1);
      state.highwayProgressLayer = traveled.length
        ? L.polyline(traveled, {
            renderer: progressRenderer,
            pane: "fullHighwayMain",
            color: palette.progress,
            weight: 7,
            opacity: 1,
            interactive: false,
            smoothFactor: 1.2
          }).addTo(map)
        : L.layerGroup().addTo(map);

      els.highwayBannerStatus.textContent = entry.partial ? "Geometria parcial encontrada" : "Rodovia carregada";
      els.highwayProgress.classList.remove("hidden");
      els.highwayProgressPercent.textContent = `${Math.round(progress.percent)}% concluída`;
      els.highwayProgressDistance.textContent = `${progress.traveledKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km de ${progress.totalKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km percorridos`;
      els.highwayProgressBar.style.width = `${progress.percent}%`;
      els.highwayProgressBar.style.background = palette.progress;
      els.highwayProgressBar.parentElement.setAttribute("aria-valuenow", String(Math.round(progress.percent)));
    };
  }

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  window.MinhasViagensHighwayMemoryCache = memoryCache;
  console.info(`Minhas Viagens ${APP_VERSION}: rodovias completas em Canvas/MultiPolyline com cache de sessão.`);
})();
