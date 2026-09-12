const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function loadRouteInteraction() {
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("route-interaction.js", "utf8"), context);
  return context.MinhasViagensRouteInteraction;
}

test("área de captura usa traço largo e quase transparente, mas clicável", () => {
  const interaction = loadRouteInteraction();
  const options = interaction.hitLineOptions("edit-route-hit", 28);

  assert.equal(options.weight, 28);
  assert.ok(options.opacity > 0, "opacity zero pode impedir a captura do ponteiro em SVG");
  assert.ok(options.opacity < .05, "a área de captura não deve ficar visível no mapa");
  assert.equal(options.interactive, true);
  assert.equal(options.bubblingMouseEvents, false);
  assert.equal(options.className, "edit-route-hit");
});

test("área de captura pode acompanhar uma rota temporariamente não interativa", () => {
  const interaction = loadRouteInteraction();
  const options = interaction.hitLineOptions("trip-route-hit", 24, false);
  assert.equal(options.interactive, false);
});

test("área ampliada está ligada às viagens, alternativas e edição", () => {
  const appSource = fs.readFileSync("script.js", "utf8");
  const clickPatchSource = fs.readFileSync("route-click-hotfix.js", "utf8");

  assert.match(appSource, /hitLineOptions\("trip-route-hit", 24/);
  assert.match(appSource, /hitLineOptions\("route-option-hit", 24/);
  assert.match(appSource, /hitLineOptions\("edit-route-hit", 28/);
  assert.match(appSource, /editVisibleLine[^\n]+interactive: false/);
  assert.match(clickPatchSource, /line\._routeHitLine/);
});
