(() => {
  "use strict";

  const APP_VERSION = "0.12.0";
  const GOLD = "#d6a21f";
  const core = window.MinhasViagensIconicCore;
  const progressEngine = window.MinhasViagensRoadProgress;
  const compact = window.MinhasViagensGeometryCompact;
  if (!core || !progressEngine?.corridorCoverage || !compact?.decodePolyline) return;

  const routes = Object.freeze([
    Object.freeze({
      id: "estrada-da-graciosa",
      name: "Estrada da Graciosa",
      category: "Cênica",
      region: "Paraná",
      roadRefs: Object.freeze(["PR-410"]),
      geometryPath: "road-catalog/v1/br/pr/410.json",
      long: false,
      minContinuousKm: 2,
      source: "Catálogo rodoviário PR-410"
    })
  ]);

  if (!map.getPane("iconicRouteOutline")) map.createPane("iconicRouteOutline");
  if (!map.getPane("iconicRouteMain")) map.createPane("iconicRouteMain");
  map.getPane("iconicRouteOutline").style.zIndex = 610;
  map.getPane("iconicRouteMain").style.zIndex = 611;
  map.getPane("iconicRouteOutline").style.pointerEvents = "none";
  map.getPane("iconicRouteMain").style.pointerEvents = "none";

  const geometryPromises = new Map();
  const progressPromises = new Map();
  const roadMedalPromises = new Map();
  let mapRenderTimer = null;
  let mapRenderGeneration = 0;
  let achievementGeneration = 0;
  let medalGeneration = 0;

  state.iconicRouteLayer = L.layerGroup().addTo(map);

  function eligibleTrips(visibleOnly = false) {
    return (state.trips || []).filter(trip => {
      if (!trip || !["carro", "moto"].includes(trip.mode) || tripLatLngs(trip).length < 2) return false;
      if (visibleOnly && trip.visible === false) return false;
      if (visibleOnly && state.activeTripDetailId && trip.id !== state.activeTripDetailId) return false;
      return true;
    });
  }

  function tripsSignature(trips) {
    return trips.map(trip => `${trip.id}:${trip.updatedAt || trip.createdAt || trip.date || ""}`).sort().join("|");
  }

  async function loadGeometry(route) {
    if (geometryPromises.has(route.id)) return geometryPromises.get(route.id);
    const promise = fetch(`${route.geometryPath}?v=${APP_VERSION}`, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Geometria ${response.status}`);
        return response.json();
      })
      .then(payload => {
        const precision = Number(payload.precision) || 5;
        const lines = (payload.encodedLines || [])
          .map(line => compact.decodePolyline(line, precision))
          .filter(line => Array.isArray(line) && line.length > 1);
        if (!lines.length) throw new Error("Geometria da rota icônica vazia");
        return {
          lines,
          totalKm: Number(payload.totalKm) || lines.reduce((sum, line) => sum + lineLengthKm(line), 0),
          bounds: payload.bounds || null
        };
      });
    geometryPromises.set(route.id, promise);
    return promise;
  }

  async function progressFor(route, trips) {
    const signature = tripsSignature(trips);
    const key = `${route.id}|${signature}`;
    if (progressPromises.has(key)) return progressPromises.get(key);
    const promise = (async () => {
      const geometry = await loadGeometry(route);
      const tripLines = trips.map(tripLatLngs).filter(line => line.length > 1);
      const coverage = progressEngine.corridorCoverage(geometry.lines, tripLines, {
        toleranceKm: 0.20,
        bearingToleranceDeg: 55,
        edgeLengthKm: (a, b) => lineLengthKm([a, b])
      });
      const traveledKm = Math.min(geometry.totalKm, Number(coverage.traveledKm) || 0);
      const percent = geometry.totalKm ? Math.min(100, traveledKm / geometry.totalKm * 100) : 0;
      const longestContinuousKm = core.longestLineKm(coverage.segments, lineLengthKm);
      const achievement = core.routeAchievement(route, { percent, longestContinuousKm });
      return { route, geometry, ...coverage, traveledKm, percent, longestContinuousKm, ...achievement };
    })();
    progressPromises.set(key, promise);
    return promise;
  }

  function formatKm(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }

  async function renderMap() {
    const generation = ++mapRenderGeneration;
    state.iconicRouteLayer.clearLayers();
    const trips = eligibleTrips(true);
    if (!trips.length) return;

    const results = await Promise.all(routes.map(route => progressFor(route, trips).catch(() => null)));
    if (generation !== mapRenderGeneration) return;
    for (const result of results.filter(Boolean)) {
      for (const line of result.segments || []) {
        if (!Array.isArray(line) || line.length < 2) continue;
        L.polyline(line, {
          pane: "iconicRouteOutline", color: "#fff", weight: 10, opacity: .95,
          interactive: false, smoothFactor: 1.1
        }).addTo(state.iconicRouteLayer);
        L.polyline(line, {
          pane: "iconicRouteMain", color: GOLD, weight: 6, opacity: 1,
          interactive: false, smoothFactor: 1.1
        }).addTo(state.iconicRouteLayer);
      }
    }
  }

  function scheduleMapRender() {
    clearTimeout(mapRenderTimer);
    mapRenderTimer = setTimeout(() => renderMap().catch(error => {
      console.warn("Não foi possível desenhar as rotas icônicas", error);
    }), 0);
  }

  function focusRoute(result) {
    const points = result.geometry.lines.flat();
    if (!points.length) return;
    closeFullHighway();
    closeTripRoadHighlight();
    map.fitBounds(L.latLngBounds(points).pad(.08), { maxZoom: 13 });
  }

  async function routeResults() {
    const trips = eligibleTrips(false);
    return Promise.all(routes.map(route => progressFor(route, trips).catch(error => ({ route, error }))));
  }

  async function renderAchievements() {
    const list = els.iconicAchievementList;
    if (!list) return;
    const generation = ++achievementGeneration;
    list.innerHTML = '<p class="empty">Calculando rotas icônicas…</p>';
    const results = await routeResults();
    if (generation !== achievementGeneration) return;

    const discovered = results.filter(result => result?.discovered).length;
    if (els.iconicAchievementCount) els.iconicAchievementCount.textContent = String(discovered);
    list.innerHTML = "";

    for (const result of results) {
      const route = result.route;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `achievement-card iconic-route-card${result.completed ? " completed" : ""}${result.discovered ? " discovered" : ""}`;
      if (result.error) {
        card.disabled = true;
        card.innerHTML = `<span class="achievement-icon iconic-route-icon">★</span><div><strong>${escapeHtml(route.name)}</strong><small>Não foi possível carregar esta rota agora.</small></div>`;
      } else {
        const rounded = Math.round(result.percent);
        const status = result.completed
          ? "Rota icônica conquistada"
          : result.discovered
            ? "Trecho icônico percorrido"
            : "Ainda não percorrida";
        card.setAttribute("aria-label", `Mostrar ${route.name} no mapa`);
        card.innerHTML = `
          <span class="achievement-icon iconic-route-icon">★</span>
          <div class="iconic-route-copy">
            <strong>${escapeHtml(route.name)}</strong>
            <small>${escapeHtml(route.category)} · ${escapeHtml(route.region)} · ${status}</small>
            <span class="iconic-progress-label">${rounded}% · ${formatKm(result.traveledKm)} de ${formatKm(result.geometry.totalKm)} km</span>
            <span class="iconic-progress-track" role="progressbar" aria-label="Progresso em ${escapeHtml(route.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rounded}"><i style="width:${result.percent}%"></i></span>
          </div>`;
        card.addEventListener("click", () => focusRoute(result));
      }
      list.appendChild(card);
    }

    decorateRoadCards(results);
  }

  function applyMedal(element, medal, percent = null) {
    element.classList.remove("road-medal-gold", "road-medal-silver");
    if (medal) element.classList.add(`road-medal-${medal}`);
    if (!element.classList.contains("road-achievement-card")) return;
    const status = element.querySelector("small");
    if (!status) return;
    status.dataset.baseText ||= status.textContent;
    status.textContent = medal
      ? `${status.dataset.baseText} · ${medal === "gold" ? "Ouro" : "Prata"}${Number.isFinite(percent) ? ` ${Math.round(percent)}%` : ""}`
      : status.dataset.baseText;
  }

  async function roadCoveragePercent(label) {
    const signature = tripsSignature(eligibleTrips(false));
    const key = `${core.normalizeRoadLabel(label)}|${signature}`;
    if (roadMedalPromises.has(key)) return roadMedalPromises.get(key);
    const promise = (async () => {
      const descriptor = overpassRoadDescriptor({ label, countryCode: "BR" });
      let entry = await cachedHighway(descriptor, true).catch(() => null);
      if (!entry) entry = await window.MinhasViagensRoadCatalog?.catalogEntryFor?.(descriptor).catch(() => null);
      if (!entry) return null;
      const progress = await highwayProgress(descriptor, entry);
      return Number.isFinite(Number(progress.rawCoveragePercent))
        ? Number(progress.rawCoveragePercent)
        : Number(progress.percent) || 0;
    })();
    roadMedalPromises.set(key, promise);
    return promise;
  }

  async function decorateRoadCards(preloadedResults = null) {
    const generation = ++medalGeneration;
    const results = preloadedResults || await routeResults();
    if (generation !== medalGeneration) return;
    const iconicRoads = new Set();
    for (const result of results || []) {
      if (!result?.completed) continue;
      for (const label of result.route.roadRefs || []) iconicRoads.add(core.normalizeRoadLabel(label));
    }

    const elements = [...document.querySelectorAll(".road-achievement-card[data-road], .detail-road-list [data-road], .road-map-shield-wrap[data-road]")];
    const prioritized = elements.sort((a, b) => {
      const aIconic = iconicRoads.has(core.normalizeRoadLabel(a.dataset.road));
      const bIconic = iconicRoads.has(core.normalizeRoadLabel(b.dataset.road));
      return Number(bIconic) - Number(aIconic);
    });

    for (const element of prioritized) {
      if (generation !== medalGeneration) return;
      const label = element.dataset.road || "";
      const iconic = iconicRoads.has(core.normalizeRoadLabel(label));
      if (iconic) {
        applyMedal(element, "gold");
        continue;
      }
      if (state.achievementView !== "roads" && element.classList.contains("road-achievement-card")) continue;
      const percent = await roadCoveragePercent(label).catch(() => null);
      if (percent == null || generation !== medalGeneration) continue;
      applyMedal(element, core.roadMedal(label, percent, false), percent);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  const baseRenderTripDetail = typeof renderTripDetail === "function" ? renderTripDetail : null;
  if (baseRenderTripDetail) {
    renderTripDetail = function renderTripDetailWithIconicMedals() {
      const result = baseRenderTripDetail();
      decorateRoadCards().catch(() => {});
      return result;
    };
  }

  window.MinhasViagensIconicRoutes = {
    version: APP_VERSION,
    routes,
    progressFor,
    renderAchievements,
    decorateRoadCards,
    scheduleMapRender
  };

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
  renderAchievements();
  scheduleMapRender();
  console.info(`Minhas Viagens ${APP_VERSION}: primeiro catálogo de rotas icônicas habilitado com a Estrada da Graciosa.`);
})();
