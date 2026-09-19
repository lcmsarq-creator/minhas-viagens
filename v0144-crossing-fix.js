(() => {
  "use strict";

  const VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.4";
  const core = window.MinhasViagensCrossingDetection;
  const CITY_SCAN_SCHEMA = "route-city-crossings-v3-admin";
  const LEGACY_SCHEMA = "route-city-crossings-v2-tabs";
  const MAX_CHUNK_KM = 90;
  const PADDING_DEG = .025;
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  if (!core) return;

  let scanTimer = null;
  let scanGeneration = 0;
  const inflight = new Map();
  const iconicCrossingCache = new Map();

  function escapeAttr(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }

  function routeSignature(trip, schema = CITY_SCAN_SCHEMA) {
    const coords = trip?.routeGeometry?.coordinates || [];
    const first = coords[0] || [];
    const last = coords.at?.(-1) || coords[coords.length - 1] || [];
    return [schema, coords.length, first[0], first[1], last[0], last[1], trip?.updatedAt || trip?.createdAt || trip?.date || ""].join("|");
  }

  function suppressLegacyScanner() {
    for (const trip of state.trips || []) trip.routeCityScanSignature = routeSignature(trip, LEGACY_SCHEMA);
  }

  function simplify(line, minKm = .25) {
    if (!Array.isArray(line) || line.length <= 2) return line || [];
    const out = [line[0]];
    let last = line[0];
    for (let i = 1; i < line.length - 1; i++) {
      if (core.haversineKm(last, line[i]) >= minKm) { out.push(line[i]); last = line[i]; }
    }
    out.push(line.at(-1));
    return out;
  }

  function chunks(line) {
    const out = [];
    let current = [line[0]], km = 0;
    for (let i = 1; i < line.length; i++) {
      const edge = core.haversineKm(line[i - 1], line[i]);
      if (km + edge > MAX_CHUNK_KM && current.length > 1) {
        out.push(current); current = [line[i - 1], line[i]]; km = edge;
      } else { current.push(line[i]); km += edge; }
    }
    if (current.length > 1) out.push(current);
    return out;
  }

  function bounds(line) {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const p of line || []) {
      const lat = Number(p?.[0]), lon = Number(p?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      s = Math.min(s,lat); w = Math.min(w,lon); n = Math.max(n,lat); e = Math.max(e,lon);
    }
    return Number.isFinite(s) ? [s-PADDING_DEG,w-PADDING_DEG,n+PADDING_DEG,e+PADDING_DEG] : null;
  }

  async function fetchOverpass(query) {
    let last;
    for (const endpoint of OVERPASS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 16000);
        const response = await fetch(endpoint, {
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
          body:`data=${encodeURIComponent(query)}`,
          signal:controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        return await response.json();
      } catch (error) { last = error; }
    }
    throw last || new Error("Overpass indisponível");
  }

  function fallbackRadius(tags = {}) {
    return tags.place === "city" ? 2.5 : tags.place === "town" ? 1.5 : .75;
  }

  function pointOf(element) {
    if (Number.isFinite(Number(element?.lat)) && Number.isFinite(Number(element?.lon))) return [Number(element.lat),Number(element.lon)];
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) return [Number(element.center.lat),Number(element.center.lon)];
    return null;
  }

  function minDistanceToLine(point, line) {
    let best = Infinity;
    for (let i = 1; i < (line?.length || 0); i++) best = Math.min(best, core.pointSegmentDistanceKm(point,line[i-1],line[i]));
    return best;
  }

  async function scanTripCitiesV0144(trip) {
    if (!trip || trip.mode === "aviao") return [];
    const raw = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (raw.length < 2) return [];
    const line = simplify(raw);
    const found = [];

    for (const chunk of chunks(line)) {
      const box = bounds(chunk);
      if (!box) continue;
      const [s,w,n,e] = box;
      const query = `[out:json][timeout:14];(` +
        `relation["boundary"="administrative"]["admin_level"~"^(7|8|9)$"](${s},${w},${n},${e});` +
        `node["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `way["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `relation["place"~"^(city|town|village)$"](${s},${w},${n},${e});` +
        `);out center geom tags;`;
      const payload = await fetchOverpass(query);
      const elements = payload?.elements || [];
      const reliable = elements.filter(core.administrativeBoundaryReliable);
      let adminHit = false;
      for (const element of reliable) {
        if (!core.routeIntersectsAdministrativeBoundary(chunk, element)) continue;
        const record = core.cityRecordFromElement(element, "route-admin-crossing");
        if (record) { found.push(record); adminHit = true; }
      }

      // Fallback somente quando o OSM não devolve nenhum limite administrativo confiável no recorte.
      if (!reliable.length && !adminHit) {
        for (const element of elements) {
          const tags = element?.tags || {};
          if (!/^(city|town|village)$/.test(String(tags.place || ""))) continue;
          const point = pointOf(element);
          if (!point || minDistanceToLine(point,chunk) > fallbackRadius(tags)) continue;
          const record = core.cityRecordFromElement(element, "route-place-fallback");
          if (record) found.push(record);
        }
      }
    }
    return core.uniqueCities(found);
  }

  function explicitDestinationsForTrip(trip) {
    const places = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
    return core.uniqueCities(places.map(place => ({
      label: place.label || [place.city,place.region,place.country].filter(Boolean).join(", "),
      city: place.city || place.label || "",
      region: place.region || "",
      country: place.country || "",
      countryCode: place.countryCode || "",
      lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : undefined,
      lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : undefined,
      source: "trip-destination"
    })).filter(city => city.city));
  }

  function mergedTripCities(trip) {
    return core.uniqueCities([...explicitDestinationsForTrip(trip), ...(trip?.routeCityConquests || [])]);
  }

  cityConquestsForTrip = function cityConquestsForTripV0144(trip) {
    return mergedTripCities(trip);
  };

  async function enrichTripCitiesV0144(trip) {
    const signature = routeSignature(trip);
    if (!trip || trip.routeCityBoundarySignature === signature) return false;
    if (inflight.has(trip.id)) return inflight.get(trip.id);
    const task = (async () => {
      try {
        const cities = await scanTripCitiesV0144(trip);
        trip.routeCityConquests = cities;
        trip.routeCityBoundarySignature = signature;
        trip.routeCityScanVersion = CITY_SCAN_SCHEMA;
        trip.routeCityScanSignature = routeSignature(trip, LEGACY_SCHEMA);
        trip.conquests ||= {};
        trip.conquests.cities = mergedTripCities(trip);
        return true;
      } catch (error) {
        console.warn("Não foi possível atualizar cidades cruzadas por limites administrativos", trip?.id, error);
        return false;
      } finally { inflight.delete(trip.id); }
    })();
    inflight.set(trip.id, task);
    return task;
  }

  function scheduleScans() {
    clearTimeout(scanTimer);
    const generation = ++scanGeneration;
    scanTimer = setTimeout(async () => {
      let changed = false;
      for (const trip of state.trips || []) {
        if (generation !== scanGeneration) return;
        changed = (await enrichTripCitiesV0144(trip)) || changed;
        await new Promise(resolve => setTimeout(resolve,35));
      }
      suppressLegacyScanner();
      if (!changed || generation !== scanGeneration) return;
      saveTrips();
      renderAchievements();
      if (state.activeTripDetailId) renderTripDetail();
    }, 700);
  }

  function destinationItems() {
    const out = [];
    for (const trip of [...(state.trips || [])].reverse()) {
      for (const city of explicitDestinationsForTrip(trip)) {
        const item = { ...city, tripName:trip.name, date:trip.date, kind:"destination" };
        if (!out.some(existing => core.sameCity(existing,item))) out.push(item);
      }
    }
    return out;
  }

  function crossedItems(destinations) {
    const out = [];
    for (const trip of [...(state.trips || [])].reverse()) {
      for (const city of trip?.routeCityConquests || []) {
        if ((destinations || []).some(destination => core.sameCity(destination,city))) continue;
        const item = { ...city, tripName:trip.name, date:trip.date, kind:"crossed" };
        if (!out.some(existing => core.sameCity(existing,item))) out.push(item);
      }
    }
    return out;
  }

  function renderCityCard(item) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "achievement-card";
    const where = [item.region,item.country].filter(Boolean).join(" · ");
    card.innerHTML = `<span class="achievement-icon">●</span><div><strong>${escapeAttr(item.city || item.label)}</strong><small>${escapeAttr([where,item.tripName].filter(Boolean).join(" · "))}${item.date ? ` · ${formatDate(item.date)}` : ""}</small></div>`;
    card.addEventListener("click", () => focusCityAchievement(item));
    window.MinhasViagensCityFlags?.decorate(card.querySelector(".achievement-icon"), item);
    return card;
  }

  function rerenderCitiesV0144() {
    const view = els.cityAchievementsView;
    if (!view || !els.cityAchievementHeader || !els.cityAchievementList) return;
    const destinations = destinationItems();
    const crossed = crossedItems(destinations);
    if (els.cityAchievementCount) els.cityAchievementCount.textContent = String(destinations.length + crossed.length);
    const destTab = view.querySelector('[data-city-mode="destinations"] span');
    const crossTab = view.querySelector('[data-city-mode="crossed"] span');
    if (destTab) destTab.textContent = String(destinations.length);
    if (crossTab) crossTab.textContent = String(crossed.length);

    if (state.cityAchievementMode === "crossed") {
      state.achievementStateKey = null;
      els.cityAchievementHeader.innerHTML = `<div class="achievement-browser-title"><h2>Cidades cruzadas</h2><span>${crossed.length} ${crossed.length === 1 ? "cidade" : "cidades"}</span></div>`;
      els.cityAchievementList.classList.remove("state-achievement-grid");
      els.cityAchievementList.innerHTML = "";
      if (!crossed.length) { els.cityAchievementList.innerHTML = '<p class="empty">Nenhuma cidade cruzada por um trajeto ainda.</p>'; return; }
      crossed.sort((a,b) => String(a.city||a.label).localeCompare(String(b.city||b.label),"pt-BR",{numeric:true})).forEach(item => els.cityAchievementList.appendChild(renderCityCard(item)));
      return;
    }

    const groups = window.MinhasViagensAchievements?.groupCities(destinations) || [{key:"ALL",uf:"BR",name:"Destinos",cities:destinations}];
    const selected = groups.find(group => group.key === state.achievementStateKey);
    if (state.achievementStateKey && !selected) state.achievementStateKey = null;
    els.cityAchievementHeader.innerHTML = "";
    els.cityAchievementList.innerHTML = "";
    if (selected) {
      const back = document.createElement("button"); back.type="button"; back.className="achievement-back-btn"; back.textContent="← Voltar aos estados e países";
      back.addEventListener("click",()=>{state.achievementStateKey=null;renderAchievements();});
      els.cityAchievementHeader.appendChild(back);
      const title = document.createElement("div"); title.className="achievement-browser-title"; title.innerHTML=`<h2>${escapeAttr(selected.name)}</h2><span>${selected.cities.length} ${selected.cities.length===1?"cidade":"cidades"}</span>`; els.cityAchievementHeader.appendChild(title);
      els.cityAchievementList.classList.remove("state-achievement-grid");
      selected.cities.sort((a,b)=>String(a.city||a.label).localeCompare(String(b.city||b.label),"pt-BR")).forEach(item=>els.cityAchievementList.appendChild(renderCityCard(item)));
    } else {
      els.cityAchievementHeader.innerHTML='<div class="achievement-browser-title"><h2>Destinos por estado e país</h2></div>';
      els.cityAchievementList.classList.add("state-achievement-grid");
      if (!groups.length) { els.cityAchievementList.classList.remove("state-achievement-grid"); els.cityAchievementList.innerHTML='<p class="empty">Nenhum destino conquistado ainda.</p>'; return; }
      groups.forEach(group => {
        const card=document.createElement("button"); card.type="button"; card.className="state-achievement-card";
        const flag=group.flagUrl?`<img src="${escapeAttr(group.flagUrl)}" alt="Bandeira de ${escapeAttr(group.name)}" loading="lazy"><span class="state-achievement-icon-fallback hidden">${escapeAttr(group.code||group.uf)}</span>`:`<span class="state-achievement-icon-fallback">${escapeAttr(group.code||group.uf)}</span>`;
        card.innerHTML=`<span class="state-achievement-icon">${flag}</span><strong>${escapeAttr(group.name)}</strong><small>${group.cities.length} ${group.cities.length===1?"cidade":"cidades"}</small>`;
        card.querySelector("img")?.addEventListener("error",()=>{card.querySelector("img")?.classList.add("hidden");card.querySelector(".state-achievement-icon-fallback")?.classList.remove("hidden");});
        card.addEventListener("click",()=>{state.achievementStateKey=group.key;renderAchievements();});
        els.cityAchievementList.appendChild(card);
      });
    }
  }

  const baseRenderAchievements = renderAchievements;
  renderAchievements = function renderAchievementsV0144() {
    const result = baseRenderAchievements();
    rerenderCitiesV0144();
    return result;
  };

  const baseRenderTrips = renderTrips;
  renderTrips = function renderTripsV0144() {
    suppressLegacyScanner();
    const result = baseRenderTrips();
    suppressLegacyScanner();
    scheduleScans();
    return result;
  };

  const iconicApi = window.MinhasViagensIconicRoutes;
  if (iconicApi?.crossedRoutesForTrip && iconicApi?.candidateRoutesForTrips && iconicApi?.progressFor) {
    const baseCrossed = iconicApi.crossedRoutesForTrip.bind(iconicApi);
    iconicApi.crossedRoutesForTrip = async function crossedRoutesForTripV0144(trip) {
      const signature = `${trip?.id}|${trip?.updatedAt || trip?.createdAt || trip?.date || ""}`;
      if (iconicCrossingCache.has(signature)) return iconicCrossingCache.get(signature);
      const promise = (async () => {
        const base = await baseCrossed(trip);
        const byId = new Map(base.map(result => [result.route.id,{...result,crossingType:"traveled"}]));
        const tripLine = tripLatLngs(trip);
        const candidates = await iconicApi.candidateRoutesForTrips([trip]);
        let cursor = 0;
        const workers = Array.from({length:Math.min(5,candidates.length || 1)}, async () => {
          while (cursor < candidates.length) {
            const route = candidates[cursor++];
            if (byId.has(route.id)) continue;
            const result = await iconicApi.progressFor(route,[trip]).catch(()=>null);
            if (!result) continue;
            const lines = [...(result.geometry?.lines || []),...(result.geometry?.alternateLines || [])];
            if (!core.routeCrossesGeometry(tripLine,lines,{toleranceKm:.04,minAngleDeg:25})) continue;
            byId.set(route.id,{...result,crossingOnly:true,crossingType:"crossed"});
          }
        });
        await Promise.all(workers);
        return [...byId.values()].sort((a,b) => {
          if (a.crossingType !== b.crossingType) return a.crossingType === "traveled" ? -1 : 1;
          return (b.traveledKm||0)-(a.traveledKm||0) || a.route.name.localeCompare(b.route.name,"pt-BR");
        });
      })();
      iconicCrossingCache.set(signature,promise);
      return promise;
    };
  }

  async function rerenderCrossedIconicsV0144(trip) {
    const host = els.tripDetailContent?.querySelector?.(".detail-iconic-routes");
    const api = window.MinhasViagensIconicRoutes;
    if (!host || !api?.crossedRoutesForTrip) return;
    const generation = `${trip.id}|${trip.updatedAt || trip.createdAt || trip.date || ""}|v0144`;
    host.dataset.v0144Generation = generation;
    const results = await api.crossedRoutesForTrip(trip).catch(()=>[]);
    if (!host.isConnected || host.dataset.v0144Generation !== generation) return;
    if (!results.length) { host.innerHTML='<p class="micro-hint">Nenhuma rota icônica cruzada nesta viagem.</p>'; return; }
    host.innerHTML = results.map(result => {
      const detail = result.crossingOnly
        ? "Cruzamento detectado · interseção geométrica"
        : `Trecho percorrido · ${Math.round(result.percent || result.alternatePercent || 0)}% · ${Number(result.traveledKm || result.alternateTraveledKm || 0).toLocaleString("pt-BR",{maximumFractionDigits:1})} km`;
      return `<button type="button" class="detail-iconic-route-btn" data-iconic-route="${escapeAttr(result.route.id)}" style="width:100%;border:1px solid var(--border);border-radius:9px;background:#fbfcfb;padding:8px 9px;text-align:left;margin:0 0 6px;cursor:pointer"><strong style="display:block;font-size:.76rem">${escapeAttr(result.route.name)}</strong><small style="display:block;color:var(--muted);font-size:.66rem;margin-top:2px">${escapeAttr(detail)}</small></button>`;
    }).join("");
    host.querySelectorAll("[data-iconic-route]").forEach(button => button.addEventListener("click",()=>document.querySelector(`.iconic-route-card[data-iconic-route="${button.dataset.iconicRoute}"]`)?.click()));
  }

  const baseRenderTripDetail = renderTripDetail;
  renderTripDetail = function renderTripDetailV0144() {
    const result = baseRenderTripDetail();
    const trip = (state.trips || []).find(item => item.id === state.activeTripDetailId);
    if (trip) rerenderCrossedIconicsV0144(trip);
    return result;
  };

  suppressLegacyScanner();
  scheduleScans();
  renderAchievements();

  window.MinhasViagensV0144 = Object.freeze({
    version:VERSION,
    cityScanSchema:CITY_SCAN_SCHEMA,
    scanTripCities:scanTripCitiesV0144,
    enrichTripCities:enrichTripCitiesV0144,
    destinationItems,
    crossedItems
  });
  console.info(`Minhas Viagens ${VERSION}: cruzamentos administrativos e icônicos v0.14.4 habilitados.`);
})();
