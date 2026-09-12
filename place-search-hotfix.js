(() => {
  "use strict";

  const APP_VERSION = "0.11.1";
  const CITY_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
  const DESTINATION_ENDPOINT = "https://photon.komoot.io/api";
  const CITY_PASS_RADIUS_KM = 3;
  const NEIGHBOR_CODES = new Set(["AR", "UY", "PY", "BO", "PE", "CL", "CO", "VE", "GY", "SR", "GF"]);
  const DESTINATION_KEYS = new Set([
    "tourism", "amenity", "leisure", "natural", "historic", "man_made",
    "aeroway", "railway", "shop", "office", "craft", "sport", "place"
  ]);
  const ADMINISTRATIVE_PLACE_VALUES = new Set([
    "city", "town", "village", "municipality", "state", "country", "county",
    "suburb", "neighbourhood", "borough"
  ]);
  const destinationHint = /\b(camping|camp|cachoeira|parque|pousada|hotel|hostel|museu|fazenda|mirante|praia|reserva|sitio|gruta|caverna|estacao|aeroporto|restaurante|termas?)\b/i;

  if (typeof window.fetch !== "function" || typeof placeFromCityResult !== "function" ||
      typeof cityConquestsForTrip !== "function") return;

  const previousFetch = window.fetch.bind(window);
  const nativeFetch = window.__mvNativeFetch || previousFetch;
  const basePlaceFromCityResult = placeFromCityResult;
  const baseCityConquestsForTrip = cityConquestsForTrip;
  const destinationCache = new Map();
  const municipalityCache = new Map();

  const stats = window.MinhasViagensPlaceSearchStats = {
    version: APP_VERSION,
    searches: 0,
    destinationResults: 0,
    failures: 0,
    lastError: ""
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function categoryLabel(properties) {
    const value = String(properties?.osm_value || "").toLowerCase();
    const key = String(properties?.osm_key || "").toLowerCase();
    const labels = {
      camp_site: "Camping", caravan_site: "Camping", hotel: "Hotel", hostel: "Hostel",
      guest_house: "Pousada", chalet: "Hospedagem", museum: "Museu", attraction: "Atração",
      viewpoint: "Mirante", waterfall: "Cachoeira", cave_entrance: "Caverna",
      nature_reserve: "Reserva natural", park: "Parque", beach: "Praia",
      restaurant: "Restaurante", aerodrome: "Aeroporto", station: "Estação"
    };
    return labels[value] || ({ tourism: "Destino", natural: "Local natural", historic: "Local histórico" }[key] || "Local");
  }

  function isDestinationFeature(feature) {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    const key = String(properties.osm_key || "").toLowerCase();
    const value = String(properties.osm_value || "").toLowerCase();
    if (!properties.name || !Array.isArray(coordinates) || coordinates.length < 2) return false;
    if (!Number.isFinite(Number(coordinates[0])) || !Number.isFinite(Number(coordinates[1]))) return false;
    if (!DESTINATION_KEYS.has(key)) return false;
    if (key === "place" && ADMINISTRATIVE_PLACE_VALUES.has(value)) return false;
    return true;
  }

  function municipalityIdentity(name, state, countryCode) {
    return `${normalize(name)}|${normalize(state)}|${String(countryCode || "").toUpperCase()}`;
  }

  async function resolveMunicipality(properties, signal) {
    const city = String(properties?.city || "").trim();
    if (!city) return null;
    const state = String(properties?.state || "").trim();
    const countryCode = String(properties?.countrycode || "").toUpperCase();
    const key = municipalityIdentity(city, state, countryCode);
    if (municipalityCache.has(key)) return municipalityCache.get(key);

    const url = `${CITY_ENDPOINT}?name=${encodeURIComponent(city)}&count=12&language=pt&format=json`;
    const response = await previousFetch(url, { signal, cache: "force-cache" });
    if (!response.ok) return null;
    const data = await response.json();
    const candidates = (Array.isArray(data?.results) ? data.results : []).filter(item =>
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) &&
      normalize(item.name) === normalize(city) &&
      (!countryCode || String(item.country_code || "").toUpperCase() === countryCode)
    );
    const selected = candidates.find(item => !state || normalize(item.admin1) === normalize(state)) || candidates[0];
    if (!selected) return null;
    const municipality = {
      label: [selected.name, selected.admin1, selected.country].filter(Boolean).join(", "),
      city: selected.name,
      region: selected.admin1 || state,
      country: selected.country || properties.country || "",
      countryCode: selected.country_code || countryCode,
      lat: Number(selected.latitude),
      lng: Number(selected.longitude),
      geonamesId: selected.id || null
    };
    municipalityCache.set(key, municipality);
    return municipality;
  }

  async function destinationResult(feature, signal) {
    const properties = feature.properties || {};
    const coordinates = feature.geometry.coordinates;
    let municipality = null;
    try { municipality = await resolveMunicipality(properties, signal); }
    catch (error) { if (error?.name === "AbortError") throw error; }
    const city = municipality?.city || properties.city || properties.county || "";
    const state = municipality?.region || properties.state || "";
    const country = municipality?.country || properties.country || "";
    const category = categoryLabel(properties);
    return {
      id: `osm-${properties.osm_type || "X"}-${properties.osm_id || `${coordinates[1]}-${coordinates[0]}`}`,
      name: properties.name,
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
      admin1: [category, city, state].filter(Boolean).join(" · "),
      country,
      country_code: municipality?.countryCode || properties.countrycode || "",
      _mvPlaceType: "destination",
      _mvDestinationCategory: category,
      _mvState: state,
      _mvMunicipality: municipality,
      _mvMunicipalityName: city,
      _mvOsmType: properties.osm_type || "",
      _mvOsmId: properties.osm_id || null
    };
  }

  async function searchDestinations(query, signal) {
    const cacheKey = normalize(query);
    if (destinationCache.has(cacheKey)) return destinationCache.get(cacheKey);
    const url = new URL(DESTINATION_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "12");
    const response = await nativeFetch(url.href, { signal, cache: "default", mode: "cors" });
    if (!response.ok) throw new Error(`Busca de locais ${response.status}`);
    const data = await response.json();
    const features = (Array.isArray(data?.features) ? data.features : [])
      .map((feature, index) => ({ feature, index }))
      .filter(item => isDestinationFeature(item.feature))
      .sort((a, b) => {
        const codeA = String(a.feature.properties?.countrycode || "").toUpperCase();
        const codeB = String(b.feature.properties?.countrycode || "").toUpperCase();
        const group = code => code === "BR" ? 0 : NEIGHBOR_CODES.has(code) ? 1 : 2;
        return group(codeA) - group(codeB) || a.index - b.index;
      })
      .slice(0, 6)
      .map(item => item.feature);
    const results = await Promise.all(features.map(feature => destinationResult(feature, signal)));
    destinationCache.set(cacheKey, results);
    if (destinationCache.size > 80) destinationCache.delete(destinationCache.keys().next().value);
    stats.searches += 1;
    stats.destinationResults += results.length;
    stats.lastError = "";
    return results;
  }

  function mergeResults(cities, destinations, query) {
    const output = [];
    const seen = new Set();
    const append = items => {
      for (const item of items || []) {
        if (output.length >= 10) break;
        const key = item?._mvPlaceType === "destination"
          ? String(item.id)
          : `${normalize(item?.name)}|${normalize(item?.admin1)}|${String(item?.country_code || "").toUpperCase()}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        output.push(item);
      }
    };
    if (destinationHint.test(normalize(query))) {
      append(destinations);
      append(cities);
    } else {
      append((cities || []).slice(0, 4));
      append(destinations);
      append((cities || []).slice(4));
    }
    return output;
  }

  window.fetch = async function placeSearchFetch(input, init = {}) {
    const requestUrl = typeof input === "string" ? input : input?.url;
    if (!requestUrl || !requestUrl.startsWith(CITY_ENDPOINT)) return previousFetch(input, init);
    const parsed = new URL(requestUrl, location.href);
    const query = parsed.searchParams.get("name")?.trim() || "";
    if (query.length < 3) return previousFetch(input, init);

    const cityPromise = previousFetch(input, init).then(async response => {
      if (!response.ok) throw new Error(`Busca de cidades ${response.status}`);
      const data = await response.json();
      return Array.isArray(data?.results) ? data.results : [];
    });
    const destinationPromise = searchDestinations(query, init?.signal || null).catch(error => {
      if (error?.name === "AbortError") throw error;
      stats.failures += 1;
      stats.lastError = String(error?.message || error || "Busca de locais indisponível");
      return [];
    });

    const [cityOutcome, destinationOutcome] = await Promise.allSettled([cityPromise, destinationPromise]);
    if (init?.signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    if (cityOutcome.status === "rejected" && destinationOutcome.status === "rejected") throw cityOutcome.reason;
    const cities = cityOutcome.status === "fulfilled" ? cityOutcome.value : [];
    const destinations = destinationOutcome.status === "fulfilled" ? destinationOutcome.value : [];
    return new Response(JSON.stringify({ results: mergeResults(cities, destinations, query) }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  };

  placeFromCityResult = function placeFromCityOrDestination(result) {
    if (result?._mvPlaceType !== "destination") return basePlaceFromCityResult(result);
    const municipality = result._mvMunicipality ? { ...result._mvMunicipality } : null;
    const state = municipality?.region || result._mvState || "";
    const country = municipality?.country || result.country || "";
    const city = municipality?.city || result._mvMunicipalityName || "";
    return {
      label: [result.name, city, state, country].filter((value, index, values) => value && values.indexOf(value) === index).join(", "),
      name: result.name,
      city: result.name,
      region: state,
      country,
      countryCode: municipality?.countryCode || result.country_code || "",
      lat: Number(result.latitude),
      lng: Number(result.longitude),
      geonamesId: result.id || null,
      placeType: "destination",
      destinationCategory: result._mvDestinationCategory || "Local",
      municipality,
      osmType: result._mvOsmType || "",
      osmId: result._mvOsmId || null
    };
  };

  function routePassesMunicipality(trip, municipality, radiusKm = CITY_PASS_RADIUS_KM) {
    const target = [Number(municipality?.lat), Number(municipality?.lng)];
    if (!target.every(Number.isFinite)) return false;
    const route = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (!Array.isArray(route) || route.length < 2) return false;
    for (let index = 1; index < route.length; index++) {
      const a = route[index - 1], b = route[index];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      if (typeof pointSegmentDistanceKm === "function" && pointSegmentDistanceKm(target, a, b) <= radiusKm) return true;
    }
    return false;
  }

  function isDestinationPlace(place) {
    return place?.placeType === "destination";
  }

  cityConquestsForTrip = function cityConquestsIncludingPassedDestinationCities(trip) {
    const regularTrip = {
      ...trip,
      startPlace: isDestinationPlace(trip?.startPlace) ? null : trip?.startPlace,
      stopPlaces: (trip?.stopPlaces || []).filter(place => !isDestinationPlace(place)),
      endPlace: isDestinationPlace(trip?.endPlace) ? null : trip?.endPlace
    };
    const cities = baseCityConquestsForTrip(regularTrip);
    const seen = new Set(cities.map(city => municipalityIdentity(city.city, city.region, city.countryCode)));
    const destinations = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(isDestinationPlace);
    for (const destination of destinations) {
      const municipality = destination.municipality;
      if (!municipality || !routePassesMunicipality(trip, municipality)) continue;
      const key = municipalityIdentity(municipality.city, municipality.region, municipality.countryCode);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cities.push({
        label: municipality.label || [municipality.city, municipality.region, municipality.country].filter(Boolean).join(", "),
        city: municipality.city,
        region: municipality.region || "",
        country: municipality.country || "",
        countryCode: municipality.countryCode || "",
        lat: Number.isFinite(Number(municipality.lat)) ? Number(municipality.lat) : undefined,
        lng: Number.isFinite(Number(municipality.lng)) ? Number(municipality.lng) : undefined
      });
    }
    return cities;
  };

  window.MinhasViagensPlaceSearch = {
    version: APP_VERSION,
    cityPassRadiusKm: CITY_PASS_RADIUS_KM,
    stats,
    searchDestinations,
    isDestinationFeature,
    isDestinationPlace,
    routePassesMunicipality
  };

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
  console.info(`Minhas Viagens ${APP_VERSION}: busca de destinos específicos e conquista municipal por passagem habilitadas.`);
})();
