(() => {
  const userId = window.MinhasViagensAuth?.getUser()?.id;
  const STORAGE_KEY = `minhasViagens.trips.${userId}.v1`;
  const SEGMENT_DB_NAME = "minhasViagensTripRoadSegments.v1";
  const SEGMENT_STORE = "segments";

  const normalizeRoadKey = value => String(value || "").trim().toLocaleLowerCase("pt-BR");

  const openSegmentDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
    const request = indexedDB.open(SEGMENT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEGMENT_STORE)) db.createObjectStore(SEGMENT_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  let pendingTrips = null;
  let persistTimer = null;

  async function flushSegments() {
    persistTimer = null;
    const trips = pendingTrips;
    pendingTrips = null;
    if (!Array.isArray(trips) || !trips.length) return;
    let db;
    try {
      db = await openSegmentDb();
      const tx = db.transaction(SEGMENT_STORE, "readwrite");
      const store = tx.objectStore(SEGMENT_STORE);
      for (const trip of trips) {
        if (!trip?.id || !trip.roadSegments || typeof trip.roadSegments !== "object") continue;
        for (const [road, lines] of Object.entries(trip.roadSegments)) {
          if (!Array.isArray(lines) || !lines.length) continue;
          store.put({
            key: `${trip.id}|${normalizeRoadKey(road)}`,
            tripId: trip.id,
            road,
            lines,
            updatedAt: Date.now()
          });
        }
      }
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        console.warn("Falha ao mover trechos de rodovia para IndexedDB", tx.error);
        db.close();
      };
    } catch (error) {
      console.warn("IndexedDB de trechos indisponível", error);
      try { db?.close(); } catch {}
    }
  }

  function scheduleSegmentPersistence(trips) {
    if (!Array.isArray(trips)) return;
    pendingTrips = trips;
    if (persistTimer == null) persistTimer = setTimeout(flushSegments, 0);
  }

  window.__mvPersistTripRoadSegments = scheduleSegmentPersistence;
  window.__mvGetTripRoadSegments = async (tripId, road) => {
    const db = await openSegmentDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(SEGMENT_STORE, "readonly").objectStore(SEGMENT_STORE).get(`${tripId}|${normalizeRoadKey(road)}`);
      request.onsuccess = () => { db.close(); resolve(request.result?.lines || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  };
  window.__mvPutTripRoadSegments = async (tripId, road, lines) => {
    if (!tripId || !road || !Array.isArray(lines) || !lines.length) return;
    const db = await openSegmentDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SEGMENT_STORE, "readwrite");
      tx.objectStore(SEGMENT_STORE).put({ key: `${tripId}|${normalizeRoadKey(road)}`, tripId, road, lines, updatedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  };

  // Impede que a fila pesada da v0.7.0 comece antes do hotfix terminar de carregar.
  window.__mvOriginalRequestIdleCallback = window.requestIdleCallback;
  window.requestIdleCallback = () => 0;

  // Durante a migração inicial, intercepta a gravação antiga e remove roadSegments
  // do localStorage. Os segmentos são enviados ao IndexedDB em paralelo.
  const nativeSetItem = Storage.prototype.setItem;
  window.__mvNativeStorageSetItem = nativeSetItem;
  Storage.prototype.setItem = function(key, value) {
    if (key === STORAGE_KEY && typeof value === "string") {
      try {
        const trips = JSON.parse(value);
        scheduleSegmentPersistence(trips);
        if (Array.isArray(trips)) {
          for (const trip of trips) delete trip.roadSegments;
          value = JSON.stringify(trips);
        }
      } catch (error) {
        console.warn("Não foi possível compactar os dados antes de salvar", error);
      }
    }
    return nativeSetItem.call(this, key, value);
  };
})();
