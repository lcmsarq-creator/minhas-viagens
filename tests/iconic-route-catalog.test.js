const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join("iconic-route-catalog", "v1");

test("catálogo hospedado contém as 86 rotas icônicas", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, "bundle.json"), "utf8"));
  assert.equal(manifest.schema, "iconic-route-preview-manifest-v1");
  assert.equal(manifest.catalogSchema, "iconic-route-preview-polyline5-v1");
  assert.equal(bundle.schema, "iconic-route-preview-bundle-v1");
  assert.equal(bundle.catalogSchema, manifest.catalogSchema);
  assert.equal(manifest.routeCount, 86);
  assert.equal(bundle.routeCount, 86);
  assert.deepEqual(Object.keys(bundle.routes).sort(), Object.keys(manifest.routes).sort());
});

test("cada rota possui arquivo individual hospedado", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  for (const [id, item] of Object.entries(manifest.routes)) {
    const filename = path.join(ROOT, item.path);
    assert.ok(fs.existsSync(filename), `${id}: arquivo ausente`);
    const entry = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(entry.kind, "iconic_route_preview_catalog");
    assert.equal(entry.schema, manifest.catalogSchema);
    assert.equal(entry.id, id);
    assert.ok(Array.isArray(entry.encodedLines) && entry.encodedLines.length > 0, `${id}: sem geometria`);
  }
});

test("bundle é leve e preserva a descontinuidade da Via Panamericana", () => {
  const bundlePath = path.join(ROOT, "bundle.json");
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  assert.ok(fs.statSync(bundlePath).size < 250000, "bundle deve permanecer abaixo de 250 KB");
  assert.equal(bundle.routes["via-panamericana"].encodedLines.length, 2);
});

test("runtime carrega bundle único e oferece fallback individual", () => {
  const source = fs.readFileSync("iconic-route-catalog.js", "utf8");
  assert.match(source, /bundle\.json/);
  assert.match(source, /iconic-route-preview-bundle-v1/);
  assert.match(source, /const entries = new Map\(\)/);
  assert.match(source, /function entryFor\(routeId\)/);
  assert.match(source, /async function loadRoute\(routeId\)/);
  assert.match(source, /force-cache/);
});
