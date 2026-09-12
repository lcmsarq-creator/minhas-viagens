(() => {
  "use strict";

  const APP_VERSION = "0.10.16";
  const CLOUD_PREFIX = "mvroad|";
  const CLOUD_SCHEMA = "road-geometry-polyline5-v2";
  const LEGACY_CLOUD_SCHEMA = "road-geometry-polyline5-v1";
  const PAGE_SIZE = 500;
  const UPLOAD_BATCH = 12;
  const MB = 1024 * 1024;
  const RETRY_DELAYS = [15000, 60000, 180000, 600000, 1800000];

  const auth = window.MinhasViagensAuth;
  const client = auth?.getClient?.();
  const userId = auth?.getUser?.()?.id;
  const compact = window.MinhasViagensGeometryCompact;
  if (!client || !userId || !compact?.encodePolyline || !compact?.decodePolyline) return;

  const QUEUE_KEY = `minhasViagens.roadCloudQueue.${userId}.v2`;
  const cloudRows = new Map();
  const uploadQueue = new Map();
  let cloudIndexPromise = null;
  let uploadTimer = null;
  let retryTimer = null;
  let flushing = false;
  let processingMissing = false;

  const stats = window.MinhasViagensRoadCloudStats = {
    version: APP_VERSION,
    achievementRoads: 0,
    availableRoads: 0,
    refreshedRoads: 0,
    pendingRoads: 0,
    failedRoads: 0,
    cloudRoads: 0,
    cloudBytes: 0,
    localRoadBytes: 0,
    originUsageBytes: 0,
    originQuotaBytes: 0,
    uploadedRoads: 0,
    downloadedRoads: 0,
    cloudHits: 0,
    cloudMisses: 0,
    lastUpdatedAt: null
  };

  const byteSize = value => {
    try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
    catch { return 0; }
  };

  const fmtMb = bytes => `${(Number(bytes || 0) / MB).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
  const fmtKb = bytes => `${(Number(bytes || 0) / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const requiredNetworkSchema = () => window.MinhasViagensRoadNetwork?.schema || "";
  const isCurrentEntry = entry => Boolean(entry?.lines?.length) && (!requiredNetworkSchema() || entry.networkFetchSchema === requiredNetworkSchema());

  function cloudId(key) {
    return `${CLOUD_PREFIX}${key}`;
  }

  function loadQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  }

  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
    stats.pendingRoads = Object.keys(queue).length;
    stats.failedRoads = Object.values(queue).filter(item => Number(item?.attempts) > 0).length;
  }

  function pointCount(lines) {
    return (lines || []).reduce((sum, line) => sum + (Array.isArray(line) ? line.length : 0), 0);
  }

  function sourceToken(entry) {
    return [
      Number(entry?.version) || HIGHWAY_CACHE_VERSION,
      String(entry?.networkFetchSchema || ""),
      String(entry?.updatedAt || ""),
      pointCount(entry?.lines || []),
      Math.round((Number(entry?.totalKm) || 0) * 1000)
    ].join("|");
  }

  function descriptorPayload(descriptor) {
    return {
      ref: descriptor?.ref || null,
      countryCode: descriptor?.countryCode || null,
      network: descriptor?.network || null,
      number: descriptor?.number || null,
      stateCode: descriptor?.stateCode || null
    };
  }

  function serializeEntry(descriptor, entry) {
    const lines = (entry?.lines || []).filter(line => Array.isArray(line) && line.length > 1);
    const precision = 5;
    const encodedLines = lines.map(line => compact.encodePolyline(line, precision));
    return {
      kind: "road_geometry_cache",
      schema: CLOUD_SCHEMA,
      key: highwayCacheKey(descriptor),
      descriptor: descriptorPayload(descriptor),
      cacheVersion: Number(entry?.version) || HIGHWAY_CACHE_VERSION,
      networkFetchSchema: String(entry?.networkFetchSchema || requiredNetworkSchema()),
      sourceUpdatedAt: Number(entry?.updatedAt) || Date.now(),
      sourceToken: sourceToken(entry),
      partial: Boolean(entry?.partial),
      totalKm: Number(entry?.totalKm) || 0,
      bounds: Array.isArray(entry?.bounds) ? entry.bounds : null,
      precision,
      compactToleranceM: Number(entry?.compactToleranceM) || 25,
      pointCount: pointCount(lines),
      encodedLines
    };
  }

  function hydratePayload(payload) {
    if (!payload || payload.kind !== "road_geometry_cache") return null;
    if (![CLOUD_SCHEMA, LEGACY_CLOUD_SCHEMA].includes(payload.schema)) return null;
    if (Number(payload.cacheVersion) !== HIGHWAY_CACHE_VERSION || !Array.isArray(payload.encodedLines)) return null;
    const precision = Number(payload.precision) || 5;
    const lines = payload.encodedLines
      .map(encoded => compact.decodePolyline(encoded, precision))
      .filter(line => Array.isArray(line) && line.length > 1);
    if (!lines.length) return null;
    const current = payload.schema === CLOUD_SCHEMA && (!requiredNetworkSchema() || payload.networkFetchSchema === requiredNetworkSchema());
    return {
      key: payload.key,
      version: HIGHWAY_CACHE_VERSION,
      networkFetchSchema: current ? requiredNetworkSchema() : String(payload.networkFetchSchema || ""),
      needsNetworkRefresh: !current,
      updatedAt: Number(payload.sourceUpdatedAt) || Date.now(),
      ttl: HIGHWAY_CACHE_TTL,
      lines,
      partial: Boolean(payload.partial),
      totalKm: Number(payload.totalKm) || lines.reduce((sum, line) => sum + lineLengthKm(line), 0),
      bounds: Array.isArray(payload.bounds) ? payload.bounds : null,
      compactToleranceM: Number(payload.compactToleranceM) || 25,
      cloudSourceToken: payload.sourceToken || null
    };
  }

  function ensureMetricsUi() {
    if (document.getElementById("roadCloudMetrics")) return;
    const backupPanel = els?.exportBtn?.closest?.(".panel");
    if (!backupPanel) return;
    const title = document.createElement("h3");
    title.textContent = "Armazenamento";
    title.style.margin = "16px 0 6px";
    title.style.fontSize = ".9rem";
    const cloudLine = document.createElement("p");
    cloudLine.id = "roadCloudMetrics";
    cloudLine.className = "micro-hint";
    cloudLine.textContent = "Rodovias na nuvem: calculando…";
    const localLine = document.createElement("p");
    localLine.id = "roadLocalMetrics";
    localLine.className = "micro-hint";
    localLine.textContent = "Este dispositivo: calculando…";
    const trendLine = document.createElement("p");
    trendLine.id = "roadTrendMetrics";
    trendLine.className = "micro-hint";
    trendLine.textContent = "Tendência: calculando…";
    backupPanel.append(title, cloudLine, localLine, trendLine);
  }

  function renderMetrics() {
    ensureMetricsUi();
    const cloudLine = document.getElementById("roadCloudMetrics");
    const localLine = document.getElementById("roadLocalMetrics");
    const trendLine = document.getElementById("roadTrendMetrics");
    if (cloudLine) cloudLine.textContent = `Rodovias na nuvem: ${stats.cloudRoads} · ${fmtMb(stats.cloudBytes)} de geometria compactada`;
    if (localLine) {
      const remaining = Math.max(0, stats.originQuotaBytes - stats.originUsageBytes);
      localLine.textContent = stats.originQuotaBytes
        ? `Este dispositivo: ${fmtMb(stats.originUsageBytes)} usados · ${fmtMb(remaining)} disponíveis`
        : `Cache local de rodovias: ${fmtMb(stats.localRoadBytes)}`;
    }
    if (trendLine) {
      if (stats.cloudRoads > 0) {
        const avg = stats.cloudBytes / stats.cloudRoads;
        trendLine.textContent = `Média ${fmtKb(avg)}/rodovia · 100 ≈ ${fmtMb(avg * 100)} · 500 ≈ ${fmtMb(avg * 500)}`;
      } else {
        trendLine.textContent = "Tendência: será calculada após a primeira rodovia ser enviada à nuvem.";
      }
    }
  }

  function recalcCloudStats() {
    stats.cloudRoads = cloudRows.size;
    stats.cloudBytes = 0;
    for (const row of cloudRows.values()) stats.cloudBytes += byteSize({ trip_id: row.trip_id, payload: row.payload });
    stats.lastUpdatedAt = new Date().toISOString();
    renderMetrics();
  }

  async function loadCloudIndex(force = false) {
    if (cloudIndexPromise && !force) return cloudIndexPromise;
    cloudIndexPromise = (async () => {
      const next = new Map();
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from("trips")
          .select("trip_id,payload,client_updated_at")
          .eq("user_id", userId)
          .like("trip_id", `${CLOUD_PREFIX}%`)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        for (const row of rows) {
          const id = String(row.trip_id || "");
          if (!id.startsWith(CLOUD_PREFIX)) continue;
          const key = id.slice(CLOUD_PREFIX.length);
          if (key) next.set(key, row);
        }
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      cloudRows.clear();
      for (const [key, row] of next) cloudRows.set(key, row);
      recalcCloudStats();
      return cloudRows;
    })().catch(error => {
      cloudIndexPromise = null;
      console.warn("Biblioteca de rodovias na nuvem indisponível", error);
      return cloudRows;
    });
    return cloudIndexPromise;
  }

  async function measureLocalStorage() {
    try {
      const db = await openHighwayDb();
      stats.localRoadBytes = await new Promise((resolve, reject) => {
        let total = 0;
        const tx = db.transaction(HIGHWAY_GEOMETRY_STORE, "readonly");
        const request = tx.objectStore(HIGHWAY_GEOMETRY_STORE).openCursor();
        request.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return;
          total += byteSize(cursor.value);
          cursor.continue();
        };
        tx.oncomplete = () => { db.close(); resolve(total); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      });
    } catch {}
    try {
      const estimate = await navigator.storage?.estimate?.();
      stats.originUsageBytes = Number(estimate?.usage) || 0;
      stats.originQuotaBytes = Number(estimate?.quota) || 0;
    } catch {}
    renderMetrics();
    return stats;
  }

  function queueUpload(descriptor, entry) {
    if (!navigator.onLine || !isCurrentEntry(entry)) return;
    const key = highwayCacheKey(descriptor);
    Promise.resolve(loadCloudIndex()).then(() => {
      const payload = serializeEntry(descriptor, entry);
      const remote = cloudRows.get(key)?.payload;
      if (remote?.sourceToken === payload.sourceToken && remote?.schema === CLOUD_SCHEMA) return;
      uploadQueue.set(key, {
        key,
        row: {
          user_id: userId,
          trip_id: cloudId(key),
          payload,
          client_updated_at: new Date().toISOString(),
          deleted_at: null
        }
      });
      clearTimeout(uploadTimer);
      uploadTimer = setTimeout(flushUploads, 350);
    });
  }

  async function flushUploads() {
    if (flushing || !navigator.onLine || !uploadQueue.size) return;
    flushing = true;
    try {
      while (uploadQueue.size) {
        const batch = [...uploadQueue.values()].slice(0, UPLOAD_BATCH);
        const rows = batch.map(item => item.row);
        const { error } = await client.from("trips").upsert(rows, { onConflict: "user_id,trip_id" });
        if (error) throw error;
        for (const item of batch) {
          uploadQueue.delete(item.key);
          cloudRows.set(item.key, { trip_id: item.row.trip_id, payload: item.row.payload, client_updated_at: item.row.client_updated_at });
          stats.uploadedRoads += 1;
        }
        recalcCloudStats();
        await sleep(80);
      }
    } catch (error) {
      console.warn("Não foi possível enviar todas as rodovias para a nuvem agora", error);
    } finally {
      flushing = false;
      if (uploadQueue.size && navigator.onLine) uploadTimer = setTimeout(flushUploads, 1800);
    }
  }

  async function cloudEntryFor(descriptor) {
    const key = highwayCacheKey(descriptor);
    await loadCloudIndex();
    const row = cloudRows.get(key);
    if (!row) {
      stats.cloudMisses += 1;
      return null;
    }
    const entry = hydratePayload(row.payload);
    if (!entry) {
      stats.cloudMisses += 1;
      return null;
    }
    stats.cloudHits += 1;
    try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry); } catch {}
    stats.downloadedRoads += 1;
    measureLocalStorage();
    return entry;
  }

  const baseCachedHighway = typeof cachedHighway === "function" ? cachedHighway : null;
  if (baseCachedHighway) {
    cachedHighway = async function cachedHighwayCloudAware(descriptor, allowExpired = false) {
      const local = await baseCachedHighway(descriptor, allowExpired);
      if (local) {
        queueUpload(descriptor, local);
        return local;
      }
      return cloudEntryFor(descriptor);
    };
  }

  const baseCacheHighway = typeof cacheHighway === "function" ? cacheHighway : null;
  if (baseCacheHighway) {
    cacheHighway = async function cacheHighwayCloudAware(descriptor, lines, partial = false) {
      const entry = await baseCacheHighway(descriptor, lines, partial);
      queueUpload(descriptor, entry);
      measureLocalStorage();
      return entry;
    };
  }

  function ensureQueueItem(queue, item, key) {
    if (queue[key]) return;
    queue[key] = {
      label: item.label,
      countryCode: item.countryCode || "BR",
      attempts: 0,
      nextRetryAt: 0,
      lastError: "",
      createdAt: Date.now()
    };
  }

  async function primeAchievements() {
    await loadCloudIndex();
    const roads = [...getAchievementSnapshot().roads.values()];
    stats.achievementRoads = roads.length;
    let available = 0;
    let refreshed = 0;
    const validKeys = new Set();
    const queue = loadQueue();

    for (const item of roads) {
      const descriptor = overpassRoadDescriptor(item);
      const key = highwayCacheKey(descriptor);
      validKeys.add(key);
      let local = null;
      try { local = await baseCachedHighway?.(descriptor, true); } catch {}
      const remote = hydratePayload(cloudRows.get(key)?.payload);

      if (isCurrentEntry(local)) {
        available += 1;
        refreshed += 1;
        queueUpload(descriptor, local);
        delete queue[key];
        continue;
      }
      if (isCurrentEntry(remote)) {
        available += 1;
        refreshed += 1;
        delete queue[key];
        try {
          await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote);
          stats.downloadedRoads += 1;
        } catch {}
        continue;
      }
      if (local) {
        available += 1;
        ensureQueueItem(queue, item, key);
        continue;
      }
      if (remote) {
        available += 1;
        ensureQueueItem(queue, item, key);
        try {
          await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote);
          stats.downloadedRoads += 1;
        } catch {}
        continue;
      }
      ensureQueueItem(queue, item, key);
    }

    for (const key of Object.keys(queue)) if (!validKeys.has(key)) delete queue[key];
    stats.availableRoads = available;
    stats.refreshedRoads = refreshed;
    saveQueue(queue);
    await measureLocalStorage();
    scheduleMissingProcessor(50);
    return stats;
  }

  function retryDelay(attempts) {
    return RETRY_DELAYS[Math.min(RETRY_DELAYS.length - 1, Math.max(0, attempts - 1))];
  }

  function scheduleMissingProcessor(delay = 300) {
    clearTimeout(retryTimer);
    if (!navigator.onLine) return;
    retryTimer = setTimeout(processMissingQueue, delay);
  }

  async function processMissingQueue() {
    if (processingMissing || !navigator.onLine) return;
    processingMissing = true;
    try {
      while (navigator.onLine) {
        const queue = loadQueue();
        const entries = Object.entries(queue);
        if (!entries.length) break;
        const now = Date.now();
        const due = entries
          .filter(([, item]) => Number(item?.nextRetryAt || 0) <= now)
          .sort((a, b) => Number(a[1]?.nextRetryAt || 0) - Number(b[1]?.nextRetryAt || 0));
        if (!due.length) {
          const nextAt = Math.min(...entries.map(([, item]) => Number(item?.nextRetryAt || now + 60000)));
          scheduleMissingProcessor(Math.max(1000, Math.min(60000, nextAt - now)));
          break;
        }

        const [key, item] = due[0];
        try {
          const descriptor = overpassRoadDescriptor({ label: item.label, countryCode: item.countryCode || "BR" });
          const local = await baseCachedHighway?.(descriptor, true);
          const remote = hydratePayload(cloudRows.get(key)?.payload);
          if (isCurrentEntry(local)) {
            queueUpload(descriptor, local);
          } else if (isCurrentEntry(remote)) {
            await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote);
            stats.downloadedRoads += 1;
          } else {
            await fetchFullHighway(descriptor, null);
            await flushUploads();
          }
          const nextQueue = loadQueue();
          delete nextQueue[key];
          saveQueue(nextQueue);
          stats.refreshedRoads = Math.min(stats.achievementRoads, stats.refreshedRoads + 1);
          stats.availableRoads = Math.min(stats.achievementRoads, stats.availableRoads + (local || remote ? 0 : 1));
        } catch (error) {
          const nextQueue = loadQueue();
          const current = nextQueue[key] || item;
          current.attempts = Number(current.attempts || 0) + 1;
          current.lastError = String(error?.message || error || "Falha desconhecida").slice(0, 240);
          current.lastAttemptAt = Date.now();
          current.nextRetryAt = Date.now() + retryDelay(current.attempts);
          nextQueue[key] = current;
          saveQueue(nextQueue);
          console.warn(`Rodovia ${current.label} continua pendente; nova tentativa será feita automaticamente.`, error);
        }
        await sleep(1200);
      }
    } finally {
      processingMissing = false;
      const queue = loadQueue();
      if (Object.keys(queue).length && navigator.onLine) scheduleMissingProcessor(1500);
      loadCloudIndex(true);
      measureLocalStorage();
    }
  }

  window.MinhasViagensRoadCloud = {
    prefix: CLOUD_PREFIX,
    stats,
    loadCloudIndex,
    primeAchievements,
    measureLocalStorage,
    flushUploads,
    processMissingQueue,
    status: () => ({ ...stats, queue: loadQueue() })
  };

  ensureMetricsUi();
  renderMetrics();
  loadCloudIndex();
  setTimeout(primeAchievements, 700);
  setTimeout(primeAchievements, 3000);
  setInterval(() => primeAchievements().catch(() => {}), 120000);
  window.addEventListener("online", () => {
    loadCloudIndex(true);
    setTimeout(primeAchievements, 250);
    setTimeout(flushUploads, 700);
    scheduleMissingProcessor(900);
  });

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: biblioteca persistente de rodovias com fila de completude e retentativas habilitada.`);
})();
