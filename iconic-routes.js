(() => {
  "use strict";

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.5";
  const STYLE_LAB = window.MinhasViagensRouteStyleLab;
  const FALLBACK_STYLES = {
    common: { color: "#2f6d50", width: 5 },
    gold: { color: "#d6a21f", width: 6 },
    silver: { color: "#aeb5ba", width: 5 }
  };
  const PANAM_EMBLEMS = Object.freeze({
    CO: Object.freeze({ name: "COLÔMBIA" }),
    EC: Object.freeze({ name: "ECUADOR" }),
    PE: Object.freeze({ name: "PERU" }),
    CL: Object.freeze({ name: "CHILE" }),
    AR: Object.freeze({ name: "ARGENTINA" })
  });
  const PANAM_EMBLEM_ASSET = `assets/iconic-routes/via-panam-base.svg?v=${APP_VERSION}`;

  const SECONDARY_OPACITY = .22;
  const routeStyle = kind => STYLE_LAB?.style?.(kind) || FALLBACK_STYLES[kind] || FALLBACK_STYLES.common;
  const core = window.MinhasViagensIconicCore;
  const catalog = window.MinhasViagensIconicCatalog;
  const progressEngine = window.MinhasViagensRoadProgress;
  const compact = window.MinhasViagensGeometryCompact;
  const hostedCatalog = window.MinhasViagensIconicRouteCatalog;
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
  let selectedRouteResult = null;
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

  function panamEmblemMarkup(countryCode, mapMarker = false) {
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

  function formatKm(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }

  function addStyledLine(layer, line, options) {
    if (!Array.isArray(line) || line.length < 2) return;
    L.polyline(line, { interactive: false, smoothFactor: 1.1, ...options }).addTo(layer);
  }

  function paintTraveled(layer, segments, kind) {
    const routePaint = routeStyle(kind);
    for (const line of segments || []) {
      addStyledLine(layer, line, { pane: "iconicRouteOutline", color: "#fff", weight: routePaint.width + 4, opacity: .94 });
      addStyledLine(layer, line, { pane: "iconicRouteMain", color: routePaint.color, weight: routePaint.width, opacity: 1 });
    }
  }

  function setIconicRoutesSecondary(secondary) {
    for (const layer of state.iconicRouteLayer?.getLayers?.() || []) {
      if (typeof layer?.setStyle !== "function") continue;
      if (!Number.isFinite(layer._iconicPrimaryOpacity)) {
        const opacity = Number(layer.options?.opacity);
        layer._iconicPrimaryOpacity = Number.isFinite(opacity) ? opacity : 1;
      }
      layer.setStyle({ opacity: secondary ? SECONDARY_OPACITY : layer._iconicPrimaryOpacity });
    }
  }

  async function routeMetadata() {
    try {
      return (await hostedCatalog?.loadManifest?.())?.routes || {};
    } catch (_) {
      return {};
    }
  }

  async function candidateRoutesForTrips(trips) {
    if (!trips?.length) return [];
    const metadata = await routeMetadata();
    if (!Object.keys(metadata).length) return routes;
    const tripBoxes = trips.map(trip => tripBounds(tripLatLngs(trip))).filter(Boolean);
    return routes.filter(route => {
      const bounds = metadata?.[route.id]?.bounds;
      return !Array.isArray(bounds) || tripBoxes.some(box => overlaps(box, bounds, .04));
    });
  }

  async function mapWithConcurrency(items, limit, worker) {
    const output = new Array(items.length);
    let cursor = 0;
    const run = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await worker(items[index], index);
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, run));
    return output;
  }

  function undiscoveredResult(route, meta = {}) {
    return {
      route,
      geometry: {
        lines: [], alternateLines: [],
        totalKm: Number(meta.km) || 0,
        alternateTotalKm: 0,
        bounds: meta.bounds || null,
        sourceType: "hosted-manifest"
      },
      coverage: { segments: [], traveledKm: 0 },
      alternateCoverage: { segments: [], traveledKm: 0 },
      traveledKm: 0, percent: 0, longestContinuousKm: 0,
      alternateTraveledKm: 0, alternatePercent: 0, alternateLongestContinuousKm: 0,
      discovered: false, completed: false, goldCompleted: false, silverCompleted: false, medal: ""
    };
  }

  async function renderMap() {
    const generation = ++mapRenderGeneration;
    state.iconicRouteLayer.clearLayers();
    const trips = eligibleTrips(true);
    if (!trips.length) return;
    const candidates = await candidateRoutesForTrips(trips);
    for (const route of candidates) {
      const result = await progressFor(route, trips).catch(() => null);
      if (generation !== mapRenderGeneration) return;
      if (!result) continue;
      paintTraveled(state.iconicRouteLayer, result.alternateCoverage?.segments, "silver");
      paintTraveled(state.iconicRouteLayer, result.coverage?.segments, "gold");
      if (selectedRouteId) setIconicRoutesSecondary(true);
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
    selectedRouteResult = null;
    state.iconicPreviewLayer?.clearLayers();
    setIconicRoutesSecondary(false);
    document.querySelectorAll(".iconic-route-card.active").forEach(card => card.classList.remove("active"));
    if (!state.highwayLayer && !state.tripRoadLayer) setTripsSecondary(false);
  }

  function paintRoutePreview(result) {
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
    paintPanamEmblems(result);
  }

  function focusRoute(result, card) {
    const traveledLines = [...(result.alternateCoverage?.segments || []), ...(result.coverage?.segments || [])];
    const focusLines = result.route?.previewTraveledOnly === true
      ? traveledLines
      : [...result.geometry.lines, ...result.geometry.alternateLines];
    const points = focusLines.flat();
    if (!points.length) return;
    closeFullHighway();
    closeTripRoadHighlight();
    clearPreview();
    selectedRouteId = result.route.id;
    selectedRouteResult = result;
    setIconicRoutesSecondary(true);
    card?.classList.add("active");
    setTripsSecondary(true);
    paintRoutePreview(result);
    map.fitBounds(L.latLngBounds(points).pad(.08), { maxZoom: 13 });
  }

  async function routeResults() {
    const trips = eligibleTrips(false);
    const metadata = await routeMetadata();
    const resultById = new Map(routes.map(route => [route.id, undiscoveredResult(route, metadata?.[route.id]) ]));
    if (!trips.length) return routes.map(route => resultById.get(route.id));
    const candidates = await candidateRoutesForTrips(trips);
    const computed = await mapWithConcurrency(candidates, 6, route =>
      progressFor(route, trips).catch(error => ({ route, error }))
    );
    computed.forEach(result => result?.route?.id && resultById.set(result.route.id, result));
    return routes.map(route => resultById.get(route.id));
  }

  async function crossedRoutesForTrip(trip) {
    if (!trip || tripLatLngs(trip).length < 2) return [];
    const candidates = await candidateRoutesForTrips([trip]);
    const results = await mapWithConcurrency(candidates, 5, route =>
      progressFor(route, [trip]).catch(() => null)
    );
    return results.filter(result => result?.discovered)
      .sort((a, b) => b.traveledKm - a.traveledKm || a.route.name.localeCompare(b.route.name, "pt-BR"));
  }

  function geometrySourceLabel(result) {
    if (result?.geometry?.sourceType === "official-gpx") return "Base oficial";
    if (result?.geometry?.sourceType === "road-catalog") return "Base rodoviária";
    return "Recorte inicial por marcos";
  }

  function googleMapsUrlForResult(result) {
    const route = result?.route || {};
    const lines = (result?.geometry?.lines || []).filter(line => Array.isArray(line) && line.length > 1);
    if (!lines.length) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.name || "Rota icônica")}`;
    const line = [...lines].sort((a, b) => lineLengthKm(b) - lineLengthKm(a))[0];
    const count = Math.min(10, line.length);
    const points = [];
    for (let index = 0; index < count; index++) {
      const point = line[Math.round(index * (line.length - 1) / Math.max(1, count - 1))];
      if (point && (!points.length || point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1])) points.push(point);
    }
    if (points.length < 2) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.name || "Rota icônica")}`;
    const origin = `${points[0][0]},${points[0][1]}`;
    const destination = `${points.at(-1)[0]},${points.at(-1)[1]}`;
    const waypoints = points.slice(1, -1).map(point => `${point[0]},${point[1]}`).join("|");
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
  }

  function makeRouteCard(result) {
    const route = result.route;
    const card = document.createElement("div");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.iconicRoute = route.id;
    card.className = `achievement-card iconic-route-card${result.goldCompleted ? " completed" : ""}${result.silverCompleted ? " silver-completed" : ""}${result.discovered ? " discovered" : ""}`;
    if (result.error) {
      card.setAttribute("aria-disabled", "true");
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
        ${iconicEmblemsMarkup(route)}
        <small>${escapeHtml(route.category)} · ${escapeHtml(route.region)} · ${status}</small>
        <span class="iconic-source-label">${source}</span>
        ${progress}
        ${route.note ? `<span class="iconic-route-note">${escapeHtml(route.note)}</span>` : ""}
        <a class="iconic-google-maps-btn" data-iconic-google-maps="true" href="${escapeHtml(googleMapsUrlForResult(result))}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;margin-top:8px;font-size:.68rem;font-weight:700;color:inherit;text-decoration:underline;position:relative;z-index:2">Abrir no Google Maps ↗</a>
      </div>`;
    const focusPrepared = async () => {
      let prepared = result;
      if (!prepared.geometry?.lines?.length && route.previewTraveledOnly !== true) {
        const geometry = await loadGeometry(route).catch(() => null);
        if (geometry) prepared = { ...prepared, geometry };
      }
      focusRoute(prepared, card);
    };
    const open = event => {
      if (event?.target?.closest?.("[data-iconic-google-maps]")) return;
      if (route.previewTraveledOnly !== true) setIconicRoutesSecondary(true);
      focusPrepared().catch(error => {
        setIconicRoutesSecondary(false);
        console.warn("Não foi possível abrir a rota icônica", error);
      });
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && !event.target?.closest?.("[data-iconic-google-maps]")) {
        event.preventDefault();
        focusPrepared().catch(error => console.warn("Não foi possível abrir a rota icônica", error));
      }
    });
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
    const kind = medal === "gold" || medal === "silver" ? medal : "common";
    const value = routeStyle(kind);
    return { medal: medal || "", base: value.color, progress: value.color, banner: value.color, width: value.width };
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
  STYLE_LAB?.subscribe?.(() => {
    scheduleMapRender();
    if (selectedRouteResult) paintRoutePreview(selectedRouteResult);
  });

  window.MinhasViagensIconicRoutes = {
    version: APP_VERSION,
    catalog,
    routes,
    progressFor,
    crossedRoutesForTrip,
    candidateRoutesForTrips,
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
