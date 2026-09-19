const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

const CODES = ["AR","UY","PY","PE","BO","CL","CO","VE","EC","GY","SR","GF","PA","CR","HN","SV","GT","BZ","MX","US","CA"];
const BR_CSV = `codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario\n4300001,Cidade BR,-31.0000,-54.0000,0,43,1,55,America/Sao_Paulo\n`;
const PAYLOADS = Object.fromEntries(CODES.map(code => {
  const payload = JSON.parse(fs.readFileSync(`city-catalog/v1/${code.toLowerCase()}.json`, "utf8"));
  return [code, payload];
}));

function firstPlace(code) {
  const row = PAYLOADS[code].places[0];
  assert.ok(row, `${code} precisa ter ao menos uma localidade`);
  return row;
}

function loadModule({overpassElements=[]}={}) {
  const calls = {br:0, overpass:0, local:{}};
  const context = {
    window:null, globalThis:null, console, AbortController, URL, queueMicrotask,
    state:{trips:[],activeTripDetailId:null},
    tripLatLngs:trip=>trip.line || [],
    cityConquestsForTrip:()=>[], saveTrips:()=>true,
    renderAchievements:()=>{}, renderTripDetail:()=>{},
    setTimeout:(fn,ms)=>{ if (ms <= 150) queueMicrotask(fn); return 1; }, clearTimeout:()=>{},
    fetch:async url=>{
      const value=String(url);
      if (value.includes("municipios.csv")) { calls.br++; return {ok:true,text:async()=>BR_CSV}; }
      const match=value.match(/city-catalog\/v1\/([a-z]{2})\.json/i);
      if (match) {
        const code=match[1].toUpperCase();
        calls.local[code]=(calls.local[code]||0)+1;
        const payload=PAYLOADS[code];
        return payload ? {ok:true,json:async()=>payload} : {ok:false,status:404,json:async()=>({})};
      }
      calls.overpass++;
      return {ok:true,json:async()=>({elements:overpassElements})};
    },
    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}},
    MinhasViagensSync:{schedule:()=>{}},
    MinhasViagensRoadCountry:{
      countryHintFromPoint:(lat,lng)=>{
        let best="", bestDistance=Infinity;
        for (const code of CODES) {
          const row=firstPlace(code), d=Math.hypot(Number(row[2])-lat, Number(row[3])-lng);
          if (d < bestDistance) { bestDistance=d; best=code; }
        }
        return bestDistance < 0.75 ? best : "BR";
      }
    }
  };
  context.window=context; context.globalThis=context;
  context.MINHAS_VIAGENS_APP_VERSION="0.14.8";
  context.MinhasViagensCrossingDetection=core;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("v0147-crossed-cities-local.js","utf8"),context);
  return {api:context.MinhasViagensCrossedCitiesV0147,calls};
}

test("catálogos guardam apenas cidades/localidades relevantes", () => {
  const manifest=JSON.parse(fs.readFileSync("city-catalog/v1/manifest.json","utf8"));
  assert.equal(manifest.schema,"mv-city-catalog-manifest-v2");
  assert.deepEqual(Object.keys(manifest.countries),CODES);
  const allowedAlways=new Set(["PPLC","PPLG","PPLA","PPLA2","PPLA3"]);
  const allowedPopulation=new Set(["PPL","PPLS"]);
  let totalBytes=0;
  for (const code of CODES) {
    const payload=PAYLOADS[code];
    assert.equal(payload.schema,"mv-city-catalog-v2");
    assert.equal(payload.countryCode,code);
    assert.equal(payload.places.length,payload.count);
    assert.ok(payload.count>0, `${code} vazio`);
    totalBytes += manifest.countries[code].bytes;
    for (const row of payload.places) {
      const pop=Number(row[5])||0, feature=String(row[6]||"");
      assert.ok(allowedAlways.has(feature) || (allowedPopulation.has(feature) && pop>1000), `${code} contém ${feature}/${pop}`);
    }
  }
  assert.ok(totalBytes < 5000000, `catálogos grandes demais: ${totalBytes}`);
});

test("cada país coberto usa seu catálogo local sem consultar Overpass", async () => {
  for (const code of CODES) {
    const {api,calls}=loadModule();
    const row=firstPlace(code), lat=Number(row[2]), lng=Number(row[3]);
    const trip={id:`trip-${code}`,mode:"carro",startPlace:{countryCode:code},endPlace:{countryCode:code},line:[[lat,lng-.01],[lat,lng+.01]],routeGeometry:{encodedPolyline:`${code}abc`,pointCount:2}};
    const result=await api.scanTripCities(trip);
    assert.equal(result.complete,true, `${code} incompleto`);
    assert.ok(result.cities.some(city=>city.countryCode===code), `${code} não detectou cidade local`);
    assert.equal(calls.local[code],1, `${code} não carregou exatamente uma vez`);
    assert.equal(calls.overpass,0, `${code} chamou Overpass`);
  }
});

test("BR→UY usa catálogo local e não consulta Overpass", async () => {
  const {api,calls}=loadModule();
  const row=firstPlace("UY"), lat=Number(row[2]), lng=Number(row[3]);
  const trip={id:"br-uy",mode:"carro",startPlace:{countryCode:"BR"},endPlace:{countryCode:"UY"},line:[[lat,lng-.01],[lat,lng+.01]],routeGeometry:{encodedPolyline:"abc",pointCount:2}};
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.countryCode==="UY"));
  assert.equal(calls.local.UY,1);
  assert.equal(calls.overpass,0);
});

test("país ainda sem catálogo mantém fallback Overpass", async () => {
  const overpass=[{type:"node",id:10,lat:12.14,lon:-86.25,tags:{name:"Managua",place:"city",population:"1000000","addr:country":"NI"}}];
  const {api,calls}=loadModule({overpassElements:overpass});
  const trip={id:"ni",mode:"carro",startPlace:{countryCode:"NI"},endPlace:{countryCode:"NI"},line:[[12.14,-86.35],[12.14,-86.15]],routeGeometry:{encodedPolyline:"niabc",pointCount:2}};
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Managua"));
  assert.ok(calls.overpass>0);
});

test("México é carregado quando aparece apenas como país de trânsito no traçado", async () => {
  const {api,calls}=loadModule();
  const row=firstPlace("MX"), lat=Number(row[2]), lng=Number(row[3]);
  const line=[[lat,lng-.01],[lat,lng+.01]];
  assert.deepEqual(Array.from(api.localCountryCodesAlongLine(line)),["MX"]);
  const trip={id:"transit-mx",mode:"carro",startPlace:{countryCode:"US"},endPlace:{countryCode:"GT"},line,routeGeometry:{encodedPolyline:"mxtransit",pointCount:2}};
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.countryCode==="MX"));
  assert.equal(calls.local.MX,1);
  assert.equal(calls.overpass,0);
});

test("módulo de país das rodovias contém todos os catálogos locais", () => {
  const source=fs.readFileSync("road-marker-hotfix.js","utf8");
  for (const code of CODES) {
    assert.match(source,new RegExp(`(?:TRANSIT_COUNTRIES[^;]*|return\\\"${code}\\\")`,"s"), `${code} ausente da inferência rodoviária`);
  }
});
