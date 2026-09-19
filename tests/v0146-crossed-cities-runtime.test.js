const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

function placeNode(id, name, place, lat, lon, population="") {
  return {id,type:"node",lat,lon,tags:{name,place,...(population?{population}:{})}};
}

function loadModule(elements = []) {
  let fetchCalls = 0;
  let saves = 0;
  let renders = 0;
  const syncDelays = [];
  const context = {
    window:null,
    globalThis:null,
    console,
    AbortController,
    URL,
    queueMicrotask,
    state:{trips:[],activeTripDetailId:null},
    tripLatLngs:trip=>trip.line || [],
    cityConquestsForTrip:()=>[],
    saveTrips:()=>{saves += 1; return true;},
    renderAchievements:()=>{renders += 1;},
    renderTripDetail:()=>{},
    setTimeout:(fn,ms)=>{ if (ms <= 150) queueMicrotask(fn); return 1; },
    clearTimeout:()=>{},
    fetch:async()=>{
      fetchCalls += 1;
      return {ok:true,json:async()=>({elements})};
    },
    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}}
  };
  context.window = context;
  context.globalThis = context;
  context.MINHAS_VIAGENS_APP_VERSION = "0.14.6";
  context.MinhasViagensCrossingDetection = core;
  context.MinhasViagensSync = {schedule:delay=>syncDelays.push(delay)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0146-crossed-cities-runtime.js","utf8"),context);
  return {
    api:context.MinhasViagensCrossedCitiesV0146,
    context,
    stats:()=>({fetchCalls,saves,renders,syncDelays:[...syncDelays]})
  };
}

test("assinatura usa a polyline compactada real e muda quando a rota muda", () => {
  const {api} = loadModule();
  const a = {id:"a",updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abc",pointCount:3}};
  const b = {id:"a",updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abd",pointCount:3}};
  assert.notEqual(api.routeFingerprint(a),api.routeFingerprint(b));
  assert.notEqual(api.routeSignature(a),api.routeSignature(b));
});

test("consulta Overpass é leve e usa center em vez de geometria administrativa completa", () => {
  const {api} = loadModule();
  const query = api.overpassQueryForTile("-21:-50");
  assert.match(query,/node\["place"/);
  assert.match(query,/out body center;/);
  assert.doesNotMatch(query,/admin_level/);
  assert.doesNotMatch(query,/out center geom/);
});

test("cache espacial reutiliza a mesma consulta e detecta a cidade realmente atravessada", async () => {
  const elements = [
    placeNode(1,"Cidade Cruzada","town",-20.80,-49.35,"30000"),
    placeNode(2,"Cidade Distante","town",-20.70,-49.35,"30000")
  ];
  const {api,stats} = loadModule(elements);
  const trip = {id:"t1",mode:"carro",line:[[-20.80,-49.45],[-20.80,-49.25]],routeGeometry:{encodedPolyline:"abc",pointCount:2}};
  const first = await api.scanTripCities(trip);
  const second = await api.scanTripCities(trip);
  assert.deepEqual(first.map(city=>city.city),["Cidade Cruzada"]);
  assert.deepEqual(second.map(city=>city.city),["Cidade Cruzada"]);
  assert.equal(stats().fetchCalls,1);
});

test("cada viagem concluída é salva, renderizada e agenda sincronização imediatamente", () => {
  const {api,stats} = loadModule();
  const trip = {id:"t2",mode:"carro",updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abc",pointCount:2},conquests:{}};
  const city = {city:"Teste",label:"Teste",lat:-20,lng:-49,source:"route-place-incremental"};
  api.persistTripResult(trip,[city]);
  assert.equal(trip.routeCityScanVersion,"route-city-crossings-v5-incremental");
  assert.ok(trip.routeCityRuntimeSignature.includes("route-city-crossings-v5-incremental"));
  assert.deepEqual(trip.routeCityConquests,[city]);
  assert.equal(stats().saves,1);
  assert.equal(stats().renders,1);
  assert.deepEqual(stats().syncDelays,[1200]);
});

test("v0.14.6 fica depois das camadas v0.14.4 e v0.14.5 no loader", () => {
  const auth = fs.readFileSync("auth.js","utf8");
  const a = auth.indexOf('"v0144-crossing-fix.js"');
  const b = auth.indexOf('"v0145-crossed-cities.js"');
  const c = auth.indexOf('"v0146-crossed-cities-runtime.js"');
  assert.ok(a >= 0 && b > a && c > b);
});
