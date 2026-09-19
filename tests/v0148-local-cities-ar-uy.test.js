const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

const BR_CSV = `codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario\n4300001,Cidade BR,-31.0000,-54.0000,0,43,1,55,America/Sao_Paulo\n`;

const UY = {
  schema:"mv-city-catalog-v1", countryCode:"UY", country:"Uruguai",
  places:[[3441575,"Montevidéu",-34.90328,-56.18816,"Montevideo",1305000,"PPLC"]]
};
const AR = {
  schema:"mv-city-catalog-v1", countryCode:"AR", country:"Argentina",
  places:[[3435910,"Buenos Aires",-34.61315,-58.37723,"Buenos Aires F.D.",2891082,"PPLC"]]
};

function loadModule({overpassElements=[]}={}) {
  const calls = {br:0,uy:0,ar:0,overpass:0};
  const context = {
    window:null, globalThis:null, console, AbortController, URL,
    state:{trips:[],activeTripDetailId:null},
    tripLatLngs:trip=>trip.line || [],
    cityConquestsForTrip:()=>[], saveTrips:()=>true,
    renderAchievements:()=>{}, renderTripDetail:()=>{},
    setTimeout:()=>1, clearTimeout:()=>{},
    fetch:async url=>{
      const value=String(url);
      if (value.includes("municipios.csv")) { calls.br++; return {ok:true,text:async()=>BR_CSV}; }
      if (value.includes("city-catalog/v1/uy.json")) { calls.uy++; return {ok:true,json:async()=>UY}; }
      if (value.includes("city-catalog/v1/ar.json")) { calls.ar++; return {ok:true,json:async()=>AR}; }
      calls.overpass++;
      return {ok:true,json:async()=>({elements:overpassElements})};
    },
    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}},
    MinhasViagensSync:{schedule:()=>{}}
  };
  context.window=context; context.globalThis=context;
  context.MINHAS_VIAGENS_APP_VERSION="0.14.8";
  context.MinhasViagensCrossingDetection=core;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0147-crossed-cities-local.js","utf8"),context);
  return {api:context.MinhasViagensCrossedCitiesV0147,calls};
}

test("catálogos gerados são compactos e excluem localidades históricas, abandonadas e bairros", () => {
  const manifest=JSON.parse(fs.readFileSync("city-catalog/v1/manifest.json","utf8"));
  assert.ok(manifest.countries.AR.count > 10000);
  assert.ok(manifest.countries.UY.count > 500);
  assert.ok(manifest.countries.AR.bytes < 1100000);
  assert.ok(manifest.countries.UY.bytes < 100000);
  const forbidden=new Set(["PPLX","PPLH","PPLQ","PPLW","PPLCH"]);
  for (const file of ["ar.json","uy.json"]) {
    const payload=JSON.parse(fs.readFileSync(`city-catalog/v1/${file}`,"utf8"));
    assert.equal(payload.schema,"mv-city-catalog-v1");
    assert.ok(payload.places.length === payload.count);
    assert.equal(payload.places.some(row=>forbidden.has(row[6])),false);
  }
  assert.equal(JSON.parse(fs.readFileSync("city-catalog/v1/uy.json","utf8")).country,"Uruguai");
});

test("BR→UY usa catálogos locais e não consulta Overpass", async () => {
  const {api,calls}=loadModule();
  const trip={
    id:"br-uy",mode:"carro",
    startPlace:{countryCode:"BR"},endPlace:{countryCode:"UY"},
    line:[[-34.90,-56.30],[-34.90,-56.10]],
    routeGeometry:{encodedPolyline:"abc",pointCount:2}
  };
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Montevidéu" && city.countryCode==="UY"));
  assert.equal(calls.uy,1);
  assert.equal(calls.ar,0);
  assert.equal(calls.overpass,0);
});

test("viagem interna na Argentina carrega somente o catálogo argentino", async () => {
  const {api,calls}=loadModule();
  const trip={
    id:"ar",mode:"carro",
    startPlace:{countryCode:"AR"},endPlace:{countryCode:"AR"},
    line:[[-34.61,-58.48],[-34.61,-58.28]],
    routeGeometry:{encodedPolyline:"abc",pointCount:2}
  };
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Buenos Aires" && city.countryCode==="AR"));
  assert.equal(calls.ar,1);
  assert.equal(calls.uy,0);
  assert.equal(calls.overpass,0);
});

test("país ainda sem catálogo mantém fallback Overpass", async () => {
  const overpass=[{type:"node",id:10,lat:-33.45,lon:-70.66,tags:{name:"Santiago",place:"city",population:"6000000","addr:country":"CL"}}];
  const {api,calls}=loadModule({overpassElements:overpass});
  const trip={
    id:"cl",mode:"carro",
    startPlace:{countryCode:"CL"},endPlace:{countryCode:"CL"},
    line:[[-33.45,-70.76],[-33.45,-70.56]],
    routeGeometry:{encodedPolyline:"abc",pointCount:2}
  };
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Santiago"));
  assert.ok(calls.overpass > 0);
  assert.equal(calls.ar,0);
  assert.equal(calls.uy,0);
});
