(() => {
  "use strict";

  const APP_VERSION = "0.13.1";
  const GOLD = "#d6a21f";
  const GOLD_DARK = "#8c6200";
  const SILVER = "#aeb5ba";
  const SILVER_DARK = "#687177";
  const PREVIEW = "#626b65";
  const core = window.MinhasViagensIconicCore;
  const catalog = window.MinhasViagensIconicCatalog;
  const progressEngine = window.MinhasViagensRoadProgress;
  const compact = window.MinhasViagensGeometryCompact;
  if (!core || !catalog?.routes?.length || !progressEngine?.corridorCoverage || !compact?.decodePolyline) return;

  const routes = catalog.routes;
  const geometryPromises = new Map();
  const progressPromises = new Map();
  const roadMedalPromises = new Map();
  const roadMedals = new Map();
  let mapRenderTimer = null;
  let mapRenderGeneration = 0;
  let achievementGeneration = 0;
  let medalGeneration = 0;
  let selectedRouteId = "";
  let iconicListView = "mine";

  if (!map.getPane("iconicRoutePreview")) map.createPane("iconicRoutePreview");
  if (!map.getPane("iconicRouteOutline")) map.createPane("iconicRouteOutline");
  if (!map.getPane("iconicRouteMain")) map.createPane("iconicRouteMain");
  map.getPane("iconicRoutePreview").style.zIndex = 608;
  map.getPane("iconicRouteOutline").style.zIndex = 610;
  map.getPane("iconicRouteMain").style.zIndex = 611;
  map.getPane("iconicRoutePreview").style.pointerEvents = "none";
  map.getPane("iconicRouteOutline").style.pointerEvents = "none";
  map.getPane("iconicRouteMain").style.pointerEvents = "none";

  state.iconicRouteLayer = L.layerGroup().addTo(map);
  state.iconicPreviewLayer = L.layerGroup().addTo(map);

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

  function decodeLines(values, precision) {
    return (values || [])
      .map(value => compact.decodePolyline(value, precision))
      .filter(line => Array.isArray(line) && line.length > 1);
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
        const lines = decodeLines(payload.encodedLines, precision);
        const alternateLines = decodeLines(payload.alternateEncodedLines, precision);
        if (!lines.length) throw new Error("Geometria da rota icônica vazia");
        return {
          lines,
          alternateLines,
          totalKm: Number(payload.totalKm) || lines.reduce((sum, line) => sum + lineLengthKm(line), 0),
          alternateTotalKm: Number(payload.alternateTotalKm) || alternateLines.reduce((sum, line) => sum + lineLengthKm(line), 0),
          bounds: payload.bounds || null,
          sourceType: payload.sourceType || "routed-waypoints"
        };
      });
    geometryPromises.set(route.id, promise);
    return promise;
  }

  function tripBounds(line) {
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    for (const point of line || []) {
      south = Math.min(south, Number(point[0]));
      west = Math.min(west, Number(point[1]));
      north = Math.max(north, Number(point[0]));
      east = Math.max(east, Number(point[1]));
    }
    return Number.isFinite(south) ? [[south, west], [north, east]] : null;
  }

  function overlaps(a, b, padding = .025) {
    if (!a || !b) return true;
    return a[0][0] <= b[1][0] + padding && a[1][0] >= b[0][0] - padding &&
      a[0][1] <= b[1][1] + padding && a[1][1] >= b[0][1] - padding;
  }

  function coverageFor(lines, tripLines) {
    if (!lines.length || !tripLines.length) return { segments: [], traveledKm: 0, totalKm: 0 };
    return progressEngine.corridorCoverage(lines, tripLines, {
      toleranceKm: 0.20,
      bearingToleranceDeg: 55,
      edgeLengthKm: (a, b) => lineLengthKm([a, b])
    });
  }

  async function progressFor(route, trips) {
    const signature = tripsSignature(trips);
    const key = `${route.id}|${signature}`;
    if (progressPromises.has(key)) return progressPromises.get(key);
    const promise = (async () => {
      const geometry = await loadGeometry(route);
      const tripLines = trips.map(tripLatLngs)
        .filter(line => line.length > 1 && overlaps(tripBounds(line), geometry.bounds));
      const coverage = coverageFor(geometry.lines, tripLines);
      const traveledKm = Math.min(geometry.totalKm, Number(coverage.traveledKm) || 0);
      const percent = geometry.totalKm ? Math.min(100, traveledKm / geometry.totalKm * 100) : 0;
      const longestContinuousKm = core.longestLineKm(coverage.segments, lineLengthKm);
      const officialAchievement = core.routeAchievement(route, { percent, longestContinuousKm });

      const alternateCoverage = coverageFor(geometry.alternateLines, tripLines);
      const alternateTraveledKm = Math.min(geometry.alternateTotalKm, Number(alternateCoverage.traveledKm) || 0);
      const alternatePercent = geometry.alternateTotalKm
        ? Math.min(100, alternateTraveledKm / geometry.alternateTotalKm * 100)
        : 0;
      const alternateLongestContinuousKm = core.longestLineKm(alternateCoverage.segments, lineLengthKm);
      const alternateAchievement = geometry.alternateLines.length
        ? core.routeAchievement(route, { percent: alternatePercent, longestContinuousKm: alternateLongestContinuousKm })
        : { discovered: false, completed: false };
      const goldCompleted = officialAchievement.completed;
      const silverCompleted = route.officialAndAlternative && !goldCompleted && alternateAchievement.completed;

      return {
        route,
        geometry,
        coverage,
        alternateCoverage,
        traveledKm,
        percent,
        longestContinuousKm,
        alternateTraveledKm,
        alternatePercent,
        alternateLongestContinuousKm,
        discovered: officialAchievement.discovered || alternateAchievement.discovered,
        completed: goldCompleted || silverCompleted,
        goldCompleted,
        silverCompleted,
        medal: goldCompleted ? "gold" : silverCompleted ? "silver" : ""
      };
    })();
    progressPromises.set(key, promise);
    return promise;
  }

  function formatKm(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }

  function addStyledLine(layer, line, options) {
    if (!Array.isArray(line) || line.length < 2) return;
    L.polyline(line, { interactive: false, smoothFactor: 1.1, ...options }).addTo(layer);
  }

  function paintTraveled(layer, segments, color, weight = 6) {
    for (const line of segments || []) {
      addStyledLine(layer, line, { pane: "iconicRouteOutline", color: "#fff", weight: weight + 4, opacity: .94 });
      addStyledLine(layer, line, { pane: "iconicRouteMain", color, weight, opacity: 1 });
    }
  }

  async function renderMap() {
    const generation = ++mapRenderGeneration;
    state.iconicRouteLayer.clearLayers();
    const trips = eligibleTrips(true);
    if (!trips.length) return;
    for (const route of routes) {
      const result = await progressFor(route, trips).catch(() => null);
      if (generation !== mapRenderGeneration) return;
      if (!result) continue;
      paintTraveled(state.iconicRouteLayer, result.alternateCoverage?.segments, SILVER, 5);
      paintTraveled(state.iconicRouteLayer, result.coverage?.segments, GOLD, 6);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  function scheduleMapRender() {
    clearTimeout(mapRenderTimer);
    mapRenderTimer = setTimeout(() => renderMap().catch(error => {
      console.warn("Não foi possível desenhar as rotas icônicas", error);
    }), 0);
  }

  function clearPreview() {
    selectedRouteId = "";
    state.iconicPreviewLayer?.clearLayers();
    document.querySelectorAll(".iconic-route-card.active").forEach(card => card.classList.remove("active"));
    if (!state.highwayLayer && !state.tripRoadLayer) setTripsSecondary(false);
  }

  function focusRoute(result, card) {
    const points = [...result.geometry.lines, ...result.geometry.alternateLines].flat();
    if (!points.length) return;
    closeFullHighway();
    closeTripRoadHighlight();
    clearPreview();
    selectedRouteId = result.route.id;
    card?.classList.add("active");
    setTripsSecondary(true);

    for (const line of result.geometry.lines) {
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: 8, opacity: .88 });
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: PREVIEW, weight: 4, opacity: .83 });
    }
    for (const line of result.geometry.alternateLines) {
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: "#fff", weight: 7, opacity: .82 });
      addStyledLine(state.iconicPreviewLayer, line, { pane: "iconicRoutePreview", color: SILVER_DARK, weight: 3, opacity: .82, dashArray: "7 7" });
    }
    paintTraveled(state.iconicPreviewLayer, result.alternateCoverage?.segments, SILVER, 6);
    paintTraveled(state.iconicPreviewLayer, result.coverage?.segments, GOLD, 7);
    map.fitBounds(L.latLngBounds(points).pad(.08), { maxZoom: 13 });
  }

  async function routeResults() {
    const trips = eligibleTrips(false);
    const results = [];
    for (const route of routes) {
      results.push(await progressFor(route, trips).catch(error => ({ route, error })));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return results;
  }

  function geometrySourceLabel(result) {
    if (result?.geometry?.sourceType === "official-gpx") return "Base oficial";
    if (result?.geometry?.sourceType === "road-catalog") return "Base rodoviária";
    return "Recorte inicial por marcos";
  }

  function makeRouteCard(result) {
    const route = result.route;
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.iconicRoute = route.id;
    card.className = `achievement-card iconic-route-card${result.goldCompleted ? " completed" : ""}${result.silverCompleted ? " silver-completed" : ""}${result.discovered ? " discovered" : ""}`;
    if (result.error) {
      card.disabled = true;
      card.innerHTML = `<span class="achievement-icon iconic-route-icon">★</span><div><strong>${escapeHtml(route.name)}</strong><small>Não foi possível carregar este recorte agora.</small></div>`;
      return card;
    }

    const rounded = Math.round(result.percent);
    const source = geometrySourceLabel(result);
    const status = result.goldCompleted
      ? "Conquistada · Ouro"
      : result.silverCompleted
        ? "Conquistada · Prata"
        : result.discovered
          ? "Trecho percorrido"
          : "Ainda não percorrida";
    const progress = route.officialAndAlternative
      ? `<span class="iconic-progress-label gold-label">Oficial: ${rounded}% · ${formatKm(result.traveledKm)} de ${formatKm(result.geometry.totalKm)} km</span>
         <span class="iconic-progress-track gold-track" role="progressbar" aria-label="Progresso oficial em ${escapeHtml(route.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rounded}"><i style="width:${result.percent}%"></i></span>
         <span class="iconic-progress-label silver-label">Entre cidades: ${Math.round(result.alternatePercent)}% · ${formatKm(result.alternateTraveledKm)} de ${formatKm(result.geometry.alternateTotalKm)} km</span>
         <span class="iconic-progress-track silver-track" role="progressbar" aria-label="Progresso alternativo em ${escapeHtml(route.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(result.alternatePercent)}"><i style="width:${result.alternatePercent}%"></i></span>`
      : `<span class="iconic-progress-label">${rounded}% · ${formatKm(result.traveledKm)} de ${formatKm(result.geometry.totalKm)} km</span>
         <span class="iconic-progress-track" role="progressbar" aria-label="Progresso em ${escapeHtml(route.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rounded}"><i style="width:${result.percent}%"></i></span>`;

    card.setAttribute("aria-label", `Mostrar o recorte de ${route.name} no mapa`);
    card.innerHTML = `
      <span class="achievement-icon iconic-route-icon">★</span>
      <div class="iconic-route-copy">
        <strong>${escapeHtml(route.name)}</strong>
        <small>${escapeHtml(route.category)} · ${escapeHtml(route.region)} · ${status}</small>
        <span class="iconic-source-label">${source}</span>
        ${progress}
        ${route.note ? `<span class="iconic-route-note">${escapeHtml(route.note)}</span>` : ""}
      </div>`;
    card.addEventListener("click", () => focusRoute(result, card));
    return card;
  }

  function setIconicListView(next) {
    iconicListView = next === "others" ? "others" : "mine";
    const mine = iconicListView === "mine";
    els.iconicMineTabBtn?.classList.toggle("active", mine);
    els.iconicOtherTabBtn?.classList.toggle("active", !mine);
    els.iconicMineTabBtn?.setAttribute("aria-selected", String(mine));
    els.iconicOtherTabBtn?.setAttribute("aria-selected", String(!mine));
    els.iconicAchievementList?.classList.toggle("hidden", !mine);
    els.iconicOtherList?.classList.toggle("hidden", mine);
  }

  async function renderAchievements() {
    const mineList = els.iconicAchievementList;
    const otherList = els.iconicOtherList;
    if (!mineList || !otherList) return;
    const generation = ++achievementGeneration;
    mineList.innerHTML = '<p class="empty">Calculando suas rotas icônicas…</p>';
    otherList.innerHTML = '<p class="empty">Carregando o catálogo…</p>';
    const results = await routeResults();
    if (generation !== achievementGeneration) return;

    const discovered = results.filter(result => result?.discovered).length;
    if (els.iconicAchievementCount) els.iconicAchievementCount.textContent = String(discovered);
    mineList.innerHTML = "";
    otherList.innerHTML = "";
    for (const result of results) {
      (result.discovered ? mineList : otherList).appendChild(makeRouteCard(result));
    }
    if (!mineList.children.length) mineList.innerHTML = '<p class="empty">Nenhuma rota icônica percorrida ainda.</p>';
    if (!otherList.children.length) otherList.innerHTML = '<p class="empty">Todas as rotas do catálogo já foram iniciadas.</p>';
    setIconicListView(iconicListView);
    decorateRoadCards(results);
  }

  function applyMedal(element, medal, percent = null) {
    element.classList.remove("road-medal-gold", "road-medal-silver");
    delete element.dataset.roadMedal;
    if (medal) {
      element.classList.add(`road-medal-${medal}`);
      element.dataset.roadMedal = medal;
    }
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
      if (!result?.goldCompleted) continue;
      for (const label of result.route.roadRefs || []) iconicRoads.add(core.normalizeRoadLabel(label));
    }

    const elements = [...document.querySelectorAll(".road-achievement-card[data-road], .detail-road-list [data-road], .road-map-shield-wrap[data-road]")];
    const prioritized = elements.sort((a, b) => Number(iconicRoads.has(core.normalizeRoadLabel(b.dataset.road))) - Number(iconicRoads.has(core.normalizeRoadLabel(a.dataset.road))));
    for (const element of prioritized) {
      if (generation !== medalGeneration) return;
      const label = element.dataset.road || "";
      const normalized = core.normalizeRoadLabel(label);
      const iconic = iconicRoads.has(normalized);
      if (iconic) {
        roadMedals.set(normalized, "gold");
        applyMedal(element, "gold");
        continue;
      }
      if (state.achievementView !== "roads" && element.classList.contains("road-achievement-card")) continue;
      const percent = await roadCoveragePercent(label).catch(() => null);
      if (percent == null || generation !== medalGeneration) continue;
      const medal = core.roadMedal(label, percent, false);
      if (medal) roadMedals.set(normalized, medal);
      else roadMedals.delete(normalized);
      applyMedal(element, medal, percent);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  function roadMedalFor(label) {
    return roadMedals.get(core.normalizeRoadLabel(label)) || "";
  }

  function roadPalette(label, requestedMedal = "") {
    const medal = requestedMedal || roadMedalFor(label);
    if (medal === "gold") return { medal, base: GOLD, progress: GOLD_DARK, banner: GOLD };
    if (medal === "silver") return { medal, base: "#c7ccd0", progress: SILVER_DARK, banner: SILVER_DARK };
    return { medal: "", base: "#c77b00", progress: "#168447", banner: "#d09a2a" };
  }

  const baseRenderTripDetail = typeof renderTripDetail === "function" ? renderTripDetail : null;
  if (baseRenderTripDetail) {
    renderTripDetail = function renderTripDetailWithIconicMedals() {
      const result = baseRenderTripDetail();
      decorateRoadCards().catch(() => {});
      return result;
    };
  }

  const baseShowFullHighway = typeof showFullHighway === "function" ? showFullHighway : null;
  if (baseShowFullHighway) {
    showFullHighway = function showFullHighwayWithoutIconicPreview(item) {
      clearPreview();
      const medal = item?.medal || roadMedalFor(item?.label);
      return baseShowFullHighway({ ...item, medal });
    };
  }

  els.iconicMineTabBtn?.addEventListener("click", () => setIconicListView("mine"));
  els.iconicOtherTabBtn?.addEventListener("click", () => setIconicListView("others"));

  window.MinhasViagensIconicRoutes = {
    version: APP_VERSION,
    catalog,
    routes,
    progressFor,
    renderAchievements,
    decorateRoadCards,
    scheduleMapRender,
    clearPreview,
    roadMedalFor,
    roadPalette
  };

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
  renderAchievements();
  scheduleMapRender();
  console.info(`Minhas Viagens ${APP_VERSION}: catálogo com ${catalog.familyCount} rotas icônicas e ${catalog.routeCount} recortes habilitado.`);
})();
