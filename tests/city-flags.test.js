const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const stored = new Map();
const context = {
  console,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value)
  }
};
context.globalThis = context;
context.MinhasViagensAchievements = {
  groupForCity: () => ({ name: "São Paulo", code: "SP" })
};
context.fetch = async url => {
  const params = new URL(url).searchParams;
  if (params.get("action") === "wbsearchentities") {
    return { ok: true, json: async () => ({ search: [
      { id: "Q192181", label: "São José do Rio Preto", description: "município brasileiro localizado no estado de São Paulo" },
      { id: "Q5244604", label: "Aeroporto de São José do Rio Preto", description: "airport in São Paulo, Brazil" }
    ] }) };
  }
  return { ok: true, json: async () => ({ entities: {
    Q192181: { claims: {
      P41: [{ mainsnak: { datavalue: { value: "Flag of São José do Rio Preto SP.png" } } }],
      P625: [{ mainsnak: { datavalue: { value: { latitude: -20.8113, longitude: -49.3758 } } } }]
    } }
  } }) };
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("city-flags.js", "utf8"), context);

(async () => {
  const city = { city: "São José do Rio Preto", region: "SP", countryCode: "BR", lat: -20.8113, lng: -49.3758 };
  const url = await context.MinhasViagensCityFlags.flagForCity(city);
  assert.match(url, /commons\.wikimedia\.org/);
  assert.match(decodeURIComponent(url), /Flag of São José do Rio Preto SP\.png/);
  const cached = await context.MinhasViagensCityFlags.flagForCity(city);
  assert.equal(cached, url);
  console.log("city flag tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
