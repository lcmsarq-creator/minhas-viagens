(() => {
  "use strict";

  const APP_VERSION = "0.10.17";
  const CLOUD_PREFIX = "mvroad|";
  const CLOUD_SCHEMA = "road-geometry-polyline5-v3";
  const ACCEPTED_SCHEMAS = new Set([
    "road-geometry-polyline5-v1",
    "road-geometry-polyline5-v2",
    CLOUD_SCHEMA
  ]);
  const PAGE_SIZE = 500;
  const UPLOAD_BATCH = 10;
  const RETRY_DELAYS = [15000, 60000, 180000, 600000, 1800000];
  const ROAD_PAUSE_MS = 1200;

  const auth = window.MinhasViagensAuth;
  const client = auth?.getClient?.();
  const userId = auth?.getUser?.()?.id;
  const compact = window.MinhasViagensGeometryCompact;
  if (!client || !userId || !compact?.encodePolyline || !compact?.decodePolyline) return;

  const QUEUE_KEY = `minhasViagens.roadCloudQueue.${userId}.v3`;
  const cloudRows = new Map();
  const uploadQueue = new Map();
  let cloudIndexPromise = null;
  let uploadTimer = null;
  let retryTimer = null;
  let flushing = false;
  let processing = false;

  const stats = window.MinhasViagensRoadCloudStats = {
    version: APP_VERSION,
    achievementRoads: 0,
    availableRoads: 0,
    completeRoads: 0,
    pendingRoads: 0,
    failedRoads: 0,
    cloudRoads: 0,
    cloudBytes: 0,
    uploadedRoads: 0,
    downloadedRoads: 0,
    cloudHits: 0,
    cloudMisses: 0,
    lastUpdatedAt: null
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byteSize = value => {
    try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
    catch { return 0; }
  };
  const requiredNetworkSchema = () => window.MinhasViagensRoadNetwork?.schema || "";

  function cloudId(key) {
    return `${CLOUD_PREFIX}${key}`;
  }

  function pointCount(lines) {
    return (lines || []).reduce((sum, line) => sum + (Array.isArray(line) ? line.length : 0), 0);
  }

  function isValidatedEntry(entry) {
    if (!entry?.lines?.length) return false;
    const required = requiredNetworkSchema();
    if (required && entry.networkFetchSchema !== required) return false;
    if (entry.needsNetworkRefresh === true) return false;
    if (entry.partial === true) return false;
    return true;
  }

  function isValidatedPayload(payload) {
    if (!payload || payload.kind !== "road_geometry_cache") return false;
    if (payload.schema !== CLOUD_SCHEMA) return false;
    if (!Array.isArray(payload.encodedLines) || !payload.encodedLines.length) return false;
    const required = requiredNetworkSchema();
    if (required && payload.networkFetchSchema !== required) return false;
    if (payload.partial === true) return false;
    return true;
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
    stats.failedRoads = Object.values(queue).filter(item => Number(item?.attempts || 0) > 0).length;
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

  function sourceToken(entry) {
    return [
      Number(entry?.version) || HIGHWAY_CACHE_VERSION,
      String(entry?.networkFetchSchema || ""),
      String(entry?.updatedAt || ""),
      Boolean(entry?.partial) ? 1 : 0,
      pointCount(entry?.lines || []),
      Math.round((Number(entry?.totalKm) || 0) * 1000)
    ].join("|");
  }

  function serializeValidatedEntry(descriptor, entry) {
    if (!isValidatedEntry(entry)) throw new Error("Geometria ainda não validada como completa");
    const lines = (entry.lines || []).filter(line => Array.isArray(line) && line.length > 1);
    const precision = 5;
    return {
      kind: "road_geometry_cache",
      schema: CLOUD_SCHEMA,
      key: highwayCacheKey(descriptor),
      descriptor: descriptorPayload(descriptor),
      cacheVersion: Number(entry.version) || HIGHWAY_CACHE_VERSION,
      networkFetchSchema: String(entry.networkFetchSchema || ""),
      sourceUpdatedAt: Number(entry.updatedAt) || Date.now(),
      sourceToken: sourceToken(entry),
      partial: false,
      totalKm: Number(entry.totalKm) || 0,
      bounds: Array.isArray(entry.bounds) ? entry.bounds : null,
      precision,
      compactToleranceM: Number(entry.compactToleranceM) || 25,
      pointCount: pointCount(lines),
      encodedLines: lines.map(line => compact.encodePolyline(line, precision))
    };
  }

  function hydratePayload(payload) {
    if (!payload || payload.kind !== "road_geometry_cache") return null;
    if (!ACCEPTED_SCHEMAS.has(payload.schema)) return null;
    if (Number(payload.cacheVersion) !== HIGHWAY_CACHE_VERSION || !Array.isArray(payload.encodedLines)) return null;
    const precision = Number(payload.precision) || 5;
    const lines = payload.encodedLines
      .map(encoded => compact.decodePolyline(encoded, precision))
      .filter(line => Array.isArray(line) && line.length > 1);
    if (!lines.length) return null;
    const validated = isValidatedPayload(payload);
    return {
      key: payload.key,
      version: HIGHWAY_CACHE_VERSION,
      networkFetchSchema: String(payload.networkFetchSchema || ""),
      needsNetworkRefresh: !validated,
      updatedAt: Number(payload.sourceUpdatedAt) || Date.now(),
      ttl: HIGHWAY_CACHE_TTL,
      lines,
      partial: validated ? false : Boolean(payload.partial),
      totalKm: Number(payload.totalKm) || lines.reduce((sum, line) => sum + lineLengthKm(line), 0),
      bounds: Array.isArray(payload.bounds) ? payload.bounds : null,
      compactToleranceM: Number(payload.compactToleranceM) || 25,
      cloudSourceToken: payload.sourceToken || null
    };
  }

  function recalcCloudStats() {
    stats.cloudRoads = cloudRows.size;
    stats.cloudBytes = 0;
    for (const row of cloudRows.values()) stats.cloudBytes += byteSize({ trip_id: row.trip_id, payload: row.payload });
    stats.lastUpdatedAt = new Date().toISOString();
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

  function ensureQueueItem(queue, item, descriptor, key, priority = false) {
    const current = queue[key] || {};
    queue[key] = {
      label: item?.label || descriptor?.ref || current.label || key,
      countryCode: item?.countryCode || descriptor?.countryCode || current.countryCode || "BR",
      attempts: Number(current.attempts || 0),
      nextRetryAt: Number(current.nextRetryAt || 0),
      lastError: current.lastError || "",
      createdAt: Number(current.createdAt || Date.now()),
      priority: priority || Boolean(current.priority)
    };
  }

  function enqueueDescriptor(descriptor, priority = false) {
    if (!descriptor) return;
    const key = highwayCacheKey(descriptor);
    const queue = loadQueue();
    ensureQueueItem(queue, { label: descriptor.ref, countryCode: descriptor.countryCode }, descriptor, key, priority);
    if (priority) queue[key].nextRetryAt = 0;
    saveQueue(queue);
    scheduleProcessor(priority ? 50 : 400);
  }

  async function uploadRows(rows) {
    if (!rows.length) return;
    const { error } = await client.from("trips").upsert(rows, { onConflict: "user_id,trip_id" });
    if (error) throw error;
    for (const row of rows) {
      const key = String(row.trip_id).slice(CLOUD_PREFIX.length);
      cloudRows.set(key, { trip_id: row.trip_id, payload: row.payload, client_updated_at: row.client_updated_at });
      stats.uploadedRoads += 1;
    }
    recalcCloudStats();
  }

  function queueUpload(descriptor, entry) {
    if (!navigator.onLine || !isValidatedEntry(entry)) return;
    let payload;
    try { payload = serializeValidatedEntry(descriptor, entry); }
    catch { return; }
    const key = highwayCacheKey(descriptor);
    const remote = cloudRows.get(key)?.payload;
    if (isValidatedPayload(remote) && remote.sourceToken === payload.sourceToken) return;
    uploadQueue.set(key, {
      user_id: userId,
      trip_id: cloudId(key),
      payload,
      client_updated_at: new Date().toISOString(),
      deleted_at: null
    });
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(flushUploads, 300);
  }

  async function uploadValidatedNow(descriptor, entry) {
    if (!isValidatedEntry(entry)) throw new Error("Geometria parcial não pode ser publicada como completa");
    const payload = serializeValidatedEntry(descriptor, entry);
    const key = highwayCacheKey(descriptor);
    const row = {
      user_id: userId,
      trip_id: cloudId(key),
      payload,
      client_updated_at: new Date().toISOString(),
      deleted_at: null
    };
    await uploadRows([row]);
    return row;
  }

  async function flushUploads() {
    if (flushing || !navigator.onLine || !uploadQueue.size) return;
    flushing = true;
    try {
      while (uploadQueue.size) {
        const batchEntries = [...uploadQueue.entries()].slice(0, UPLOAD_BATCH);
        await uploadRows(batchEntries.map(([, row]) => row));
        for (const [key] of batchEntries) uploadQueue.delete(key);
        await sleep(80);
      }
    } catch (error) {
      console.warn("Não foi possível enviar todas as rodovias completas para a nuvem agora", error);
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
      enqueueDescriptor(descriptor, true);
      return null;
    }
    const entry = hydratePayload(row.payload);
    if (!entry) {
      stats.cloudMisses += 1;
      enqueueDescriptor(descriptor, true);
      return null;
    }
    stats.cloudHits += 1;
    try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry); } catch {}
    stats.downloadedRoads += 1;
    if (!isValidatedEntry(entry)) enqueueDescriptor(descriptor, true);
    return entry;
  }

  const baseCachedHighway = typeof cachedHighway === "function" ? cachedHighway : null;
  if (baseCachedHighway) {
    cachedHighway = async function cachedHighwayCloudV3(descriptor, allowExpired = false) {
      const local = await baseCachedHighway(descriptor, allowExpired);
      if (local) {
        if (isValidatedEntry(local)) queueUpload(descriptor, local);
        else enqueueDescriptor(descriptor, true);
        return local;
      }
      return cloudEntryFor(descriptor);
    };
  }

  const baseCacheHighway = typeof cacheHighway === "function" ? cacheHighway : null;
  if (baseCacheHighway) {
    cacheHighway = async function cacheHighwayCloudV3(descriptor, lines, partial = false) {
      const entry = await baseCacheHighway(descriptor, lines, partial);
      if (isValidatedEntry(entry)) queueUpload(descriptor, entry);
      else enqueueDescriptor(descriptor, true);
      return entry;
    };
  }

  function priorityForKey(key) {
    if (key === "BR|SP|425") return 0;
    if (key === "UY|RU|5") return 1;
    return 10;
  }

  async function primeAchievements() {
    await loadCloudIndex();
    const roads = [...getAchievementSnapshot().roads.values()];
    stats.achievementRoads = roads.length;
    let available = 0;
    let complete = 0;
    const validKeys = new Set();
    const queue = loadQueue();

    for (const item of roads) {
      const descriptor = overpassRoadDescriptor(item);
      const key = highwayCacheKey(descriptor);
      validKeys.add(key);
      let local = null;
      try { local = await baseCachedHighway?.(descriptor, true); } catch {}
      const remotePayload = cloudRows.get(key)?.payload;
      const remote = hydratePayload(remotePayload);

      if (local || remote) available += 1;

      if (isValidatedEntry(local)) {
        complete += 1;
        queueUpload(descriptor, local);
        delete queue[key];
        continue;
      }

      if (isValidatedPayload(remotePayload) && isValidatedEntry(remote)) {
        complete += 1;
        delete queue[key];
        if (!local) {
          try {
            await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote);
            stats.downloadedRoads += 1;
          } catch {}
        }
        continue;
      }

      if (!local && remote) {
        try {
          await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote);
          stats.downloadedRoads += 1;
        } catch {}
      }

      ensureQueueItem(queue, item, descriptor, key, priorityForKey(key) < 10);
    }

    for (const key of Object.keys(queue)) if (!validKeys.has(key)) delete queue[key];
    stats.availableRoads = available;
    stats.completeRoads = complete;
    saveQueue(queue);
    scheduleProcessor(80);
    return stats;
  }

  function retryDelay(attempts) {
    return RETRY_DELAYS[Math.min(RETRY_DELAYS.length - 1, Math.max(0, attempts - 1))];
  }

  function scheduleProcessor(delay = 300) {
    clearTimeout(retryTimer);
    if (!navigator.onLine) return;
    retryTimer = setTimeout(processQueue, delay);
  }

  async function processQueue() {
    if (processing || !navigator.onLine) return;
    processing = true;
    try {
      while (navigator.onLine) {
        const queue = loadQueue();
        const entries = Object.entries(queue);
        if (!entries.length) break;
        const now = Date.now();
        const due = entries
          .filter(([, item]) => Number(item?.nextRetryAt || 0) <= now)
          .sort((a, b) => {
            const pa = a[1]?.priority ? priorityForKey(a[0]) : 10;
            const pb = b[1]?.priority ? priorityForKey(b[0]) : 10;
            return pa - pb || Number(a[1]?.nextRetryAt || 0) - Number(b[1]?.nextRetryAt || 0);
          });

        if (!due.length) {
          const nextAt = Math.min(...entries.map(([, item]) => Number(item?.nextRetryAt || now + 60000)));
          scheduleProcessor(Math.max(1000, Math.min(60000, nextAt - now)));
          break;
        }

        const [key, item] = due[0];
        try {
          const descriptor = overpassRoadDescriptor({ label: item.label, countryCode: item.countryCode || "BR" });
          let local = null;
          try { local = await baseCachedHighway?.(descriptor, true); } catch {}
          const remotePayload = cloudRows.get(key)?.payload;
          const remote = hydratePayload(remotePayload);

          if (isValidatedEntry(local)) {
            await uploadValidatedNow(descriptor, local);
          } else if (isValidatedPayload(remotePayload) && isValidatedEntry(remote)) {
            try { await highwayDbPut(HIGHWAY_GEOMETRY_STORE, remote); } catch {}
          } else {
            const fresh = await fetchFullHighway(descriptor, null);
            if (!isValidatedEntry(fresh)) {
              throw new Error("A consulta retornou apenas parte da rodovia; aguardando nova tentativa");
            }
            await uploadValidatedNow(descriptor, fresh);
          }

          const nextQueue = loadQueue();
          delete nextQueue[key];
          saveQueue(nextQueue);
          stats.completeRoads = Math.min(stats.achievementRoads, stats.completeRoads + 1);
          if (!local && !remote) stats.availableRoads = Math.min(stats.achievementRoads, stats.availableRoads + 1);
        } catch (error) {
          const nextQueue = loadQueue();
          const current = nextQueue[key] || item;
          current.attempts = Number(current.attempts || 0) + 1;
          current.lastError = String(error?.message || error || "Falha desconhecida").slice(0, 240);
          current.lastAttemptAt = Date.now();
          current.nextRetryAt = Date.now() + retryDelay(current.attempts);
          current.priority = Boolean(current.priority);
          nextQueue[key] = current;
          saveQueue(nextQueue);
          console.warn(`Rodovia ${current.label} continua pendente; nova tentativa será feita automaticamente.`, error);
        }
        await sleep(ROAD_PAUSE_MS);
      }
    } finally {
      processing = false;
      const queue = loadQueue();
      if (Object.keys(queue).length && navigator.onLine) scheduleProcessor(1500);
      loadCloudIndex(true);
    }
  }

  window.MinhasViagensRoadCloud = {
    prefix: CLOUD_PREFIX,
    schema: CLOUD_SCHEMA,
    stats,
    loadCloudIndex,
    primeAchievements,
    flushUploads,
    processMissingQueue: processQueue,
    status: () => ({ ...stats, queue: loadQueue() })
  };

  loadCloudIndex();
  setTimeout(primeAchievements, 700);
  setTimeout(primeAchievements, 3000);
  setInterval(() => primeAchievements().catch(() => {}), 120000);
  window.addEventListener("online", () => {
    loadCloudIndex(true);
    setTimeout(primeAchievements, 250);
    setTimeout(flushUploads, 700);
    scheduleProcessor(900);
  });

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: nuvem v3 só publica geometrias integralmente validadas; parciais permanecem na fila.`);
})();