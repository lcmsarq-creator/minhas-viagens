const test = require("node:test");
const assert = require("node:assert/strict");
const sync = require("../sync.js");

const trip = (id, updatedAt, name = id) => ({ id, name, updatedAt, routeGeometry: { coordinates: [[1, 2]] } });
const row = (value, options = {}) => ({ trip_id: value.id, payload: value,
  client_updated_at: options.clientUpdatedAt || value.updatedAt,
  server_updated_at: options.serverUpdatedAt || value.updatedAt,
  deleted_at: options.deletedAt || null });

test("local vazio + remoto com viagens", () => {
  const result = sync.reconcile([], [row(trip("a", "2026-01-01"))], []);
  assert.deepEqual(result.trips.map(item => item.id), ["a"]); assert.equal(result.uploads.length, 0);
});
test("local com viagens + remoto vazio", () => {
  assert.deepEqual(sync.reconcile([trip("a", "2026-01-01")], [], []).uploads.map(item => item.id), ["a"]);
});
test("ambos iguais", () => {
  const value = trip("a", "2026-01-01"); assert.equal(sync.reconcile([value], [row(value)], []).uploads.length, 0);
});
test("local mais novo", () => {
  assert.equal(sync.reconcile([trip("a", "2026-02-01", "local")], [row(trip("a", "2026-01-01", "remoto"))], []).uploads[0].name, "local");
});
test("remoto mais novo", () => {
  assert.equal(sync.reconcile([trip("a", "2026-01-01", "local")], [row(trip("a", "2026-02-01", "remoto"))], []).trips[0].name, "remoto");
});
test("viagem excluída remotamente", () => {
  assert.equal(sync.reconcile([trip("a", "2026-01-01")], [row(trip("a", "2026-01-01"), { deletedAt: "2026-02-01" })], []).trips.length, 0);
});
test("exclusão local pendente", () => {
  const result = sync.reconcile([], [row(trip("a", "2026-01-01"))], [{ trip_id: "a", deleted_at: "2026-02-01" }]);
  assert.equal(result.remoteDeletes[0].trip_id, "a"); assert.equal(result.trips.length, 0);
});
test("tombstone antigo não apaga remoto novo", () => {
  const result = sync.reconcile([], [row(trip("a", "2026-03-01"))], [{ trip_id: "a", deleted_at: "2026-02-01" }]);
  assert.equal(result.trips[0].id, "a"); assert.equal(result.tombstones.length, 0);
});
test("perda de internet mantém alteração local", () => {
  const local = trip("offline", "2026-01-01"); assert.deepEqual(sync.reconcile([local], [], []).trips, [local]);
});
test("retorno da internet recebe alteração", () => {
  assert.equal(sync.reconcile([], [row(trip("online", "2026-01-01"))], []).trips[0].id, "online");
});
test("falha Supabase e tabela inexistente são distintas", () => {
  assert.equal(sync.isMissingTable({ code: "500", message: "network" }), false);
  assert.equal(sync.isMissingTable({ code: "42P01", message: "missing" }), true);
});
test("conta A e conta B no mesmo navegador", () => {
  assert.notEqual(sync.userStorageKeys("A").trips, sync.userStorageKeys("B").trips);
  assert.notEqual(sync.userStorageKeys("A").tombstones, sync.userStorageKeys("B").tombstones);
});
test("importação JSON remove somente caches pesados", () => {
  const imported = { ...trip("a", "2026-01-01"), notes: "texto", roadSegments: { huge: [1] }, overpassCache: [2] };
  const serialized = sync.serializeTripForCloud(imported);
  assert.equal(serialized.notes, "texto"); assert.ok(serialized.routeGeometry);
  assert.equal(serialized.roadSegments, undefined); assert.equal(serialized.overpassCache, undefined); assert.ok(imported.roadSegments);
});
test("migração do armazenamento legado é não destrutiva", () => {
  const legacy = { ...trip("legacy", "2025-01-01"), roadSegments: { "BR-1": [[[1, 2]]] } };
  const migrated = sync.serializeTripForCloud(legacy);
  assert.equal(migrated.id, "legacy"); assert.equal(migrated.roadSegments, undefined); assert.ok(legacy.roadSegments);
});
