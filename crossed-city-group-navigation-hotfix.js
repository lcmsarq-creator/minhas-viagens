(() => {
  "use strict";

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
      for (const place of [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean)) {
        const city = {
          label: place.label || [place.city, place.region, place.country].filter(Boolean).join(", "),
          city: place.city || place.label || "",
          region: place.region || "",
          country: place.country || "",
          countryCode: place.countryCode || "",
          lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : undefined,
          lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : undefined
        };
        const key = cityIdentity(city);
        if (city.city && !out.has(key)) out.set(key, city);
      }
    }
    return [...out.values()];
  }

  function crossedCities(trips) {
    const destinationKeys = new Set(destinationCities(trips).map(cityIdentity));
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

  function groups() {
    const state = window.state;
    if (!state) return [];
    return window.MinhasViagensAchievements?.groupCities?.(crossedCities(state.trips || [])) || [];
  }

  function cityCard(item) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "achievement-card";
    card.innerHTML = `<span class="achievement-icon">●</span><div><strong>${escapeHtml(item.city || item.label)}</strong><small>${escapeHtml(item.tripName || "Trajeto cruzado")}${item.date ? ` · ${formatDate(item.date)}` : ""}</small></div>`;
    card.addEventListener("click", () => window.focusCityAchievement?.(item));
    window.MinhasViagensCityFlags?.decorate?.(card.querySelector(".achievement-icon"), item);
    return card;
  }

  function groupCard(group) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "state-achievement-card";
    card.dataset.crossedGroupKey = group.key;
    const flag = group.flagUrl
      ? `<img src="${escapeHtml(group.flagUrl)}" alt="Bandeira de ${escapeHtml(group.name)}" loading="lazy"><span class="state-achievement-icon-fallback hidden">${escapeHtml(group.code || group.uf)}</span>`
      : `<span class="state-achievement-icon-fallback">${escapeHtml(group.code || group.uf)}</span>`;
    card.innerHTML = `<span class="state-achievement-icon">${flag}</span><strong>${escapeHtml(group.name)}</strong><small>${group.cities.length} ${group.cities.length === 1 ? "cidade" : "cidades"}</small>`;
    card.querySelector("img")?.addEventListener("error", () => {
      card.querySelector("img")?.classList.add("hidden");
      card.querySelector(".state-achievement-icon-fallback")?.classList.remove("hidden");
    });
    return card;
  }

  function renderOverview() {
    const state = window.state, els = window.els;
    if (!state || !els) return;
    state.achievementStateKey = null;
    const values = groups();
    const total = values.reduce((sum, group) => sum + group.cities.length, 0);
    els.cityAchievementHeader.innerHTML = `<div class="achievement-browser-title"><h2>Cidades cruzadas por estado e país</h2><span>${total} ${total === 1 ? "cidade" : "cidades"}</span></div>`;
    els.cityAchievementList.innerHTML = "";
    els.cityAchievementList.classList.add("state-achievement-grid");
    if (!values.length) {
      els.cityAchievementList.classList.remove("state-achievement-grid");
      els.cityAchievementList.innerHTML = '<p class="empty">Nenhuma cidade cruzada por um trajeto ainda.</p>';
      return;
    }
    values.forEach(group => els.cityAchievementList.appendChild(groupCard(group)));
  }

  function renderGroup(groupKey) {
    const state = window.state, els = window.els;
    if (!state || !els) return;
    const group = groups().find(item => item.key === groupKey);
    if (!group) { renderOverview(); return; }
    state.achievementStateKey = group.key;
    els.cityAchievementHeader.innerHTML = "";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "achievement-back-btn";
    back.textContent = "← Voltar aos estados e países";
    back.addEventListener("click", renderOverview);
    els.cityAchievementHeader.appendChild(back);
    const title = document.createElement("div");
    title.className = "achievement-browser-title";
    title.innerHTML = `<h2>${escapeHtml(group.name)}</h2><span>${group.cities.length} ${group.cities.length === 1 ? "cidade" : "cidades"}</span>`;
    els.cityAchievementHeader.appendChild(title);
    els.cityAchievementList.innerHTML = "";
    els.cityAchievementList.classList.remove("state-achievement-grid");
    group.cities.forEach(item => els.cityAchievementList.appendChild(cityCard(item)));
  }

  document.addEventListener("click", event => {
    const state = window.state, els = window.els;
    if (!state || !els || state.achievementView !== "cities" || state.cityAchievementMode !== "crossed") return;
    const card = event.target?.closest?.("#cityAchievementList .state-achievement-card");
    if (!card) return;
    const availableGroups = groups();
    const explicitKey = card.dataset.crossedGroupKey;
    const groupName = card.querySelector("strong")?.textContent?.trim() || "";
    const group = availableGroups.find(item => item.key === explicitKey) || availableGroups.find(item => item.name === groupName);
    if (!group) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderGroup(group.key);
  }, true);

  window.MinhasViagensCrossedCityGroupNavigation = Object.freeze({ groups, renderOverview, renderGroup });
})();
