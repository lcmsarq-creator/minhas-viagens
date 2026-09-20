(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.MinhasViagensSyncCore = api;
    if (root.document) api.start(root);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const EXCLUDED_KEYS = new Set([
    "roadSegments", "matchingRoadSegments", "highwayCache", "highwayProgress",
    "overpassCache", "media", "photos", "videos", "photoBytes", "videoBytes"
  ]);
  const LEGACY_KEYS = [
    "minhasViagens.v0.6.7", "minhasViagens.v0.6.6", "minhasViagens.v0.6.5",
    "minhasViagens.v0.6.4", "minhasViagens.v0.6.3", "minhasViagens.v0.6.2",
    "minhasViagens.v0.6.1", "minhasViagens.v0.6", "minhasViagens.v0.5",
    "minhasViagens.v0.4", "minhasViagens.v0.3", "minhasViagens.v0.2", "minhasViagens.v0.1"
  ];
  const ROAD_CLOUD_PREFIX = "mvroad|";
  const SYNC_BATCH_SIZE = 20;
  const SYNC_STATE_SCHEMA = "trip-sync-state-v2-metadata";

  function serializeTripForCloud(trip) {
    return JSON.parse(JSON.stringify(trip, (key, value) => EXCLUDED_KEYS.has(key) ? undefined : value));
  }

  function normalizeTripFromCloud(payload, tripId) {
    const trip = serializeTripForCloud(payload || {});
    trip.id = String(trip.id || tripId);
    return trip;
  }

  function timestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function tripTimestamp(trip, fallback) {
    return timestamp(trip?.updatedAt) || timestamp(trip?.createdAt) || timestamp(trip?.date) || timestamp(fallback);
  }

  function fingerprint(trip) {
    const stable = value => {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stable(value[key]); return out;
      }, {});
      return value;
    };
    return JSON.stringify(stable(serializeTripForCloud(trip)));
  }

  function userStorageKeys(userId) {
    return {
      trips: `minhasViagens.trips.${userId}.v1`,
      tombstones: `minhasViagens.tombstones.${userId}.v1`,
      migration: `minhasViagens.migration.${userId}.v1`,
      syncState: `minhasViagens.sync.${userId}.v2`
    };
  }

  function findLegacyTrips(storage) {
    const found = [];
    for (const key of LEGACY_KEYS) {
      try {
        const trips = JSON.parse(storage.getItem(key));
        if (Array.isArray(trips) && trips.length) found.push({ key, trips: trips.map(serializeTripForCloud) });
      } catch {}
    }
    return found;
  }

  function verifyTripsAreRemote(trips, remoteRows) {
    const remote = new Map((remoteRows || []).map(row => [String(row.trip_id), row]));
    return (trips || []).every(trip => {
      const row = remote.get(String(trip.id));
      return row && !row.deleted_at && fingerprint(row.payload) === fingerprint(trip);
    });
  }

  function retireVerifiedLegacyStorage(storage, legacyEntries, remoteRows) {
    const retired = [];
    for (const entry of legacyEntries || []) {
      if (!verifyTripsAreRemote(entry.trips, remoteRows)) continue;
      storage.removeItem(entry.key);
      retired.push(entry.key);
    }
    return retired;
  }

  function uniqueLegacyTrips(entries) {
    const trips = new Map();
    for (const entry of entries) for (const trip of entry.trips) trips.set(String(trip.id), trip);
    return [...trips.values()];
  }

  async function completeLegacyMigration(options) {
    const { storage, legacyEntries, fetchRemote, uploadTrips, cacheKey, migrationKey } = options;
    const compact = uniqueLegacyTrips(legacyEntries);
    let remoteRows = await fetchRemote();
    let uploaded = false;
    if (!verifyTripsAreRemote(compact, remoteRows)) {
      await uploadTrips(compact);
      uploaded = true;
      remoteRows = await fetchRemote();
    }
    if (!verifyTripsAreRemote(compact, remoteRows)) throw new Error("Não foi possível confirmar todas as viagens no servidor");
    const retiredKeys = retireVerifiedLegacyStorage(storage, legacyEntries, remoteRows);
    const cacheTrips = remoteRows.filter(row => !row.deleted_at).map(row => normalizeTripFromCloud(row.payload, row.trip_id));
    try {
      storage.setItem(cacheKey, JSON.stringify(cacheTrips));
      storage.setItem(migrationKey, new Date().toISOString());
    } catch (error) {
      error.remoteSafe = true;
      error.legacyRetired = retiredKeys.length > 0;
      throw error;
    }
    return { trips: cacheTrips, remoteRows, retiredKeys, uploaded };
  }

  function isMissingTable(error) {
    return error?.code === "42P01" || /relation .*trips.* does not exist/i.test(error?.message || "");
  }

  function syncErrorLabel(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").trim();
    return [code, message].filter(Boolean).join(" · ").slice(0, 180);
  }

  function byteSize(value) {
    try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
    catch { return JSON.stringify(value || null).length; }
  }

  function remoteRevision(row) {
    return String(row?.server_updated_at || row?.client_updated_at || row?.deleted_at || "");
  }

  function validSyncState(value) {
    return value?.schema === SYNC_STATE_SCHEMA && value.rows && typeof value.rows === "object";
  }

  function createSyncState(trips, remoteRows) {
    const remote = new Map((remoteRows || []).map(row => [String(row.trip_id), row]));
    const rows = {};
    for (const trip of trips || []) {
      const id = String(trip.id);
      const row = remote.get(id);
      if (!row || row.deleted_at) continue;
      rows[id] = {
        fingerprint: fingerprint(trip),
        serverUpdatedAt: remoteRevision(row),
        deletedAt: null
      };
    }
    return { schema: SYNC_STATE_SCHEMA, updatedAt: new Date().toISOString(), rows };
  }

  function planIncrementalSync(localTrips, remoteRows, tombstones, previousState) {
    const local = new Map((localTrips || []).map(trip => [String(trip.id), trip]));
    const remote = new Map((remoteRows || []).map(row => [String(row.trip_id), row]));
    const deleted = new Map((tombstones || []).map(item => [String(item.trip_id), item]));
    const previous = validSyncState(previousState) ? previousState.rows : {};
    const ids = new Set([...local.keys(), ...remote.keys(), ...deleted.keys()]);
    const uploadIds = [], downloadIds = [], deleteLocalIds = [], remoteDeletes = [];

    for (const id of ids) {
      const localTrip = local.get(id);
      const remoteRow = remote.get(id);
      const tombstone = deleted.get(id);
      const old = previous[id];
      const localChanged = Boolean(localTrip) && (!old || old.fingerprint !== fingerprint(localTrip));
      const remoteChanged = Boolean(remoteRow) && (!old || old.serverUpdatedAt !== remoteRevision(remoteRow) ||
        String(old.deletedAt || "") !== String(remoteRow.deleted_at || ""));

      if (tombstone) {
        const deletedAt = String(tombstone.deleted_at || "");
        const remoteTime = timestamp(remoteRow?.deleted_at || remoteRow?.client_updated_at || remoteRow?.server_updated_at);
        if (!remoteRow || !remoteChanged || timestamp(deletedAt) > remoteTime) {
          remoteDeletes.push({ trip_id: id, deleted_at: deletedAt });
        } else if (!remoteRow.deleted_at) {
          downloadIds.push(id);
        }
        if (localTrip) deleteLocalIds.push(id);
        continue;
      }

      if (remoteRow?.deleted_at) {
        if (localTrip && localChanged && tripTimestamp(localTrip) > timestamp(remoteRow.deleted_at)) uploadIds.push(id);
        else if (localTrip) deleteLocalIds.push(id);
        continue;
      }

      if (localTrip && !remoteRow) {
        uploadIds.push(id);
        continue;
      }
      if (!localTrip && remoteRow) {
        downloadIds.push(id);
        continue;
      }
      if (!localTrip || !remoteRow) continue;

      if (localChanged && remoteChanged) {
        const localTime = tripTimestamp(localTrip);
        const remoteTime = timestamp(remoteRow.client_updated_at || remoteRow.server_updated_at);
        if (localTime > remoteTime) uploadIds.push(id);
        else downloadIds.push(id);
      } else if (localChanged) uploadIds.push(id);
      else if (remoteChanged) downloadIds.push(id);
    }

    return {
      uploadIds: [...new Set(uploadIds)],
      downloadIds: [...new Set(downloadIds)],
      deleteLocalIds: [...new Set(deleteLocalIds)],
      remoteDeletes
    };
  }

  function reconcile(localTrips, remoteRows, tombstones) {
    const local = new Map((localTrips || []).map(trip => [String(trip.id), trip]));
    const remote = new Map((remoteRows || []).map(row => [String(row.trip_id), row]));
    const deleted = new Map((tombstones || []).map(item => [String(item.trip_id), item.deleted_at]));
    const uploads = [], remoteDeletes = [];

    for (const [id, row] of remote) {
      const remoteDeletedAt = row.deleted_at;
      const localDeletedAt = deleted.get(id);
      const localTrip = local.get(id);
      const remoteTime = tripTimestamp(row.payload, row.client_updated_at || row.server_updated_at);
      if (remoteDeletedAt) {
        if (!localTrip || timestamp(remoteDeletedAt) >= tripTimestamp(localTrip)) {
          local.delete(id);
          deleted.set(id, remoteDeletedAt);
          continue;
        }
        deleted.delete(id);
      }
      if (localDeletedAt) {
        if (timestamp(localDeletedAt) > remoteTime) {
          local.delete(id);
          remoteDeletes.push({ trip_id: id, deleted_at: localDeletedAt });
          continue;
        }
        deleted.delete(id);
      }
      if (!localTrip) {
        local.set(id, normalizeTripFromCloud(row.payload, id));
        continue;
      }
      const localTime = tripTimestamp(localTrip);
      if (fingerprint(localTrip) === fingerprint(row.payload)) continue;
      if (remoteTime > localTime) local.set(id, normalizeTripFromCloud(row.payload, id));
      else uploads.push(localTrip);
    }

    for (const [id, trip] of local) {
      if (!remote.has(id)) {
        if (deleted.has(id)) local.delete(id);
        else uploads.push(trip);
      }
    }
    for (const [id, deletedAt] of deleted) {
      if (!remote.has(id)) remoteDeletes.push({ trip_id: id, deleted_at: deletedAt });
    }
    return { trips: [...local.values()], uploads, remoteDeletes, tombstones: [...deleted].map(([trip_id, deleted_at]) => ({ trip_id, deleted_at })) };
  }

  function start(win) {
    const auth = win.MinhasViagensAuth;
    const app = win.MinhasViagensApp;
    const session = auth?.getSession();
    if (!session?.user?.id || !app) return;
    const client = auth.getClient();
    const userId = session.user.id;
    const keys = userStorageKeys(userId);
    const tombstoneKey = keys.tombstones;
    const migrationKey = keys.migration;
    const syncStateKey = keys.syncState;
    const statusEl = win.document.getElementById("syncStatus");
    let timer = null, syncing = false, rerun = false, initialized = false, suppressSchedule = false;
    const stats = win.MinhasViagensSyncStats = {
      version: "0.14.9",
      requests: 0,
      metadataRowsDownloaded: 0,
      payloadRowsDownloaded: 0,
      estimatedBytesDownloaded: 0,
      rowsUploaded: 0,
      estimatedBytesUploaded: 0,
      fullSyncs: 0,
      incrementalSyncs: 0,
      lastSyncAt: null
    };

    const readJson = (key, fallback) => { try { return JSON.parse(win.localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
    const writeJson = (key, value) => { win.localStorage.setItem(key, JSON.stringify(value)); return true; };
    const tombstones = () => readJson(tombstoneKey, []);
    const setStatus = (text, state = "", details = "") => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.dataset.state = state;
      statusEl.title = details || text;
    };
    const pendingStatus = () => setStatus(win.navigator.onLine ? "Alterações pendentes" : "Offline");
    const recordDownload = (value, kind) => {
      stats.requests += 1;
      stats.estimatedBytesDownloaded += byteSize(value);
      if (kind === "metadata") stats.metadataRowsDownloaded += value?.length || 0;
      else stats.payloadRowsDownloaded += value?.length || 0;
    };
    const recordUpload = value => {
      stats.requests += 1;
      stats.rowsUploaded += value?.length || 0;
      stats.estimatedBytesUploaded += byteSize(value);
    };

    async function uploadTrips(trips) {
      if (!trips.length) return;
      const now = new Date().toISOString();
      const rows = trips.map(trip => ({
        user_id: userId,
        trip_id: String(trip.id),
        payload: serializeTripForCloud(trip),
        client_updated_at: new Date(tripTimestamp(trip) || Date.now()).toISOString(),
        deleted_at: null
      }));
      for (let offset = 0; offset < rows.length; offset += SYNC_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + SYNC_BATCH_SIZE);
        const { error } = await client.from("trips").upsert(batch, { onConflict: "user_id,trip_id" });
        if (error) throw error;
        recordUpload(batch);
      }
      return now;
    }

    async function uploadDeletes(items) {
      for (let offset = 0; offset < items.length; offset += SYNC_BATCH_SIZE) {
        const batch = items.slice(offset, offset + SYNC_BATCH_SIZE).map(item => ({
          user_id: userId, trip_id: String(item.trip_id), payload: {},
          client_updated_at: item.deleted_at, deleted_at: item.deleted_at
        }));
        const { error } = await client.from("trips").upsert(batch, { onConflict: "user_id,trip_id" });
        if (error) throw error;
        recordUpload(batch);
      }
    }

    async function fetchRemoteTrips() {
      const { data, error } = await client
        .from("trips")
        .select("trip_id,payload,client_updated_at,server_updated_at,deleted_at")
        .eq("user_id", userId)
        .not("trip_id", "like", `${ROAD_CLOUD_PREFIX}%`);
      if (error) throw error;
      const rows = (data || []).filter(row => !String(row.trip_id || "").startsWith(ROAD_CLOUD_PREFIX));
      recordDownload(rows, "payload");
      return rows;
    }

    async function fetchRemoteTripMetadata() {
      const { data, error } = await client
        .from("trips")
        .select("trip_id,client_updated_at,server_updated_at,deleted_at")
        .eq("user_id", userId)
        .not("trip_id", "like", `${ROAD_CLOUD_PREFIX}%`);
      if (error) throw error;
      const rows = (data || []).filter(row => !String(row.trip_id || "").startsWith(ROAD_CLOUD_PREFIX));
      recordDownload(rows, "metadata");
      return rows;
    }

    async function fetchRemoteTripsByIds(ids) {
      const rows = [];
      for (let offset = 0; offset < ids.length; offset += SYNC_BATCH_SIZE) {
        const batch = ids.slice(offset, offset + SYNC_BATCH_SIZE);
        const { data, error } = await client
          .from("trips")
          .select("trip_id,payload,client_updated_at,server_updated_at,deleted_at")
          .eq("user_id", userId)
          .in("trip_id", batch);
        if (error) throw error;
        const received = (data || []).filter(row => !String(row.trip_id || "").startsWith(ROAD_CLOUD_PREFIX));
        recordDownload(received, "payload");
        rows.push(...received);
      }
      return rows;
    }

    function replaceTripsWithoutScheduling(trips) {
      suppressSchedule = true;
      try { app.replaceTrips(trips); }
      finally { suppressSchedule = false; }
    }

    async function bootstrapSync() {
      stats.fullSyncs += 1;
      const data = await fetchRemoteTrips();
      const legacyEntries = app.getTrips().length ? [] : findLegacyTrips(win.localStorage);
      const allLegacy = uniqueLegacyTrips(legacyEntries);
      const retiredKeys = allLegacy.length && verifyTripsAreRemote(allLegacy, data)
        ? retireVerifiedLegacyStorage(win.localStorage, legacyEntries, data) : [];
      const result = reconcile(app.getTrips(), data, tombstones());
      await uploadTrips(result.uploads);
      await uploadDeletes(result.remoteDeletes);
      writeJson(tombstoneKey, []);
      if (fingerprint({ trips: app.getTrips() }) !== fingerprint({ trips: result.trips })) {
        if (retiredKeys.length) {
          writeJson(keys.trips, result.trips.map(serializeTripForCloud));
          win.localStorage.setItem(migrationKey, new Date().toISOString());
        }
        replaceTripsWithoutScheduling(result.trips);
      }
      const metadata = (result.uploads.length || result.remoteDeletes.length)
        ? await fetchRemoteTripMetadata()
        : data;
      writeJson(syncStateKey, createSyncState(result.trips, metadata));
      return retiredKeys.length > 0;
    }

    async function incrementalSync(previousState) {
      stats.incrementalSyncs += 1;
      const metadata = await fetchRemoteTripMetadata();
      const currentTrips = app.getTrips();
      const plan = planIncrementalSync(currentTrips, metadata, tombstones(), previousState);
      const downloaded = await fetchRemoteTripsByIds(plan.downloadIds);
      const merged = new Map(currentTrips.map(trip => [String(trip.id), trip]));
      for (const id of plan.deleteLocalIds) merged.delete(String(id));
      for (const row of downloaded) {
        const id = String(row.trip_id);
        if (row.deleted_at) merged.delete(id);
        else merged.set(id, normalizeTripFromCloud(row.payload, id));
      }
      const uploads = plan.uploadIds.map(id => merged.get(String(id))).filter(Boolean);
      await uploadTrips(uploads);
      await uploadDeletes(plan.remoteDeletes);
      writeJson(tombstoneKey, []);
      const resultTrips = [...merged.values()];
      if (fingerprint({ trips: currentTrips }) !== fingerprint({ trips: resultTrips })) {
        replaceTripsWithoutScheduling(resultTrips);
      }
      const finalMetadata = (uploads.length || plan.remoteDeletes.length)
        ? await fetchRemoteTripMetadata()
        : metadata;
      writeJson(syncStateKey, createSyncState(resultTrips, finalMetadata));
    }

    async function syncNow() {
      if (syncing) { rerun = true; return; }
      if (!win.navigator.onLine) { pendingStatus(); return; }
      syncing = true;
      setStatus("Sincronizando…");
      let confirmedLegacyRetired = false;
      try {
        const savedState = readJson(syncStateKey, null);
        if (validSyncState(savedState)) await incrementalSync(savedState);
        else confirmedLegacyRetired = await bootstrapSync();
        initialized = true;
        stats.lastSyncAt = new Date().toISOString();
        setStatus("Sincronizado", "synced");
      } catch (error) {
        console.error("Falha ao sincronizar viagens", error);
        const details = syncErrorLabel(error);
        if (confirmedLegacyRetired) setStatus("Suas viagens já estão seguras na sua conta, mas não foi possível criar o cache local neste dispositivo.", "error", details);
        else if (isMissingTable(error)) setStatus("A sincronização ainda não foi configurada no banco. Suas viagens continuam salvas neste dispositivo.", "error", details);
        else setStatus("Erro ao sincronizar", "error", details);
      } finally {
        syncing = false;
        if (rerun) { rerun = false; schedule(100); }
      }
    }

    function schedule(delay = 900) {
      if (suppressSchedule) return;
      pendingStatus();
      clearTimeout(timer);
      timer = setTimeout(syncNow, delay);
    }

    function recordDeletion(tripId) {
      const items = tombstones().filter(item => String(item.trip_id) !== String(tripId));
      items.push({ trip_id: String(tripId), deleted_at: new Date().toISOString() });
      writeJson(tombstoneKey, items);
      schedule();
    }

    async function offerLegacyMigration() {
      if (app.getTrips().length || win.localStorage.getItem(migrationKey)) return;
      const initialEntries = findLegacyTrips(win.localStorage);
      const legacy = uniqueLegacyTrips(initialEntries);
      if (!legacy.length) return;
      const dialog = win.document.getElementById("legacyMigrationDialog");
      const message = win.document.getElementById("legacyMigrationText");
      const feedback = win.document.getElementById("legacyMigrationStatus");
      const confirm = win.document.getElementById("legacyMigrationConfirm");
      const later = win.document.getElementById("legacyMigrationLater");
      message.textContent = `Encontramos ${legacy.length} viagens salvas neste dispositivo. Deseja vinculá-las à sua conta para acessá-las em outros dispositivos?`;
      later.onclick = () => dialog.close();
      confirm.onclick = async () => {
        confirm.disabled = true;
        feedback.classList.remove("hidden"); feedback.textContent = "Vinculando viagens…";
        try {
          const result = await completeLegacyMigration({
            storage: win.localStorage,
            legacyEntries: findLegacyTrips(win.localStorage),
            fetchRemote: fetchRemoteTrips,
            uploadTrips,
            cacheKey: app.storageKey,
            migrationKey
          });
          replaceTripsWithoutScheduling(result.trips);
          const metadata = await fetchRemoteTripMetadata();
          writeJson(syncStateKey, createSyncState(result.trips, metadata));
          dialog.close();
          setStatus("Sincronizado", "synced");
        } catch (error) {
          console.error("Falha na migração legada", error);
          feedback.textContent = error.remoteSafe && error.legacyRetired
            ? "Suas viagens já estão seguras na sua conta, mas não foi possível criar o cache local neste dispositivo."
            : "Não foi possível vincular agora. As viagens originais continuam salvas neste dispositivo.";
          confirm.disabled = false;
        }
      };
      dialog.showModal();
    }

    win.MinhasViagensSync = { schedule, syncNow, recordDeletion, serializeTripForCloud, stats };
    win.document.getElementById("syncNowBtn")?.addEventListener("click", syncNow);
    win.addEventListener("offline", () => setStatus("Offline"));
    win.addEventListener("online", () => schedule(100));
    (async () => {
      await syncNow();
      await offerLegacyMigration();
    })();
    return { get initialized() { return initialized; } };
  }

  return { serializeTripForCloud, normalizeTripFromCloud, tripTimestamp, fingerprint, userStorageKeys, isMissingTable,
    findLegacyTrips, verifyTripsAreRemote, retireVerifiedLegacyStorage, completeLegacyMigration, reconcile,
    byteSize, remoteRevision, validSyncState, createSyncState, planIncrementalSync, start };
});
