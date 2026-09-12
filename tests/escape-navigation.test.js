const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  let keydownHandler;
  let highlightCloses = 0;
  let tripCloses = 0;
  const context = {
    console,
    state: {
      drawing: false,
      editingTripId: null,
      tripRoadLayer: { id: "highlight" },
      activeTripDetailId: "trip-1"
    },
    els: { routeChooser: { classList: { contains: value => value === "hidden" } } },
    closeTripRoadHighlight() {
      highlightCloses += 1;
      context.state.tripRoadLayer = null;
    },
    showTripList() {
      tripCloses += 1;
      context.state.activeTripDetailId = null;
    },
    document: {
      addEventListener(type, handler) { if (type === "keydown") keydownHandler = handler; },
      querySelector(selector) {
        if (selector === "dialog[open]") return null;
        if (selector === ".brand p") return null;
        return null;
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("escape-navigation.js", "utf8"), context);
  return { context, keydownHandler, counts: () => ({ highlightCloses, tripCloses }) };
}

function escapeEvent(target = null) {
  return {
    key: "Escape",
    defaultPrevented: false,
    target,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {}
  };
}

test("primeiro Esc remove o destaque e o segundo fecha a viagem", () => {
  const { keydownHandler, counts } = fixture();

  keydownHandler(escapeEvent());
  assert.deepEqual(counts(), { highlightCloses: 1, tripCloses: 0 });

  keydownHandler(escapeEvent());
  assert.deepEqual(counts(), { highlightCloses: 1, tripCloses: 1 });
});

test("Esc não fecha a viagem enquanto o usuário digita", () => {
  const { keydownHandler, counts } = fixture();
  const input = { closest: selector => selector.includes("input") ? input : null };
  keydownHandler(escapeEvent(input));
  assert.deepEqual(counts(), { highlightCloses: 0, tripCloses: 0 });
});
