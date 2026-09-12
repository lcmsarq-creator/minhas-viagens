const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "storage-pre.js"), "utf8");

test("inicialização não fica travada quando o IndexedDB não responde", async () => {
  class FakeStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }

  const localStorage = new FakeStorage();
  const storageKey = "minhasViagens.trips.user-1.v1";
  localStorage.setItem(storageKey, '[{"id":"trip-1"}]');
  const window = {
    MinhasViagensAuth: { getUser: () => ({ id: "user-1" }) },
    MINHAS_VIAGENS_STORAGE_TIMEOUT_MS: 10,
    indexedDB: { open: () => ({}) },
    localStorage
  };
  const context = { window, localStorage, indexedDB: window.indexedDB, Storage: FakeStorage, console, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);

  await Promise.race([
    window.MinhasViagensStorageReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error("inicialização continuou travada")), 200))
  ]);
  assert.equal(localStorage.getItem(storageKey), '[{"id":"trip-1"}]');
});
