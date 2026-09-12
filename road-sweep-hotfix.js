(() => {
  "use strict";

  const APP_VERSION = "0.10.17";
  const SWEEP_SCHEMA_VERSION = "0.10.12";
  // A geração v3 da geometria é validada pelo road-network-hotfix antes de entrar na fila como concluída.
  const userId = window.MinhasViagensAuth?.getUser()?.id;
  if (!userId) return;

  const SWEEP_KEY = `minhasViagens.roadSweep.${userId}.v${SWEEP_SCHEMA_VERSION}`;
  const MAX_ROUTE_SAMPLES = 22;
  const TRIP_PAUSE_MS = 700;

  const status = window.MinhasViagensRoadSweep = {
    version: APP_VERSION,
    running: false,
    tripsTotal: 0,
    tripsDone: 0,
    roadsTotal: 0,
    roadsCached: 0,
    failedTrips: 0,
    failedRoads: 0,
    completed: false
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function loadSweepState() {
    try {
      const raw = localStorage.getItem(SWEEP_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return { tripDone: {}, completed: false };
  }

  function saveSweepState(value) {
    try { localStorage.setItem(SWEEP_KEY, JSON.stringify(value)); } catch {}
  }

  function sampledRoutePoints(trip) {
    const line = tripLatLngs(trip);
    if (!Array.isArray(line) || line.length < 2) return [];
    if (line.length <= MAX_ROUTE_SAMPLES) return line.map(([lat, lng]) => ({ lat, lng }));
    const points = [];
    const last = line.length - 1;
    for (let i = 0; i < MAX_ROUTE_SAMPLES; i++) {
      const index = Math.round(i * last / (MAX_ROUTE_SAMPLES - 1));
      const [lat, lng] = line[index];
      const previous = points.at(-1);
      if (!previous || previous.lat !== lat || previous.lng !== lng) points.push({ lat, lng });
    }
    return points;
  }

  function sameRoadList(a, b) {
    const left = (a || []).map(normalizeKey).filter(Boolean).sort();
    const right = (b || []).map(normalizeKey).filter(Boolean).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  async function scanTrip(trip) {
    const points = sampledRoutePoints(trip);
    if (points.length < 2) return false;
    const routes = await fetchOsrmRoute(points, false);
    const route = routes?.[0];
    if (!route) throw new Error("OSRM não retornou rota");

    const nextLabels = extractRoadLabelsFromRoute(route, trip);
    const nextRoads = extractHighwaysFromRoute(route, trip);
    const nextSegments = extractRoadSegmentsFromRoute(route, trip);
    const changed = !sameRoadList(trip.conquests?.roads || [], nextRoads);
    trip.roadLabels = nextLabels;
    trip.conquests.roads = nextRoads;
    trip.roadSegments = nextSegments;

    for (const [road, lines] of Object.entries(nextSegments || {})) {
      try { await window.__mvPutTripRoadSegments?.(trip.id, road, lines); } catch {}
    }
    if (changed) trip.updatedAt = new Date().toISOString();
    return changed;
  }

  async function sweepExistingTrips() {
    const sweepState = loadSweepState();
    const eligible = (state.trips || []).filter(trip =>
      ["carro", "moto"].includes(trip?.mode) && tripLatLngs(trip).length >= 2
    );
    status.tripsTotal = eligible.length;
    let anyChanged = false;

    for (const trip of eligible) {
      if (sweepState.tripDone?.[trip.id]) {
        status.tripsDone += 1;
        continue;
      }
      try {
        const changed = await scanTrip(trip);
        anyChanged = anyChanged || changed;
        sweepState.tripDone ||= {};
        sweepState.tripDone[trip.id] = Date.now();
        status.tripsDone += 1;
        saveSweepState(sweepState);
      } catch (error) {
        status.failedTrips += 1;
        console.warn(`Varredura de rodovias adiada para ${trip?.name || trip?.id}`, error);
      }
      await sleep(TRIP_PAUSE_MS);
    }

    sweepState.completed = eligible.every(trip => Boolean(sweepState.tripDone?.[trip.id]));
    sweepState.completedAt = sweepState.completed ? Date.now() : null;
    saveSweepState(sweepState);
    if (anyChanged) {
      saveTrips();
      renderTrips();
    }
  }

  async function handRoadsToCloudQueue() {
    const cloud = window.MinhasViagensRoadCloud;
    if (!cloud?.primeAchievements) return;
    try {
      const result = await cloud.primeAchievements();
      status.roadsTotal = Number(result?.achievementRoads) || 0;
      status.roadsCached = Number(result?.availableRoads) || 0;
      status.failedRoads = Number(result?.failedRoads) || 0;
    } catch (error) {
      console.warn("A fila persistente de rodovias será retomada depois", error);
    }
  }

  async function run() {
    if (status.running || !navigator.onLine) return;
    status.running = true;
    try {
      const earlyQueue = handRoadsToCloudQueue();
      await sweepExistingTrips();
      await earlyQueue;
      await handRoadsToCloudQueue();
      status.completed = status.failedTrips === 0 && status.failedRoads === 0;
    } finally {
      status.running = false;
    }
  }

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  setTimeout(run, 1200);
  window.addEventListener("online", () => setTimeout(run, 800));

  console.info(`Minhas Viagens ${APP_VERSION}: varredura histórica ligada à fila persistente de rodovias.`);
})();