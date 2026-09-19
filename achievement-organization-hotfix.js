(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const SECONDARY_PARENT_STATE = Object.freeze({
    LMG: "MG", AMG: "MG", MGC: "MG", CMG: "MG",
    ERS: "RS", RSC: "RS", VRS: "RS",
    SPV: "SP", SPA: "SP", SPI: "SP"
  });

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function formatDate(value) {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value || "");
  }

  function cityIdentity(city) {
    const cityName = normalize(city?.city || city?.label);
    const country = String(city?.countryCode || city?.country || "").toUpperCase().trim();
    const region = normalize(city?.region);
    const lat = Number(city?.lat), lng = Number(city?.lng);
    const coords = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(3)}|${lng.toFixed(3)}` : "";
    return [cityName, country, region || coords].join("|");
  }

  function destinationCities(trips) {
    const out = new Map();
    for (const trip of [...(trips || [])].reverse()) {
      const places = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
      for (const place of places) {
        const city = {
          label: place.label || [place.city, place.region, place.country].filter(Boolean).join(", "),
          city: place.city || place.label || "",
          region: place.region || "",
          country: place.country || "",
          countryCode: place.countryCode || "",
          lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : undefined,
          lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : undefined,
          tripName: trip.name,
          date: trip.date,
          kind: "destination"
        };
        const key = cityIdentity(city);
        if (city.city && !out.has(key)) out.set(key, city);
      }
    }
    return [...out.values()];
  }

  function crossedCities(trips, destinations = destinationCities(trips)) {
    const destinationKeys = new Set((destinations || []).map(cityIdentity));
    const out = new Map();
    for (const trip of [...(trips || [])].reverse()) {
      for (const city of trip?.routeCityConquests || []) {
        const item = {
          ...city,
          label: city?.label || [city?.city, city?.region, city?.country].filter(Boolean).join(", "),
          city: city?.city || city?.label || "",
          region: city?.region || "",
          country: city?.country || "",
          countryCode: city?.countryCode || "",
          tripName: trip.name,
          date: trip.date,
          kind: "crossed"
        };
        const key = cityIdentity(item);
        if (!item.city || destinationKeys.has(key) || out.has(key)) continue;
        out.set(key, item);
      }
    }
    return [...out.values()];
  }

  function routeKind(route) {
    const refs = (route?.roadRefs || []).map(value => String(value || "").toUpperCase());
    const region = normalize(route?.region);
    const category = normalize(route?.category);
    if (category.includes("INTERNACIONAL") || refs.some(ref => ref.startsWith("INT:")) || /ARGENTINA|CHILE|URUGUAI|URUGUAY|PARAGUAI|PARAGUAY|BOLIVIA|PERU|COLOMBIA|VENEZUELA|EQUADOR|ECUADOR|MEXICO|CANADA|ESTADOS UNIDOS|PANAMA|COSTA RICA|HONDURAS|EL SALVADOR|GUATEMALA|BELIZE|GUIANA|SURINAME/.test(region)) return "international";
    if (refs.some(ref => /^BR-\d+/.test(ref))) return "br";
    return "state";
  }

  function routeFamilyPriority(route) {
    const family = normalize(route?.family);
    const category = normalize(route?.category);
    const name = normalize(route?.name);
    if (family === "ESTRADA REAL" || name.startsWith("ESTRADA REAL ")) return 0;
    if (category.includes("ESTRADA PARQUE") || name.includes("ESTRADA PARQUE")) return 1;
    if (name.startsWith("CAMINHO ") || name.startsWith("CAMINHOS ") || category.includes("PEREGRIN") || category.includes("HISTORICA") || category.includes("CULTURAL")) return 2;
    return 3;
  }

  function stateCodesForRoute(route, states = []) {
    const valid = new Set((states || []).map(state => state.uf));
    const found = new Set();
    for (const ref of route?.roadRefs || []) {
      const prefix = String(ref || "").toUpperCase().split("-")[0];
      const parent = SECONDARY_PARENT_STATE[prefix] || prefix;
      if (valid.has(parent)) found.add(parent);
    }
    const region = normalize(route?.region);
    for (const state of states || []) {
      if (new RegExp(`(?:^| )${normalize(state.name)}(?: |$)`).test(region) || new RegExp(`(?:^| )${state.uf}(?: |$)`).test(region)) found.add(state.uf);
    }
    return [...found];
  }

  function groupIconicRoutes(routes, states = []) {
    const br = [], international = [], stateGroups = new Map();
    const stateByUf = new Map((states || []).map(state => [state.uf, state]));
    for (const route of routes || []) {
      const kind = routeKind(route);
      if (kind === "br") { br.push(route); continue; }
      if (kind === "international") { international.push(route); continue; }
      const codes = stateCodesForRoute(route, states);
      const key = codes.length === 1 ? codes[0] : codes.length > 1 ? "INTERESTADUAIS" : "REGIONAIS";
      const name = codes.length === 1 ? (stateByUf.get(codes[0])?.name || codes[0]) : codes.length > 1 ? "Interestaduais" : "Regionais / estado não identificado";
      if (!stateGroups.has(key)) stateGroups.set(key, { key, name, routes: [] });
      stateGroups.get(key).routes.push(route);
    }
    const sortRoutes = values => values.sort((a, b) => routeFamilyPriority(a) - routeFamilyPriority(b) || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { numeric: true }));
    sortRoutes(br);
    sortRoutes(international);
    const statesSorted = [...stateGroups.values()].sort((a, b) => b.routes.length - a.routes.length || a.name.localeCompare(b.name, "pt-BR"));
    statesSorted.forEach(group => sortRoutes(group.routes));
    return { br, states: statesSorted, international };
  }

  function addStyles(win) {
    if (win.document.getElementById("achievementOrganizationHotfixStyles")) return;
    const style = win.document.createElement("style");
    style.id = "achievementOrganizationHotfixStyles";
    style.textContent = `
      .iconic-organized-section{display:grid;gap:8px;margin:0 0 16px;min-width:0}
      .iconic-organized-title{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:7px 2px 4px;border-bottom:1px solid rgba(47,109,80,.18)}
      .iconic-organized-title strong{font-size:.78rem}.iconic-organized-title span{font-size:.68rem;opacity:.65}
      .iconic-state-group{display:grid;gap:7px;margin:2px 0 7px}
      .iconic-state-title{font-size:.7rem;font-weight:700;opacity:.72;padding:2px 2px 0}
      .iconic-state-cards{display:grid;gap:8px}
    `;
    win.document.head.appendChild(style);
  }

  function makeCityCard(win, item) {
    const card = win.document.createElement("button");
    card.type = "button";
    card.className = "achievement-card";
    card.innerHTML = `<span class="achievement-icon">●</span><div><strong>${escapeHtml(item.city || item.label)}</strong><small>${escapeHtml(item.tripName || "Trajeto cruzado")}${item.date ? ` · ${formatDate(item.date)}` : ""}</small></div>`;
    card.addEventListener("click", () => win.focusCityAchievement?.(item));
    win.MinhasViagensCityFlags?.decorate?.(card.querySelector(".achievement-icon"), item);
    return card;
  }

  function renderCrossedCityGroups(win) {
    const appState = win.state;
    const els = win.els;
    if (!appState || !els || appState.achievementView !== "cities" || appState.cityAchievementMode !== "crossed") return;
    const destinations = destinationCities(appState.trips || []);
    const crossed = crossedCities(appState.trips || [], destinations);
    const groups = win.MinhasViagensAchievements?.groupCities?.(crossed) || [];
    const header = els.cityAchievementHeader;
    const list = els.cityAchievementList;
    if (!header || !list) return;

    const crossedTab = els.cityAchievementsView?.querySelector?.('[data-city-mode="crossed"] span');
    if (crossedTab) crossedTab.textContent = String(crossed.length);

    const selected = groups.find(group => group.key === appState.achievementStateKey);
    if (appState.achievementStateKey && !selected) appState.achievementStateKey = null;
    header.innerHTML = "";
    list.innerHTML = "";

    if (selected) {
      const back = win.document.createElement("button");
      back.type = "button";
      back.className = "achievement-back-btn";
      back.textContent = "← Voltar aos estados e países";
      back.addEventListener("click", () => { appState.achievementStateKey = null; win.renderAchievements?.(); });
      header.appendChild(back);
      const title = win.document.createElement("div");
      title.className = "achievement-browser-title";
      title.innerHTML = `<h2>${escapeHtml(selected.name)}</h2><span>${selected.cities.length} ${selected.cities.length === 1 ? "cidade" : "cidades"}</span>`;
      header.appendChild(title);
      list.classList.remove("state-achievement-grid");
      selected.cities.forEach(item => list.appendChild(makeCityCard(win, item)));
      return;
    }

    header.innerHTML = `<div class="achievement-browser-title"><h2>Cidades cruzadas por estado e país</h2><span>${crossed.length} ${crossed.length === 1 ? "cidade" : "cidades"}</span></div>`;
    if (!groups.length) {
      list.classList.remove("state-achievement-grid");
      list.innerHTML = '<p class="empty">Nenhuma cidade cruzada por um trajeto ainda.</p>';
      return;
    }
    list.classList.add("state-achievement-grid");
    for (const group of groups) {
      const card = win.document.createElement("button");
      card.type = "button";
      card.className = "state-achievement-card";
      const flag = group.flagUrl
        ? `<img src="${escapeHtml(group.flagUrl)}" alt="Bandeira de ${escapeHtml(group.name)}" loading="lazy"><span class="state-achievement-icon-fallback hidden">${escapeHtml(group.code || group.uf)}</span>`
        : `<span class="state-achievement-icon-fallback">${escapeHtml(group.code || group.uf)}</span>`;
      card.innerHTML = `<span class="state-achievement-icon">${flag}</span><strong>${escapeHtml(group.name)}</strong><small>${group.cities.length} ${group.cities.length === 1 ? "cidade" : "cidades"}</small>`;
      card.querySelector("img")?.addEventListener("error", () => {
        card.querySelector("img")?.classList.add("hidden");
        card.querySelector(".state-achievement-icon-fallback")?.classList.remove("hidden");
      });
      card.addEventListener("click", () => { appState.achievementStateKey = group.key; win.renderAchievements?.(); });
      list.appendChild(card);
    }
  }

  function section(win, title, count) {
    const wrap = win.document.createElement("section");
    wrap.className = "iconic-organized-section";
    const head = win.document.createElement("div");
    head.className = "iconic-organized-title";
    head.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${count} ${count === 1 ? "rota" : "rotas"}</span>`;
    wrap.appendChild(head);
    return wrap;
  }

  function organizeIconicContainer(win, container) {
    const api = win.MinhasViagensIconicRoutes;
    if (!api || !container) return;
    const cards = [...container.querySelectorAll(":scope > .iconic-route-card")];
    if (!cards.length) return;
    const routeById = new Map((api.routes || api.catalog?.routes || []).map(route => [route.id, route]));
    const cardById = new Map(cards.map((card, index) => [card.dataset.iconicRoute, { card, index }]));
    const grouped = groupIconicRoutes(cards.map(card => routeById.get(card.dataset.iconicRoute)).filter(Boolean), win.MinhasViagensAchievements?.states || []);
    container.innerHTML = "";

    const appendCards = (host, routes) => {
      for (const route of routes) {
        const entry = cardById.get(route.id);
        if (entry) host.appendChild(entry.card);
      }
    };

    if (grouped.br.length) {
      const wrap = section(win, "BRs e rotas nacionais", grouped.br.length);
      appendCards(wrap, grouped.br);
      container.appendChild(wrap);
    }

    const stateCount = grouped.states.reduce((sum, group) => sum + group.routes.length, 0);
    if (stateCount) {
      const wrap = section(win, "Estaduais e regionais", stateCount);
      for (const group of grouped.states) {
        const stateWrap = win.document.createElement("div");
        stateWrap.className = "iconic-state-group";
        const title = win.document.createElement("div");
        title.className = "iconic-state-title";
        title.textContent = `${group.name} · ${group.routes.length}`;
        const cardsHost = win.document.createElement("div");
        cardsHost.className = "iconic-state-cards";
        appendCards(cardsHost, group.routes);
        stateWrap.append(title, cardsHost);
        wrap.appendChild(stateWrap);
      }
      container.appendChild(wrap);
    }

    if (grouped.international.length) {
      const wrap = section(win, "Internacionais", grouped.international.length);
      const ordered = [...grouped.international].sort((a, b) => {
        const aEntry = cardById.get(a.id), bEntry = cardById.get(b.id);
        return (aEntry?.index ?? 9999) - (bEntry?.index ?? 9999);
      });
      appendCards(wrap, ordered);
      container.appendChild(wrap);
    }
  }

  function install(win) {
    let attempts = 0;
    const timer = win.setInterval(() => {
      attempts += 1;
      if (win.__mvAchievementOrganizationInstalled) { win.clearInterval(timer); return; }
      const ready = win.MinhasViagensCrossedCitiesV0147 && win.MinhasViagensIconicRoutes && win.state && win.els && typeof win.renderAchievements === "function";
      if (!ready) {
        if (attempts > 600) win.clearInterval(timer);
        return;
      }
      win.clearInterval(timer);
      win.__mvAchievementOrganizationInstalled = true;
      addStyles(win);

      const baseRenderAchievements = win.renderAchievements;
      win.renderAchievements = function renderAchievementsOrganized() {
        const result = baseRenderAchievements.apply(this, arguments);
        renderCrossedCityGroups(win);
        return result;
      };

      const iconicApi = win.MinhasViagensIconicRoutes;
      const baseIconicRender = iconicApi.renderAchievements.bind(iconicApi);
      iconicApi.renderAchievements = async function renderIconicAchievementsOrganized() {
        const result = await baseIconicRender();
        organizeIconicContainer(win, win.els?.iconicAchievementList);
        organizeIconicContainer(win, win.els?.iconicOtherList);
        return result;
      };

      win.renderAchievements();
      iconicApi.renderAchievements().catch(error => console.warn("Não foi possível reorganizar rotas icônicas", error));
      console.info("Minhas Viagens: organização de cidades cruzadas e rotas icônicas aplicada.");
    }, 50);
  }

  return { normalize, cityIdentity, destinationCities, crossedCities, routeKind, routeFamilyPriority, stateCodesForRoute, groupIconicRoutes, install };
});
