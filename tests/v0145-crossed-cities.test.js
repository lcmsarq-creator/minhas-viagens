const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

function adminRelation(id, name, uf) {
  const polygon = [[-20.03,-46.08],[-20.03,-46.02],[-19.97,-46.02],[-19.97,-46.08],[-20.03,-46.08]];
  return {
    id,
    type:"relation",
    tags:{name,boundary:"administrative",admin_level:"8","ISO3166-2":`BR-${uf}`},
    center:{lat:-20,lon:-46.05},
    members:[{role:"outer",geometry:polygon.map(([lat,lon])=>({lat,lon}))}]
  };
}

function placeNode(id, name, place, lat, lon, population="") {
  return {id,type:"node",lat,lon,tags:{name,place,...(population?{population}:{})}};
}

function loadModule(elements) {
  const context = {
    window:null,
    globalThis:null,
    console,
    AbortController,
    URL,
    state:{trips:[],activeTripDetailId:null},
    tripLatLngs:trip=>trip.line,
    cityConquestsForTrip:()=>[],
    saveTrips:()=>{},
    renderAchievements:()=>{},
    renderTripDetail:()=>{},
    setTimeout:()=>0,
    clearTimeout:()=>{},
    fetch:async()=>({ok:true,json:async()=>({elements})})
  };
  context.window = context;
  context.globalThis = context;
  context.MINHAS_VIAGENS_APP_VERSION = "0.14.7";
  context.MinhasViagensCrossingDetection = core;
  context.MinhasViagensApp = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0145-crossed-cities.js","utf8"),context);
  return context.MinhasViagensCrossedCitiesV0145;
}

test("limite municipal presente não desliga outras cidades urbanas do mesmo bloco", async () => {
  const elements = [
    adminRelation(100,"Cidade A","MG"),
    placeNode(1,"Cidade A","city",-20,-46.05,"80000"),
    placeNode(2,"Cidade B","town",-20,-45.95,"25000"),
    placeNode(3,"Cidade Distante","town",-20.05,-46.00,"25000")
  ];
  const api = loadModule(elements);
  const trip = {id:"t1",mode:"carro",line:[[-20,-46.10],[-20,-45.90]],routeGeometry:{coordinates:[[-46.10,-20],[-45.90,-20]]}};
  const cities = await api.scanTripCities(trip);
  assert.deepEqual(cities.map(c=>c.city).sort(),["Cidade A","Cidade B"]);
  const a = cities.find(c=>c.city === "Cidade A");
  assert.equal(a.region,"MG");
  assert.equal(a.countryCode,"BR");
});

test("raio urbano cresce com porte da localidade, sem transformar proximidade ampla em cruzamento", () => {
  const api = loadModule([]);
  assert.equal(api.urbanRadiusKm({place:"village"}),1.1);
  assert.equal(api.urbanRadiusKm({place:"town"}),2.2);
  assert.equal(api.urbanRadiusKm({place:"city"}),3.6);
  assert.equal(api.urbanRadiusKm({place:"city",population:"1.500.000"}),6);
});

test("polígono urbano tem prioridade sobre distância ao ponto central", () => {
  const api = loadModule([]);
  const urban = {
    id:50,type:"way",center:{lat:-20.05,lon:-46.05},
    tags:{name:"Cidade Polígono",place:"town"},
    geometry:[
      {lat:-20.01,lon:-46.01},{lat:-20.01,lon:-45.99},{lat:-19.99,lon:-45.99},
      {lat:-19.99,lon:-46.01},{lat:-20.01,lon:-46.01}
    ]
  };
  const route=[[-20,-46.02],[-20,-45.98]];
  assert.equal(api.placeCrossesRoute(route,urban),true);
});

test("v0.14.7 é carregada depois da correção v0.14.4", () => {
  const auth = fs.readFileSync("auth.js","utf8");
  const oldIndex = auth.indexOf('"v0144-crossing-fix.js"');
  const newIndex = auth.indexOf('"v0145-crossed-cities.js"');
  assert.ok(oldIndex >= 0);
  assert.ok(newIndex > oldIndex);
});
