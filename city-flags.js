(function (root) {
  "use strict";

  const CACHE_KEY = "minhas-viagens-city-flags-v1";
  const MISS_TTL = 7 * 24 * 60 * 60 * 1000;
  const API_URL = "https://www.wikidata.org/w/api.php";
  const pending = new Map();
  const observed = new WeakMap();
  let observer = null;

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cacheKey(city) {
    return [city?.city || city?.label, city?.region, city?.countryCode || city?.country].map(normalize).join("|");
  }

  function readCache() {
    try { return JSON.parse(root.localStorage?.getItem(CACHE_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeCache(cache) {
    try {
      const entries = Object.entries(cache).sort((a, b) => Number(b[1]?.checkedAt || 0) - Number(a[1]?.checkedAt || 0)).slice(0, 800);
      root.localStorage?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {}
  }

  function apiUrl(params) {
    const query = new URLSearchParams({ ...params, format: "json", origin: "*" });
    return `${API_URL}?${query}`;
  }

  function coordinateFromClaims(claims) {
    const value = claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    const lat = Number(value?.latitude), lng = Number(value?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function distanceKm(a, b) {
    const radians = degrees => degrees * Math.PI / 180;
    const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat), lat2 = radians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function candidateScore(result, city, descriptor) {
    const wanted = normalize(city?.city || city?.label);
    const label = normalize(result?.label);
    const description = normalize(result?.description);
    let score = label === wanted ? 14 : (label.includes(wanted) || wanted.includes(label) ? 5 : -8);
    if (/municipio|municipality|cidade|city|capital/.test(description)) score += 4;
    if (/aeroporto|airport|estacao|station|desambiguacao|disambiguation|mesorregiao|microrregiao/.test(description)) score -= 14;
    if (descriptor?.name && description.includes(normalize(descriptor.name))) score += 7;
    const country = normalize(city?.country);
    if (country && description.includes(country)) score += 3;
    return score;
  }

  function flagFilename(claims) {
    for (const claim of claims?.P41 || []) {
      const value = claim?.mainsnak?.datavalue?.value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function commonsFlagUrl(filename) {
    return filename ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=160` : "";
  }

  async function lookupFlag(city) {
    const cityName = String(city?.city || city?.label || "").trim();
    if (!cityName || typeof root.fetch !== "function") return "";
    const descriptor = root.MinhasViagensAchievements?.groupForCity(city);
    const searchResponse = await root.fetch(apiUrl({
      action: "wbsearchentities", search: cityName, language: "pt", uselang: "pt", type: "item", limit: "8"
    }));
    if (!searchResponse.ok) throw new Error(`Wikidata search ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const candidates = (searchData.search || []).map(result => ({ result, score: candidateScore(result, city, descriptor) }))
      .filter(candidate => candidate.score >= 5).sort((a, b) => b.score - a.score).slice(0, 5);
    if (!candidates.length) return "";

    const entityResponse = await root.fetch(apiUrl({
      action: "wbgetentities", ids: candidates.map(candidate => candidate.result.id).join("|"), props: "claims"
    }));
    if (!entityResponse.ok) throw new Error(`Wikidata entities ${entityResponse.status}`);
    const entityData = await entityResponse.json();
    const savedPoint = { lat: Number(city?.lat), lng: Number(city?.lng) };
    const hasSavedPoint = Number.isFinite(savedPoint.lat) && Number.isFinite(savedPoint.lng);

    for (const candidate of candidates) {
      const claims = entityData.entities?.[candidate.result.id]?.claims;
      const filename = flagFilename(claims);
      if (!filename) continue;
      const point = coordinateFromClaims(claims);
      if (hasSavedPoint && point && distanceKm(savedPoint, point) > 120) continue;
      return commonsFlagUrl(filename);
    }
    return "";
  }

  function flagForCity(city) {
    const key = cacheKey(city);
    if (!key) return Promise.resolve("");
    const cache = readCache();
    const cached = cache[key];
    if (cached?.url) return Promise.resolve(cached.url);
    if (cached?.missing && Date.now() - Number(cached.checkedAt || 0) < MISS_TTL) return Promise.resolve("");
    if (pending.has(key)) return pending.get(key);

    const request = lookupFlag(city).then(url => {
      const nextCache = readCache();
      nextCache[key] = { url, missing: !url, checkedAt: Date.now() };
      writeCache(nextCache);
      return url;
    }).catch(error => {
      console.warn(`Bandeira municipal de ${city?.city || city?.label || "cidade"} indisponível`, error);
      return "";
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  async function loadInto(element, city) {
    const url = await flagForCity(city);
    if (!url || !element?.isConnected) return;
    const image = document.createElement("img");
    image.alt = `Bandeira de ${city?.city || city?.label || "cidade"}`;
    image.loading = "lazy";
    image.src = url;
    image.addEventListener("load", () => element.classList.add("has-city-flag"), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    element.appendChild(image);
  }

  function decorate(element, city) {
    if (!element) return;
    element.classList.add("city-achievement-icon");
    if (typeof root.IntersectionObserver !== "function") {
      loadInto(element, city);
      return;
    }
    if (!observer) observer = new root.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const item = observed.get(entry.target);
        if (item) loadInto(entry.target, item);
      }
    }, { rootMargin: "100px" });
    observed.set(element, city);
    observer.observe(element);
  }

  root.MinhasViagensCityFlags = { flagForCity, decorate, lookupFlag, cacheKey };
})(typeof window !== "undefined" ? window : globalThis);
