(() => {
  "use strict";

  const APP_VERSION = "0.10.0";
  const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
  const IBGE_MUNICIPALITIES_ENDPOINT = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";
  const BORDER_COUNTRIES = new Set(["AR", "UY", "PY", "BO", "PE", "CL", "CO", "VE", "GY", "SR", "GF"]);
  const nativeFetch = window.fetch.bind(window);
  const brazilGeocodeCache = new Map();
  let brazilCitiesPromise = null;

  const BRAZIL_STATE_UF = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
    "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
    paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
    "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO"
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/\s+/g, "");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = previous[j];
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        diagonal = above;
      }
    }
    return previous[b.length];
  }

  function nameScore(name, query) {
    const n = normalize(name);
    const q = normalize(query);
    if (!n || !q) return 999;
    if (n === q) return 0;
    if (n.startsWith(q)) return 4;
    const tokens = n.split(" ").filter(Boolean);
    if (tokens.some(token => token === q)) return 6;
    if (n.includes(q)) return 8;
    const nc = compact(n), qc = compact(q);
    if (nc.includes(qc)) return 10;

    const queryTokens = q.split(" ").filter(Boolean);
    const candidateParts = new Set(tokens);
    for (let start = 0; start < tokens.length; start++) {
      let phrase = "";
      for (let end = start; end < Math.min(tokens.length, start + Math.max(3, queryTokens.length + 1)); end++) {
        phrase += tokens[end];
        candidateParts.add(phrase);
      }
    }
    candidateParts.add(nc);

    let bestRatio = 1;
    for (const part of candidateParts) {
      const distance = levenshtein(compact(part), qc);
      bestRatio = Math.min(bestRatio, distance / Math.max(compact(part).length, qc.length, 1));
    }
    return bestRatio <= .46 ? 20 + bestRatio * 50 : 999;
  }

  function stateFromIbge(item) {
    return item?.microrregiao?.mesorregiao?.UF ||
      item?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF || null;
  }

  async function loadBrazilCities() {
    if (brazilCitiesPromise) return brazilCitiesPromise;
    brazilCitiesPromise = nativeFetch(IBGE_MUNICIPALITIES_ENDPOINT, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`IBGE ${response.status}`);
        return response.json();
      })
      .then(items => (Array.isArray(items) ? items : []).map(item => {
        const uf = stateFromIbge(item);
        return {
          id: item.id,
          name: item.nome,
          stateCode: uf?.sigla || "",
          stateName: uf?.nome || ""
        };
      }).filter(item => item.name))
      .catch(error => {
        brazilCitiesPromise = null;
        throw error;
      });
    return brazilCitiesPromise;
  }

  async function openMeteoSearch(term, count = 20, signal = null) {
    const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(term)}&count=${count}&language=pt&format=json`;
    const response = await nativeFetch(url, { signal });
    if (!response.ok) throw new Error(`Geocoding ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  function resultKey(item) {
    return String(item.id || `${normalize(item.name)}|${normalize(item.admin1)}|${String(item.country_code || "").toUpperCase()}`);
  }

  function rankResults(results, query) {
    return [...results]
      .filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
      .map(item => ({ item, score: nameScore(item.name, query) }))
      .filter(entry => entry.score < 999)
      .sort((a, b) => a.score - b.score || String(a.item.name).localeCompare(String(b.item.name), "pt-BR"))
      .map(entry => entry.item);
  }

  async function resolveBrazilCity(candidate, signal) {
    if (brazilGeocodeCache.has(candidate.id)) return brazilGeocodeCache.get(candidate.id);
    const results = await openMeteoSearch(candidate.name, 12, signal);
    const exact = results.filter(item => String(item.country_code || "").toUpperCase() === "BR" && normalize(item.name) === normalize(candidate.name));
    const stateMatch = exact.find(item =>
      normalize(item.admin1) === normalize(candidate.stateName) ||
      String(item.admin1 || "").toUpperCase() === candidate.stateCode
    );
    const selected = stateMatch || exact[0] || results.find(item => String(item.country_code || "").toUpperCase() === "BR") || null;
    if (!selected) return null;
    const normalized = {
      ...selected,
      name: candidate.name,
      admin1: candidate.stateName || selected.admin1,
      country: selected.country || "Brasil",
      country_code: "BR",
      id: selected.id || `ibge-${candidate.id}`
    };
    brazilGeocodeCache.set(candidate.id, normalized);
    return normalized;
  }

  async function enhancedCityResults(query, signal) {
    const [cities, primaryResults] = await Promise.all([
      loadBrazilCities().catch(() => []),
      openMeteoSearch(query, 30, signal).catch(error => {
        if (error?.name === "AbortError") throw error;
        return [];
      })
    ]);

    const brazilCandidates = cities
      .map(city => ({ city, score: nameScore(city.name, query) }))
      .filter(entry => entry.score < 999)
      .sort((a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name, "pt-BR"))
      .slice(0, 6)
      .map(entry => entry.city);

    const resolvedBrazil = (await Promise.all(brazilCandidates.map(city =>
      resolveBrazilCity(city, signal).catch(error => {
        if (error?.name === "AbortError") throw error;
        return null;
      })
    ))).filter(Boolean);

    const directBrazil = rankResults(primaryResults.filter(item => String(item.country_code || "").toUpperCase() === "BR"), query);
    const brazilMap = new Map();
    [...resolvedBrazil, ...directBrazil].forEach(item => {
      const key = resultKey(item);
      if (!brazilMap.has(key)) brazilMap.set(key, item);
    });
    const brazil = rankResults([...brazilMap.values()], query).slice(0, 6);

    const extraTerms = normalize(query).split(" ").filter(token => token.length >= 4);
    const secondarySets = await Promise.all(extraTerms.slice(-2).map(term =>
      openMeteoSearch(term, 20, signal).catch(error => {
        if (error?.name === "AbortError") throw error;
        return [];
      })
    ));
    const allRemote = [...primaryResults, ...secondarySets.flat()];
    const remoteMap = new Map();
    allRemote.forEach(item => {
      const key = resultKey(item);
      if (!remoteMap.has(key)) remoteMap.set(key, item);
    });

    const neighbors = rankResults([...remoteMap.values()].filter(item => BORDER_COUNTRIES.has(String(item.country_code || "").toUpperCase())), query);
    const others = rankResults([...remoteMap.values()].filter(item => {
      const code = String(item.country_code || "").toUpperCase();
      return code && code !== "BR" && !BORDER_COUNTRIES.has(code);
    }), query);

    const output = [];
    const seen = new Set();
    const append = items => {
      for (const item of items) {
        const key = resultKey(item);
        if (seen.has(key) || output.length >= 10) continue;
        seen.add(key);
        output.push(item);
      }
    };
    append(brazil);
    append(neighbors);
    append(others);
    return output;
  }

  window.fetch = async function enhancedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url || !url.startsWith(GEOCODING_ENDPOINT)) return nativeFetch(input, init);
    const parsed = new URL(url, location.href);
    const query = parsed.searchParams.get("name")?.trim() || "";
    if (query.length < 2) return nativeFetch(input, init);
    try {
      const results = await enhancedCityResults(query, init?.signal || null);
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("Busca aprimorada de cidades indisponível; usando busca padrão", error);
      return nativeFetch(input, init);
    }
  };

  function ufForPlace(place) {
    const region = String(place?.region || "").trim();
    if (/^[A-Z]{2}$/i.test(region)) return region.toUpperCase();
    return BRAZIL_STATE_UF[normalize(region)] || "";
  }

  function compactPlaceLabel(place, fallback = "") {
    if (!place) {
      const parts = String(fallback || "").split(",").map(part => part.trim()).filter(Boolean);
      return parts.slice(0, 2).join(", ") || fallback;
    }
    const city = String(place.city || place.name || place.label || fallback).split(",")[0].trim();
    const countryCode = String(place.countryCode || "").toUpperCase();
    const isBrazil = countryCode === "BR" || normalize(place.country) === "brasil" || normalize(place.country) === "brazil";
    const region = isBrazil ? ufForPlace(place) : (/^[A-Z]{2,3}$/i.test(String(place.region || "").trim()) ? String(place.region).trim().toUpperCase() : "");
    return region ? `${city}, ${region}` : city;
  }

  function applyCompactTripLabels() {
    const trip = state.trips.find(item => item.id === state.activeTripDetailId);
    if (!trip) return;
    const rows = [...els.tripDetailContent.querySelectorAll(".trip-route > div")];
    rows.forEach(row => {
      const label = row.querySelector("span")?.textContent?.trim();
      const strong = row.querySelector("strong");
      if (!strong) return;
      if (label === "De:") strong.textContent = compactPlaceLabel(trip.startPlace, trip.startAddress);
      else if (label === "Para:") strong.textContent = compactPlaceLabel(trip.endPlace, trip.endAddress);
      else if (label === "Paradas:") strong.textContent = (trip.stopPlaces || []).map(place => compactPlaceLabel(place)).filter(Boolean).join(" → ");
    });
  }

  const originalRenderTripDetail = renderTripDetail;
  renderTripDetail = function renderTripDetailCompact() {
    originalRenderTripDetail();
    applyCompactTripLabels();
  };

  const originalRenderTrips = renderTrips;
  renderTrips = function renderTripsCleanMap() {
    const detailActive = Boolean(state.activeTripDetailId);
    document.body.classList.toggle("mv-trip-detail-active", detailActive);
    if (!detailActive && state.tripRoadLayer) closeTripRoadHighlight();
    originalRenderTrips();
    document.body.classList.toggle("mv-trip-detail-active", Boolean(state.activeTripDetailId));
  };

  function placeIdentity(place) {
    if (!place) return "";
    if (place.geonamesId) return `g:${place.geonamesId}`;
    return [normalize(place.city), normalize(place.region), normalize(place.country)].join("|");
  }

  function samePlace(a, b) {
    const ak = placeIdentity(a), bk = placeIdentity(b);
    return Boolean(ak && bk && ak === bk);
  }

  function safeProgress(trip, place, fallback) {
    if (!Number.isFinite(Number(place?.lat)) || !Number.isFinite(Number(place?.lng))) return fallback;
    try {
      const progress = nearestRouteProgress(trip, L.latLng(Number(place.lat), Number(place.lng)));
      return Number.isFinite(progress) ? progress : fallback;
    } catch {
      return fallback;
    }
  }

  function routingPointsPreservingWaypoints(trip, nextStart, nextStops, nextEnd, waypoints) {
    const newPlaces = [nextStart, ...nextStops, nextEnd];
    if (!waypoints.length) return newPlaces;

    const oldPlaces = [trip.startPlace, ...(trip.stopPlaces || []), trip.endPlace].filter(Boolean);
    const oldProgress = new Map();
    oldPlaces.forEach((place, index) => {
      const fallback = oldPlaces.length > 1 ? index / (oldPlaces.length - 1) : 0;
      oldProgress.set(placeIdentity(place), index === 0 ? 0 : index === oldPlaces.length - 1 ? 1 : safeProgress(trip, place, fallback));
    });

    const controls = newPlaces.map((place, index) => {
      if (index === 0) return { place, progress: 0 };
      if (index === newPlaces.length - 1) return { place, progress: 1 };
      const known = oldProgress.get(placeIdentity(place));
      const fallback = index / (newPlaces.length - 1);
      return { place, progress: Number.isFinite(known) ? known : safeProgress(trip, place, fallback) };
    });

    const epsilon = .0001;
    let previous = 0;
    for (let index = 1; index < controls.length - 1; index++) {
      const maximum = 1 - (controls.length - 1 - index) * epsilon;
      controls[index].progress = Math.min(maximum, Math.max(previous + epsilon, controls[index].progress));
      previous = controls[index].progress;
    }

    const waypointRecords = waypoints
      .filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
      .map(point => ({
        point,
        progress: Number.isFinite(Number(point.progress)) ? Number(point.progress) : safeProgress(trip, point, .5)
      }))
      .sort((a, b) => a.progress - b.progress);

    const routePoints = [controls[0].place];
    for (let index = 0; index < controls.length - 1; index++) {
      const left = controls[index].progress;
      const right = controls[index + 1].progress;
      waypointRecords
        .filter(record => record.progress > left + epsilon && record.progress < right - epsilon)
        .forEach(record => routePoints.push({ lat: Number(record.point.lat), lng: Number(record.point.lng) }));
      routePoints.push(controls[index + 1].place);
    }
    return routePoints;
  }

  async function saveEditedPlacesPreservingRoute(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const trip = state.trips.find(item => item.id === state.editingPlacesTripId);
    if (!trip) return closeEditPlacesDialog();
    if (!["carro", "moto"].includes(trip.mode)) {
      setEditPlacesMessage("O recálculo automático desta edição está disponível para carro e moto.");
      return;
    }
    if (!state.editStartPlace) {
      setEditPlacesMessage("Escolha uma cidade ou local válido para a partida.");
      els.editStartAddress.focus();
      return;
    }
    const incompleteStop = state.editStopPlaces.find(item => !item.place);
    if (incompleteStop) {
      setEditPlacesMessage("Selecione uma cidade ou local válido para cada parada, ou remova a parada vazia.");
      els.editStopsContainer.querySelector(`[data-stop-id="${incompleteStop.id}"] .stop-address`)?.focus();
      return;
    }
    if (!state.editEndPlace) {
      setEditPlacesMessage("Escolha uma cidade ou local válido para a chegada.");
      els.editEndAddress.focus();
      return;
    }

    const before = getAchievementSnapshot();
    const nextStart = { ...state.editStartPlace };
    const nextStops = state.editStopPlaces.map(item => ({ ...item.place }));
    const nextEnd = { ...state.editEndPlace };
    const endpointsUnchanged = samePlace(nextStart, trip.startPlace) && samePlace(nextEnd, trip.endPlace);
    const preservedWaypoints = endpointsUnchanged ? (trip.routeWaypoints || []).map(point => ({ ...point })) : [];
    const routePoints = routingPointsPreservingWaypoints(trip, nextStart, nextStops, nextEnd, preservedWaypoints);

    els.saveEditPlacesBtn.disabled = true;
    els.saveEditPlacesBtn.textContent = "Recalculando…";
    setEditPlacesMessage(preservedWaypoints.length ? "Preservando os ajustes manuais anteriores…" : "");

    try {
      const routes = await fetchOsrmRoute(routePoints, false);
      const route = routes[0];
      if (!route) throw new Error("Nenhuma rota encontrada");

      trip.startPlace = nextStart;
      trip.stopPlaces = nextStops;
      trip.endPlace = nextEnd;
      trip.startAddress = nextStart.label || nextStart.city || "";
      trip.endAddress = nextEnd.label || nextEnd.city || "";
      trip.routeWaypoints = preservedWaypoints;
      trip.routeSource = preservedWaypoints.length ? "osrm-adjusted" : "osrm";
      trip.routeAlternativeIndex = 0;
      applyRouteToTrip(trip, route);
      if (preservedWaypoints.length) {
        trip.routeWaypoints = preservedWaypoints.map(point => ({
          ...point,
          progress: nearestRouteProgress(trip, L.latLng(Number(point.lat), Number(point.lng)))
        }));
      }

      const newItems = newConquestsAgainstSnapshot(trip, before);
      saveTrips();
      closeEditPlacesDialog();
      renderTrips();
      focusTrip(trip);
      celebrateConquests(newItems, trip.name);
    } catch (error) {
      console.error("Falha ao recalcular viagem após editar locais", error);
      const reason = error?.message ? ` Motivo: ${error.message}` : "";
      setEditPlacesMessage(`Não foi possível recalcular a rota. Nenhuma alteração foi salva.${reason}`);
    } finally {
      els.saveEditPlacesBtn.textContent = "Salvar e recalcular rota";
      updateEditPlacesButton();
    }
  }

  els.editPlacesForm?.addEventListener("submit", saveEditedPlacesPreservingRoute, true);

  const style = document.createElement("style");
  style.textContent = `
    .leaflet-tile-pane { filter: grayscale(1) saturate(0) contrast(.94) brightness(1.04); }
    .road-map-shield-wrap { display: none !important; }
    body.mv-trip-detail-active .road-map-shield-wrap { display: block !important; }

    #tripDialog, #editPlacesDialog {
      max-height: calc(100vh - 28px);
      overflow: hidden;
    }
    #tripDialog > form, #editPlacesDialog > form {
      max-height: calc(100vh - 56px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #tripDialog .stops-section, #editPlacesDialog .stops-section {
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }
    #tripDialog .stops-container, #editPlacesDialog .stops-container {
      overflow-y: auto;
      overscroll-behavior: contain;
      max-height: min(44vh, 430px);
      padding-right: 5px;
      scrollbar-gutter: stable;
    }
    #tripDialog .dialog-head, #editPlacesDialog .dialog-head,
    #tripDialog .dialog-actions, #editPlacesDialog .dialog-actions,
    #tripDialog .autocomplete-field, #editPlacesDialog .autocomplete-field {
      flex: 0 0 auto;
    }
    @media (max-height: 720px) {
      #tripDialog .stops-container, #editPlacesDialog .stops-container { max-height: 35vh; }
    }
  `;
  document.head.appendChild(style);

  const editPlacesCopy = document.querySelector("#editPlacesDialog .dialog-head p");
  if (editPlacesCopy) {
    editPlacesCopy.textContent = "Altere as cidades e salve para recalcular o trajeto. Ajustes manuais anteriores são preservados quando o início e o fim permanecem os mesmos.";
  }

  const versionCopy = document.querySelector(".brand p");
  if (versionCopy) versionCopy.textContent = versionCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  renderTrips();
  console.info(`Minhas Viagens ${APP_VERSION}: mapa PB, busca tolerante e edição de paradas aprimorada.`);
})();
