(() => {
  "use strict";

  const userId = window.MinhasViagensAuth?.getUser()?.id;
  if (!userId) {
    window.MinhasViagensStorageReady = Promise.resolve();
    return;
  }

  const STORAGE_KEY = `minhasViagens.trips.${userId}.v1`;
  const DB_NAME = "minhasViagensLocalCache.v1";
  const STORE_NAME = "tripCache";
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  let memoryValue = null;
  let db = null;
  let writeChain = Promise.resolve();

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  function idbPut(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key, userId, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Gravação IndexedDB cancelada"));
    });
  }

  function idbDelete(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function cleanupReconstructibleLocalCaches() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && (
          key.startsWith("minhasViagens.highwayGeometry.v1:") ||
          key.startsWith("minhasViagens.highwayProgress.v1:")
        )) keys.push(key);
      }
      keys.forEach(key => originalRemoveItem.call(localStorage, key));
    } catch (error) {
      console.warn("Não foi possível limpar caches locais antigos", error);
    }
  }

  Storage.prototype.getItem = function patchedGetItem(key) {
    if (this === window.localStorage && key === STORAGE_KEY) return memoryValue;
    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this === window.localStorage && key === STORAGE_KEY) {
      memoryValue = String(value);
      writeChain = writeChain
        .then(() => db ? idbPut(STORAGE_KEY, memoryValue) : Promise.reject(new Error("IndexedDB ainda não inicializado")))
        .catch(error => {
          console.error("Falha ao salvar cache local no IndexedDB", error);
        });
      window.MinhasViagensStorageLastWrite = writeChain;
      return;
    }
    return originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    if (this === window.localStorage && key === STORAGE_KEY) {
      memoryValue = null;
      writeChain = writeChain.then(() => db ? idbDelete(STORAGE_KEY) : undefined).catch(() => {});
      window.MinhasViagensStorageLastWrite = writeChain;
      return;
    }
    return originalRemoveItem.call(this, key);
  };

  window.MinhasViagensStorageReady = (async () => {
    cleanupReconstructibleLocalCaches();
    try {
      db = await openDb();
      const localValue = originalGetItem.call(localStorage, STORAGE_KEY);
      const indexedValue = await idbGet(STORAGE_KEY);

      // Durante a transição, a cópia existente no localStorage tem prioridade.
      // Depois da primeira gravação confirmada ela é removida, liberando a cota.
      if (localValue != null) {
        memoryValue = localValue;
        await idbPut(STORAGE_KEY, localValue);
        originalRemoveItem.call(localStorage, STORAGE_KEY);
      } else {
        memoryValue = indexedValue;
      }
    } catch (error) {
      console.error("IndexedDB principal indisponível; usando armazenamento local quando possível", error);
      db = null;
      memoryValue = originalGetItem.call(localStorage, STORAGE_KEY);

      // Mantém o app utilizável mesmo em navegadores sem IndexedDB. Não propaga
      // QuotaExceededError para o fluxo normal nem mostra alertas repetitivos.
      Storage.prototype.setItem = function fallbackSetItem(key, value) {
        if (this === window.localStorage && key === STORAGE_KEY) {
          memoryValue = String(value);
          try { originalSetItem.call(this, key, value); } catch (storageError) {
            console.warn("Cache local sem espaço; a sincronização remota continuará disponível", storageError);
          }
          return;
        }
        return originalSetItem.call(this, key, value);
      };
    }
  })();
})();
