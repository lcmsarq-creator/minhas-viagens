const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

const CSV = `codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario\n3500001,Cidade Cruzada,-20.8000,-49.3500,0,35,1,17,America/Sao_Paulo\n3500002,Cidade Distante,-20.7000,-49.3500,0,35,2,17,America/Sao_Paulo\n3550308,São Paulo,-23.5505,-46.6333,1,35,7107,11,America/Sao_Paulo\n`;

function loadModule() {
  let catalogFetches = 0;
  let overpassFetches = 0;
  let saves = 0;
  let renders = 0;
  const syncDelays = [];
  const context = {
    window:null,
    globalThis:null,
    console,
    AbortController,
    URL,
    state:{trips:[],activeTripDetailId:null},
    tripLatLngs:trip=>trip.line || [],
    cityConquestsForTrip:()=>[],
    saveTrips:()=>{saves += 1; return true;},
    renderAchievements:()=>{renders += 1;},
    renderTripDetail:()=>{},
    setTimeout:()=>1,
    clearTimeout:()=>{},
    fetch:async url=>{
      if (String(url).includes("municipios.csv")) {
        catalogFetches += 1;
        return {ok:true,text:async()=>CSV};
      }
      overpassFetches += 1;
      return {ok:true,json:async()=>({elements:[]})};
    },
    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}}
  };
  context.window = context;
  context.globalThis = context;
  context.MINHAS_VIAGENS_APP_VERSION = "0.14.7";
  context.MINHAS_VIAGENS_CITY_SCANNER_GENERATION = "v0147";
  context.MinhasViagensCrossingDetection = core;
  context.MinhasViagensSync = {schedule:delay=>syncDelays.push(delay)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0147-crossed-cities-local.js","utf8"),context);
  return {
    api:context.MinhasViagensCrossedCitiesV0147,
    context,
    stats:()=>({catalogFetches,overpassFetches,saves,renders,syncDelays:[...syncDelays]})
  };
}

test("catálogo brasileiro reconhece município atravessado sem consultar Overpass", async () => {
  const {api,stats} = loadModule();
  await api.catalogReady;
  const trip = {
    id:"br-1", mode:"carro",
    startPlace:{countryCode:"BR"}, endPlace:{countryCode:"BR"},
    line:[[-20.80,-49.45],[-20.80,-49.25]],
    routeGeometry:{encodedPolyline:"abc",pointCount:2}
  };
  const result = await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.equal(result.source,"local-br");
  assert.deepEqual(Array.from(result.cities, city=>city.city),["Cidade Cruzada"]);
  assert.equal(result.cities[0].region,"São Paulo");
  assert.equal(result.cities[0].countryCode,"BR");
  assert.equal(stats().catalogFetches,1);
  assert.equal(stats().overpassFetches,0);
});

test("rota compactada participa da assinatura e força novo scan quando muda", () => {
  const {api} = loadModule();
  const a = {updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abc",pointCount:3}};
  const b = {updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abd",pointCount:3}};
  assert.notEqual(api.routeFingerprint(a),api.routeFingerprint(b));
  assert.notEqual(api.routeSignature(a),api.routeSignature(b));
});

test("resultado completo é persistido e agenda sincronização Supabase", () => {
  const {api,stats} = loadModule();
  const trip = {id:"br-2",mode:"carro",updatedAt:"2026-09-19",routeGeometry:{encodedPolyline:"abc",pointCount:2},conquests:{}};
  const city = {city:"Teste",label:"Teste",region:"São Paulo",country:"Brasil",countryCode:"BR",lat:-20,lng:-49};
  api.persistTripResult(trip,{cities:[city],complete:true,source:"local-br"});
  assert.equal(trip.routeCityScanVersion,"route-city-crossings-v6-local-catalog");
  assert.equal(trip.routeCityScanComplete,true);
  assert.deepEqual(trip.routeCityConquests,[city]);
  assert.equal(stats().saves,1);
  assert.equal(stats().renders,1);
  assert.deepEqual(stats().syncDelays,[350]);
});

test("loader seleciona v0.14.7 depois das camadas anteriores", () => {
  const auth = fs.readFileSync("auth.js","utf8");
  assert.match(auth,/MINHAS_VIAGENS_CITY_SCANNER_GENERATION="v0147"/);
  const v146 = auth.indexOf('"v0146-crossed-cities-runtime.js"');
  const v147 = auth.indexOf('"v0147-crossed-cities-local.js"');
  assert.ok(v146 >= 0 && v147 > v146);
});

test("scanners antigos ficam inativos quando a geração v0147 está selecionada", () => {
  const v144 = fs.readFileSync("v0144-crossing-fix.js","utf8");
  const v145 = fs.readFileSync("v0145-crossed-cities.js","utf8");
  const v146 = fs.readFileSync("v0146-crossed-cities-runtime.js","utf8");
  assert.match(v144,/MINHAS_VIAGENS_CITY_SCANNER_GENERATION === "v0147"/);
  assert.match(v145,/MINHAS_VIAGENS_CITY_SCANNER_GENERATION === "v0147"/);
  assert.match(v146,/MINHAS_VIAGENS_CITY_SCANNER_GENERATION === "v0147"/);
});
