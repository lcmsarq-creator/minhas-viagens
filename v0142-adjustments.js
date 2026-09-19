(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.3";
  const CITY_SCAN_SCHEMA = "route-city-crossings-v2-tabs";
  const CITY_SCAN_MAX_BOX_KM = 140;
  const CITY_SCAN_PADDING_DEG = .045;
  const OVERPASS_ENDPOINTS_V0142 = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  const SECONDARY_PARENT_STATE = Object.freeze({
    LMG: "MG", AMG: "MG", MGC: "MG", CMG: "MG",
    ERS: "RS", RSC: "RS", VRS: "RS",
    SPV: "SP", SPA: "SP", SPI: "SP"
  });

  let cityScanTimer = null;
  let cityScanGeneration = 0;
  const cityScanInflight = new Map();

  function escapeAttr(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function routeSignature(trip) {
    const coords = trip?.routeGeometry?.coordinates || [];
    const first = coords[0] || [];
    const last = coords.at?.(-1) || coords[coords.length - 1] || [];
    return [
      CITY_SCAN_SCHEMA,
      coords.length,
      first[0], first[1], last[0], last[1],
      trip?.updatedAt || trip?.createdAt || trip?.date || ""
    ].join("|");
  }

  function haversineDistanceKm(a, b) {
    const lat1 = Number(a?.[0]), lon1 = Number(a?.[1]);
    const lat2 = Number(b?.[0]), lon2 = Number(b?.[1]);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
    const r = 6371;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function pointToSegmentKm(point, a, b) {
    const lat0 = Number(point?.[0]);
    const lon0 = Number(point?.[1]);
    if (![lat0, lon0, Number(a?.[0]), Number(a?.[1]), Number(b?.[0]), Number(b?.[1])].every(Number.isFinite)) return Infinity;
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
    const ky = 110.57;
    const ax = (Number(a[1]) - lon0) * kx;
    const ay = (Number(a[0]) - lat0) * ky;
    const bx = (Number(b[1]) - lon0) * kx;
    const by = (Number(b[0]) - lat0) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denom));
    return Math.hypot(ax + dx * t, ay + dy * t);
  }

  function minDistanceToLineKm(point, line) {
    let best = Infinity;
    for (let index = 0; index < (line?.length || 0) - 1; index++) {
      best = Math.min(best, pointToSegmentKm(point, line[index], line[index + 1]));
    }
    return best;
  }

  function pointInPolygon(point, polygon) {
    const y = Number(point?.[0]);
    const x = Number(point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const yi = Number(polygon[i]?.[0]), xi = Number(polygon[i]?.[1]);
      const yj = Number(polygon[j]?.[0]), xj = Number(polygon[j]?.[1]);
      if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
      const crosses = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function orientation(a, b, c) {
    const value = (Number(b[1]) - Number(a[1])) * (Number(c[0]) - Number(b[0])) -
      (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(b[1]));
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : 2;
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
    return o1 !== o2 && o3 !== o4;
  }

  function lineIntersectsPolygon(line, polygon) {
    if (!Array.isArray(line) || line.length < 2 || !Array.isArray(polygon) || polygon.length < 3) return false;
    if (line.some(point => pointInPolygon(point, polygon))) return true;
    for (let i = 0; i < line.length - 1; i++) {
      for (let j = 0; j < polygon.length; j++) {
        const next = (j + 1) % polygon.length;
        if (segmentsIntersect(line[i], line[i + 1], polygon[j], polygon[next])) return true;
      }
    }
    return false;
  }

  function simplifyLine(line, minKm = .35) {
    if (!Array.isArray(line) || line.length <= 2) return line || [];
    const output = [line[0]];
    let last = line[0];
    for (let i = 1; i < line.length - 1; i++) {
      if (haversineDistanceKm(last, line[i]) >= minKm) {
        output.push(line[i]);
        last = line[i];
      }
    }
    output.push(line.at(-1));
    return output;
  }

  function routeChunks(line, maxKm = CITY_SCAN_MAX_BOX_KM) {
    if (!Array.isArray(line) || line.length < 2) return [];
    const chunks = [];
    let current = [line[0]];
    let km = 0;
    for (let i = 1; i < line.length; i++) {
      const edge = haversineDistanceKm(line[i - 1], line[i]);
      if (km + edge > maxKm && current.length > 1) {
        chunks.push(current);
        current = [line[i - 1], line[i]];
        km = edge;
      } else {
        current.push(line[i]);
        km += edge;
      }
    }
    if (current.length > 1) chunks.push(current);
    return chunks;
  }

  function lineBounds(line, padding = CITY_SCAN_PADDING_DEG) {
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    for (const point of line || []) {
      const lat = Number(point?.[0]), lon = Number(point?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      south = Math.min(south, lat); west = Math.min(west, lon);
      north = Math.max(north, lat); east = Math.max(east, lon);
    }
    return Number.isFinite(south) ? [south - padding, west - padding, north + padding, east + padding] : null;
  }

  async function fetchOverpass(query) {
    let lastError = null;
    for (const endpoint of OVERPASS_ENDPOINTS_V0142) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 14000);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Overpass indisponível");
  }

  function placeFallbackRadiusKm(tags = {}) {
    const population = Number(String(tags.population || "").replace(/\D/g, ""));
    if (Number.isFinite(population) && population > 0) {
      return Math.max(.65, Math.min(5.5, .7 + Math.sqrt(population) / 220));
    }
    return tags.place === "city" ? 3.5 : tags.place === "town" ? 2.2 : 1.1;
  }

  function elementPoint(element) {
    if (Number.isFinite(Number(element?.lat)) && Number.isFinite(Number(element?.lon))) return [Number(element.lat), Number(element.lon)];
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) return [Number(element.center.lat), Number(element.center.lon)];
    return null;
  }

  function geometryPolygon(element) {
    const geometry = (element?.geometry || []).map(item => [Number(item.lat), Number(item.lon)]).filter(point => point.every(Number.isFinite));
    return geometry.length >= 4 ? geometry : null;
  }

  function routeCrossesPlace(line, element) {
    const polygon = geometryPolygon(element);
    if (polygon && lineIntersectsPolygon(line, polygon)) return true;
    const center = elementPoint(element);
    if (!center) return false;
    return minDistanceToLineKm(center, line) <= placeFallbackRadiusKm(element.tags || {});
  }

  function cityRecordFromElement(element) {
    const tags = element?.tags || {};
    const name = String(tags.name || tags["name:pt"] || "").trim();
    if (!name) return null;
    const point = elementPoint(element) || geometryPolygon(element)?.[0] || [];
    const countryCode = String(tags["addr:country"] || tags["ISO3166-1"] || "").toUpperCase();
    const country = String(tags["is_in:country"] || tags["addr:country"] || "").trim();
    return {
      label: name,
      city: name,
      region: "",
      country,
      countryCode,
      lat: Number(point?.[0]),
      lng: Number(point?.[1]),
      source: "route-urban-crossing"
    };
  }

  async function scanTripCities(trip) {
    if (!trip || trip.mode === "aviao") return [];
    const raw = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (raw.length < 2) return [];
    const line = simplifyLine(raw);
    const unique = new Map();
    for (const chunk of routeChunks(line)) {
      const bounds = lineBounds(chunk);
      if (!bounds) continue;
      const [s, w, n, e] = bounds;
      const query = `[out:json][timeout:12];(node["place"~"^(city|town|village)$"](${s},${w},${n},${e});way["place"~"^(city|town|village)$"](${s},${w},${n},${e});relation["place"~"^(city|town|village)$"](${s},${w},${n},${e}););out center geom tags;`;
      const payload = await fetchOverpass(query);
      for (const element of payload?.elements || []) {
        if (!routeCrossesPlace(chunk, element)) continue;
        const record = cityRecordFromElement(element);
        if (!record) continue;
        const key = `${normalizeSimple(record.city)}|${normalizeSimple(record.region)}|${record.countryCode}`;
        if (!unique.has(key)) unique.set(key, record);
      }
    }
    return [...unique.values()];
  }

  function mergeCities(base, routeCities) {
    const merged = new Map();
    for (const city of [...(base || []), ...(routeCities || [])]) {
      const key = `${normalizeSimple(city?.city || city?.label)}|${normalizeSimple(city?.region)}|${String(city?.countryCode || "").toUpperCase()}`;
      if (key && !merged.has(key)) merged.set(key, city);
    }
    return [...merged.values()];
  }

  const baseCityConquestsForTrip = typeof cityConquestsForTrip === "function" ? cityConquestsForTrip : null;
  if (baseCityConquestsForTrip) {
    cityConquestsForTrip = function cityConquestsForTripWithRouteCrossings(trip) {
      return mergeCities(baseCityConquestsForTrip(trip), trip?.routeCityConquests || []);
    };
  }

  async function enrichTripCities(trip) {
    const signature = routeSignature(trip);
    if (!trip || trip.routeCityScanSignature === signature) return false;
    if (cityScanInflight.has(trip.id)) return cityScanInflight.get(trip.id);
    const task = (async () => {
      try {
        const cities = await scanTripCities(trip);
        trip.routeCityConquests = cities;
        trip.routeCityScanSignature = signature;
        trip.routeCityScanVersion = CITY_SCAN_SCHEMA;
        trip.conquests ||= {};
        trip.conquests.cities = cityConquestsForTrip(trip);
        return true;
      } catch (error) {
        console.warn("Não foi possível atualizar cidades cruzadas pela rota", trip?.id, error);
        return false;
      } finally {
        cityScanInflight.delete(trip.id);
      }
    })();
    cityScanInflight.set(trip.id, task);
    return task;
  }

  function scheduleCityScans() {
    clearTimeout(cityScanTimer);
    const generation = ++cityScanGeneration;
    cityScanTimer = setTimeout(async () => {
      let changed = false;
      for (const trip of state.trips || []) {
        if (generation !== cityScanGeneration) return;
        changed = (await enrichTripCities(trip)) || changed;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      if (!changed || generation !== cityScanGeneration) return;
      saveTrips();
      renderAchievements();
      if (state.activeTripDetailId) renderTripDetail();
    }, 600);
  }

  function orderedRoadsForTrip(trip) {
    const conquests = Array.isArray(trip?.conquests?.roads) ? trip.conquests.roads : [];
    const valid = new Map(conquests.map(label => [normalizeKey(label), label]));
    const output = [];
    const seen = new Set();
    for (const badge of trip?.roadLabels || []) {
      const label = typeof badge === "string" ? badge : badge?.label;
      const key = normalizeKey(label);
      if (!label || seen.has(key) || !valid.has(key)) continue;
      seen.add(key);
      output.push(valid.get(key));
    }
    for (const label of conquests) {
      const key = normalizeKey(label);
      if (!seen.has(key)) { seen.add(key); output.push(label); }
    }
    return output;
  }

  const baseExtractHighwaysFromRoute = typeof extractHighwaysFromRoute === "function" ? extractHighwaysFromRoute : null;
  if (baseExtractHighwaysFromRoute) {
    extractHighwaysFromRoute = function extractHighwaysFromRouteSequential(route, trip = null) {
      const seen = new Set();
      const output = [];
      for (const badge of extractRoadLabelsFromRoute(route, trip) || []) {
        const label = cleanRoadRef(typeof badge === "string" ? badge : badge?.label);
        const key = normalizeKey(label);
        if (!label || !isHighwayRef(label) || seen.has(key)) continue;
        seen.add(key);
        output.push(label);
      }
      return output;
    };
  }

  function roadGroup(label) {
    const parsed = parseRoadCode(label);
    if (parsed?.international || /^INT:/i.test(label || "")) return { tier: 3, state: "", number: Number(parsed?.number) || 0 };
    if (parsed?.federal || /^BR-/i.test(label || "")) return { tier: 1, state: "BR", number: Number(parsed?.number) || 0 };
    const prefix = String(parsed?.prefix || String(label || "").split("-")[0]).toUpperCase();
    const stateCode = parsed?.parentState || SECONDARY_PARENT_STATE[prefix] || (/^[A-Z]{2}$/.test(prefix) ? prefix : prefix.slice(-2));
    return { tier: 2, state: stateCode, number: Number(String(parsed?.number || label || "").match(/\d{1,4}/)?.[0]) || 0 };
  }

  function internationalConquestOrder() {
    const order = new Map();
    let index = 0;
    // Novas viagens entram no início de state.trips; percorrer ao contrário
    // preserva a primeira conquista histórica, como o snapshot base do app.
    for (const trip of [...(state.trips || [])].reverse()) {
      for (const label of orderedRoadsForTrip(trip)) {
        if (roadGroup(label).tier !== 3) continue;
        const key = normalizeKey(label);
        if (!order.has(key)) order.set(key, index++);
      }
    }
    return order;
  }

  function sortRoadAchievementCards() {
    const list = els.roadAchievementList;
    if (!list) return;
    const cards = [...list.querySelectorAll?.(".road-achievement-card[data-road]") || []];
    if (cards.length < 2) return;
    const stateCounts = new Map();
    cards.forEach(card => {
      const group = roadGroup(card.dataset.road);
      if (group.tier === 2) stateCounts.set(group.state, (stateCounts.get(group.state) || 0) + 1);
    });
    const conquestOrder = internationalConquestOrder();
    const originalIndex = new Map(cards.map((card, index) => [card, index]));
    cards.sort((a, b) => {
      const ga = roadGroup(a.dataset.road), gb = roadGroup(b.dataset.road);
      if (ga.tier !== gb.tier) return ga.tier - gb.tier;
      if (ga.tier === 1) return ga.number - gb.number || a.dataset.road.localeCompare(b.dataset.road, "pt-BR", { numeric: true });
      if (ga.tier === 2) {
        const countDiff = (stateCounts.get(gb.state) || 0) - (stateCounts.get(ga.state) || 0);
        if (countDiff) return countDiff;
        if (ga.state !== gb.state) return ga.state.localeCompare(gb.state, "pt-BR");
        return ga.number - gb.number || a.dataset.road.localeCompare(b.dataset.road, "pt-BR", { numeric: true });
      }
      const ai = conquestOrder.get(normalizeKey(a.dataset.road));
      const bi = conquestOrder.get(normalizeKey(b.dataset.road));
      if (Number.isFinite(ai) || Number.isFinite(bi)) {
        return (Number.isFinite(ai) ? ai : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bi) ? bi : Number.MAX_SAFE_INTEGER);
      }
      return originalIndex.get(a) - originalIndex.get(b);
    });
    cards.forEach(card => list.appendChild(card));
  }

  function ensureRoadShieldPane() {
    if (!map.getPane("roadShields")) map.createPane("roadShields");
    const pane = map.getPane("roadShields");
    pane.style.zIndex = "690";
    pane.style.pointerEvents = "auto";
    return pane;
  }

  function markerRoadLabel(marker) {
    const html = String(marker?.options?.icon?.options?.html || "");
    const match = html.match(/road-map-shield-wrap[^>]*data-road="([^"]+)"/i);
    if (match) return match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    return marker?.getElement?.()?.querySelector?.(".road-map-shield-wrap[data-road]")?.dataset?.road || "";
  }

  function upgradeRoadMarkersInLayer(layerGroup) {
    if (!layerGroup?.getLayers) return;
    ensureRoadShieldPane();
    for (const marker of [...layerGroup.getLayers()]) {
      if (!marker?.options?.icon) continue;
      const label = markerRoadLabel(marker);
      if (!label) continue;
      if (!marker._mvV0142Upgraded) {
        try { layerGroup.removeLayer(marker); } catch (_) {}
        marker.options.pane = "roadShields";
        marker.options.interactive = true;
        marker._mvV0142Upgraded = true;
        marker.on?.("click", event => {
          const trip = (state.trips || []).find(item => item.id === state.activeTripDetailId);
          if (!trip || state.editingTripId) return;
          L.DomEvent?.stopPropagation?.(event);
          const button = [...(els.tripDetailContent?.querySelectorAll?.(".detail-road-list [data-road]") || [])]
            .find(item => normalizeKey(item.dataset.road) === normalizeKey(label));
          showTripRoadSegment(trip, label, button || null);
        });
        try { layerGroup.addLayer(marker); } catch (_) {}
      }
      marker.setZIndexOffset?.(1000);
    }
  }

  const baseRenderAchievements = typeof renderAchievements === "function" ? renderAchievements : null;

  function cityIdentity(city) {
    const lat = Number(city?.lat), lng = Number(city?.lng);
    const coord = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(3)}|${lng.toFixed(3)}` : "";
    return `${normalizeSimple(city?.city || city?.label)}|${coord}`;
  }

  function destinationCityItems() {
    const out = new Map();
    for (const trip of [...(state.trips || [])].reverse()) {
      for (const city of baseCityConquestsForTrip?.(trip) || []) {
        const key = normalizeKey(city?.label || city?.city);
        if (!key || out.has(key)) continue;
        out.set(key, { ...city, tripName: trip.name, date: trip.date, kind: "destination" });
      }
    }
    return [...out.values()];
  }

  function crossedCityItems(destinations) {
    const destinationNames = new Set((destinations || []).map(city => normalizeSimple(city?.city || city?.label)));
    const out = new Map();
    for (const trip of [...(state.trips || [])].reverse()) {
      for (const city of trip?.routeCityConquests || []) {
        const nameKey = normalizeSimple(city?.city || city?.label);
        if (!nameKey || destinationNames.has(nameKey)) continue;
        const key = cityIdentity(city);
        if (out.has(key)) continue;
        out.set(key, { ...city, label: city.city || city.label, region: "", tripName: trip.name, date: trip.date, kind: "crossed" });
      }
    }
    return [...out.values()];
  }

  function renderCitySubTabs() {
    const view = els.cityAchievementsView;
    if (!view || !els.cityAchievementHeader || !els.cityAchievementList) return;
    state.cityAchievementMode ||= "destinations";
    const destinations = destinationCityItems();
    const crossed = crossedCityItems(destinations);
    const tabs = document.createElement("div");
    tabs.className = "city-conquest-subtabs";
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = `<button type="button" data-city-mode="destinations" class="achievement-tab ${state.cityAchievementMode === "destinations" ? "active" : ""}">Destinos <span>${destinations.length}</span></button><button type="button" data-city-mode="crossed" class="achievement-tab ${state.cityAchievementMode === "crossed" ? "active" : ""}">Cruzadas <span>${crossed.length}</span></button>`;
    tabs.querySelectorAll("[data-city-mode]").forEach(btn => btn.addEventListener("click", () => { state.cityAchievementMode = btn.dataset.cityMode; state.achievementStateKey = null; renderAchievements(); }));
    view.insertBefore(tabs, els.cityAchievementHeader);

    if (state.cityAchievementMode === "crossed") {
      els.cityAchievementHeader.innerHTML = `<div class="achievement-browser-title"><h2>Cidades cruzadas</h2><span>${crossed.length} ${crossed.length === 1 ? "cidade" : "cidades"}</span></div>`;
      els.cityAchievementList.classList.remove("state-achievement-grid");
      els.cityAchievementList.innerHTML = "";
      if (!crossed.length) { els.cityAchievementList.innerHTML = '<p class="empty">Nenhuma cidade cruzada por um trajeto ainda.</p>'; return; }
      crossed.sort((a,b) => String(a.city || a.label).localeCompare(String(b.city || b.label), "pt-BR", { numeric: true })).forEach(item => {
        const card = document.createElement("button");
        card.type = "button"; card.className = "achievement-card";
        card.innerHTML = `<span class="achievement-icon">●</span><div><strong>${escapeAttr(item.city || item.label)}</strong><small>${escapeAttr(item.tripName || "Trajeto cruzado")}${item.date ? ` · ${formatDate(item.date)}` : ""}</small></div>`;
        card.addEventListener("click", () => focusCityAchievement(item));
        els.cityAchievementList.appendChild(card);
      });
      return;
    }

    // Re-render only destination cities using the existing state/country grouping browser.
    const cityGroups = window.MinhasViagensAchievements?.groupCities(destinations) || [{ key: "ALL", uf: "BR", name: "Destinos", cities: destinations }];
    const selectedGroup = cityGroups.find(group => group.key === state.achievementStateKey);
    if (state.achievementStateKey && !selectedGroup) state.achievementStateKey = null;
    els.cityAchievementHeader.innerHTML = "";
    if (selectedGroup) {
      const back = document.createElement("button"); back.type = "button"; back.className = "achievement-back-btn"; back.textContent = "← Voltar aos estados e países";
      back.addEventListener("click", () => { state.achievementStateKey = null; renderAchievements(); }); els.cityAchievementHeader.appendChild(back);
      const title = document.createElement("div"); title.className = "achievement-browser-title"; title.innerHTML = `<h2>${escapeAttr(selectedGroup.name)}</h2><span>${selectedGroup.cities.length} ${selectedGroup.cities.length === 1 ? "cidade" : "cidades"}</span>`; els.cityAchievementHeader.appendChild(title);
      els.cityAchievementList.classList.remove("state-achievement-grid"); els.cityAchievementList.innerHTML = "";
      selectedGroup.cities.sort((a,b)=>String(a.city||a.label).localeCompare(String(b.city||b.label),"pt-BR")).forEach(item => { const card=document.createElement("button"); card.type="button"; card.className="achievement-card"; card.innerHTML=`<span class="achievement-icon">●</span><div><strong>${escapeAttr(item.city || item.label)}</strong><small>${escapeAttr(item.tripName || "Viagem")}${item.date ? ` · ${formatDate(item.date)}` : ""}</small></div>`; card.addEventListener("click",()=>focusCityAchievement(item)); els.cityAchievementList.appendChild(card); window.MinhasViagensCityFlags?.decorate(card.querySelector(".achievement-icon"), item); });
    } else {
      els.cityAchievementHeader.innerHTML = '<div class="achievement-browser-title"><h2>Destinos por estado e país</h2></div>'; els.cityAchievementList.innerHTML = ""; els.cityAchievementList.classList.add("state-achievement-grid");
      if (!cityGroups.length) { els.cityAchievementList.classList.remove("state-achievement-grid"); els.cityAchievementList.innerHTML='<p class="empty">Nenhum destino conquistado ainda.</p>'; }
      else cityGroups.forEach(group => { const card=document.createElement("button"); card.type="button"; card.className="state-achievement-card"; const flag=group.flagUrl?`<img src="${escapeAttr(group.flagUrl)}" alt="Bandeira de ${escapeAttr(group.name)}" loading="lazy"><span class="state-achievement-icon-fallback hidden">${escapeAttr(group.code||group.uf)}</span>`:`<span class="state-achievement-icon-fallback">${escapeAttr(group.code||group.uf)}</span>`; card.innerHTML=`<span class="state-achievement-icon">${flag}</span><strong>${escapeAttr(group.name)}</strong><small>${group.cities.length} ${group.cities.length===1?"cidade":"cidades"}</small>`; card.querySelector("img")?.addEventListener("error",()=>{card.querySelector("img")?.classList.add("hidden");card.querySelector(".state-achievement-icon-fallback")?.classList.remove("hidden");}); card.addEventListener("click",()=>{state.achievementStateKey=group.key;renderAchievements();}); els.cityAchievementList.appendChild(card); });
    }
  }

  if (baseRenderAchievements) {
    renderAchievements = function renderAchievementsV0143() {
      const result = baseRenderAchievements();
      sortRoadAchievementCards();
      els.cityAchievementsView?.querySelector?.(".city-conquest-subtabs")?.remove();
      renderCitySubTabs();
      // Overall Cidades counter = unique destinations + crossed-only cities.
      const destinations = destinationCityItems();
      const crossed = crossedCityItems(destinations);
      if (els.cityAchievementCount) els.cityAchievementCount.textContent = String(destinations.length + crossed.length);
      return result;
    };
  }

  function renderCrossedIconicRoutes(trip) {
    const host = els.tripDetailContent?.querySelector?.(".detail-iconic-routes");
    if (!host) return;
    const generationId = `${trip.id}|${trip.updatedAt || trip.createdAt || trip.date || ""}`;
    host.dataset.generation = generationId;
    const api = window.MinhasViagensIconicRoutes;
    if (!api?.crossedRoutesForTrip) {
      host.innerHTML = '<p class="micro-hint">Catálogo de rotas icônicas indisponível.</p>';
      return;
    }
    api.crossedRoutesForTrip(trip).then(results => {
      if (!host.isConnected || host.dataset.generation !== generationId) return;
      if (!results.length) {
        host.innerHTML = '<p class="micro-hint">Nenhuma rota icônica cruzada nesta viagem.</p>';
        return;
      }
      host.innerHTML = results.map(result => `
        <button type="button" class="detail-iconic-route-btn" data-iconic-route="${escapeAttr(result.route.id)}" style="width:100%;border:1px solid var(--border);border-radius:9px;background:#fbfcfb;padding:8px 9px;text-align:left;margin:0 0 6px;cursor:pointer">
          <strong style="display:block;font-size:.76rem">${escapeAttr(result.route.name)}</strong>
          <small style="display:block;color:var(--muted);font-size:.66rem;margin-top:2px">${Math.round(result.percent || result.alternatePercent || 0)}% · ${Number(result.traveledKm || result.alternateTraveledKm || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km nesta viagem</small>
        </button>`).join("");
      host.querySelectorAll("[data-iconic-route]").forEach(button => button.addEventListener("click", () => {
        const card = document.querySelector(`.iconic-route-card[data-iconic-route="${button.dataset.iconicRoute}"]`);
        if (card) card.click();
      }));
    }).catch(() => {
      if (host.isConnected && host.dataset.generation === generationId) host.innerHTML = '<p class="micro-hint">Não foi possível verificar as rotas icônicas agora.</p>';
    });
  }

  const baseRenderTripDetail = typeof renderTripDetail === "function" ? renderTripDetail : null;
  if (baseRenderTripDetail) {
    renderTripDetail = function renderTripDetailV0142() {
      const trip = (state.trips || []).find(item => item.id === state.activeTripDetailId);
      if (trip?.conquests?.roads) trip.conquests.roads = orderedRoadsForTrip(trip);
      const result = baseRenderTripDetail();
      const currentTrip = (state.trips || []).find(item => item.id === state.activeTripDetailId);
      if (!currentTrip) return result;
      const roadList = els.tripDetailContent?.querySelector?.(".detail-road-list") || els.tripDetailContent?.querySelector?.(".detail-no-roads");
      if (roadList && !els.tripDetailContent.querySelector(".detail-iconic-routes")) {
        const title = document.createElement("div");
        title.className = "detail-section-title detail-iconic-title";
        title.textContent = "Rotas icônicas cruzadas";
        const host = document.createElement("div");
        host.className = "detail-iconic-routes";
        host.innerHTML = '<p class="micro-hint">Verificando rotas icônicas…</p>';
        roadList.insertAdjacentElement?.("afterend", host);
        host.insertAdjacentElement?.("beforebegin", title);
        renderCrossedIconicRoutes(currentTrip);
      }
      upgradeRoadMarkersInLayer(tripLayers);
      return result;
    };
  }

  const baseBeginRouteEdit = typeof beginRouteEdit === "function" ? beginRouteEdit : null;
  if (baseBeginRouteEdit) {
    beginRouteEdit = function beginRouteEditPreserveViewport(trip) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const result = baseBeginRouteEdit(trip);
      map.setView(center, zoom, { animate: false });
      upgradeRoadMarkersInLayer(editGroup);
      return result;
    };
  }

  const baseCreateEditLayers = typeof createEditLayers === "function" ? createEditLayers : null;
  if (baseCreateEditLayers) {
    createEditLayers = function createEditLayersV0142(trip) {
      const result = baseCreateEditLayers(trip);
      upgradeRoadMarkersInLayer(editGroup);
      return result;
    };
  }

  const baseRenderTrips = typeof renderTrips === "function" ? renderTrips : null;
  if (baseRenderTrips) {
    renderTrips = function renderTripsV0142() {
      const result = baseRenderTrips();
      upgradeRoadMarkersInLayer(tripLayers);
      sortRoadAchievementCards();
      scheduleCityScans();
      return result;
    };
  }

  ensureRoadShieldPane();
  upgradeRoadMarkersInLayer(tripLayers);
  sortRoadAchievementCards();
  scheduleCityScans();

  window.MinhasViagensV0142 = Object.freeze({
    version: VERSION,
    cityScanSchema: CITY_SCAN_SCHEMA,
    orderedRoadsForTrip,
    roadGroup,
    pointInPolygon,
    lineIntersectsPolygon,
    routeCrossesPlace,
    routeChunks,
    scanTripCities,
    enrichTripCities,
    sortRoadAchievementCards,
    internationalConquestOrder,
    upgradeRoadMarkersInLayer
  });

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
  console.info(`Minhas Viagens ${VERSION}: ajustes de rotas, placas, ordenação e cidades cruzadas habilitados.`);
})();
