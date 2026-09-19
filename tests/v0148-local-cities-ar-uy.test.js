const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../crossing-detection-core.js");

const BR_CSV = `codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario\n4300001,Cidade BR,-31.0000,-54.0000,0,43,1,55,America/Sao_Paulo\n`;

const SAMPLE = {
  AR:[3435910,"Buenos Aires",-34.61315,-58.37723,"Buenos Aires F.D.",2891082,"PPLC","Argentina"],
  UY:[3441575,"Montevidéu",-34.90328,-56.18816,"Montevideo",1305000,"PPLC","Uruguai"],
  PY:[3439389,"Assunção",-25.28646,-57.647,"Asunción",1482200,"PPLC","Paraguai"],
  PE:[3936456,"Lima",-12.04318,-77.02824,"Lima",7737002,"PPLC","Peru"],
  BO:[3911925,"La Paz",-16.5,-68.15,"La Paz",812799,"PPLC","Bolívia"],
  CL:[3871336,"Santiago",-33.45694,-70.64827,"Santiago Metropolitan",4837295,"PPLC","Chile"],
  CO:[3688689,"Bogotá",4.60971,-74.08175,"Bogota D.C.",7674366,"PPLC","Colômbia"],
  VE:[3646738,"Caracas",10.48801,-66.87919,"Distrito Federal",3000000,"PPLC","Venezuela"],
  EC:[3652462,"Quito",-0.22985,-78.52495,"Pichincha",1399814,"PPLC","Equador"]
};

function payload(code) {
  const [id,name,lat,lng,region,population,featureCode,country] = SAMPLE[code];
  return {schema:"mv-city-catalog-v2",countryCode:code,country,places:[[id,name,lat,lng,region,population,featureCode]]};
}

function loadModule({overpassElements=[]}={}) {
  const calls = {br:0,overpass:0};
  for (const code of Object.keys(SAMPLE)) calls[code.toLowerCase()] = 0;
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
      for (const code of Object.keys(SAMPLE)) {
        if (value.includes(`city-catalog/v1/${code.toLowerCase()}.json`)) {
          calls[code.toLowerCase()]++;
          return {ok:true,json:async()=>payload(code)};
        }
      }
      calls.overpass++;
      return {ok:true,json:async()=>({elements:overpassElements})};
    },
    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}},
    MinhasViagensSync:{schedule:()=>{}},
    MinhasViagensRoadCountry:{
      countryHintFromPoint:(lat,lng)=>{
        for (const [code,row] of Object.entries(SAMPLE)) {
          if (Math.abs(lat-row[2]) < 1 && Math.abs(lng-row[3]) < 1) return code;
        }
        return "BR";
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
  const expected=["AR","UY","PY","PE","BO","CL","CO","VE","EC"];
  assert.equal(manifest.schema,"mv-city-catalog-manifest-v2");
  assert.deepEqual(Object.keys(manifest.countries).sort(),expected.slice().sort());
  const admin=new Set(["PPLC","PPLG","PPLA","PPLA2","PPLA3"]);
  let totalBytes=0;
  for (const code of expected) {
    const item=manifest.countries[code];
    assert.ok(item.count > 0, `${code} sem cidades`);
    assert.ok(item.bytes < 1000000, `${code} pesado demais`);
    totalBytes += item.bytes;
    const payload=JSON.parse(fs.readFileSync(`city-catalog/v1/${code.toLowerCase()}.json`,"utf8"));
    assert.equal(payload.schema,"mv-city-catalog-v2");
    assert.equal(payload.countryCode,code);
    assert.equal(payload.places.length,payload.count);
    for (const row of payload.places) {
      const population=Number(row[5])||0, featureCode=String(row[6]||"");
      assert.ok(admin.has(featureCode) || (["PPL","PPLS"].includes(featureCode) && population > 1000), `${code}: entrada ampla demais ${featureCode}/${population}`);
    }
  }
  assert.ok(totalBytes < 3000000, `catálogos somados pesam ${totalBytes} bytes`);
  assert.ok(manifest.countries.AR.count < 5000, "Argentina ainda contém topônimos demais para o conceito de cidade");
});

test("BR→UY usa catálogo local e não consulta Overpass", async () => {
  const {api,calls}=loadModule();
  const row=SAMPLE.UY;
  const trip={id:"br-uy",mode:"carro",startPlace:{countryCode:"BR"},endPlace:{countryCode:"UY"},line:[[row[2],row[3]-.1],[row[2],row[3]+.1]],routeGeometry:{encodedPolyline:"abc",pointCount:2}};
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Montevidéu" && city.countryCode==="UY"));
  assert.equal(calls.uy,1);
  assert.equal(calls.overpass,0);
});

for (const code of Object.keys(SAMPLE)) {
  test(`viagem interna em ${code} usa somente o catálogo local`, async () => {
    const {api,calls}=loadModule();
    const row=SAMPLE[code];
    const trip={id:`trip-${code}`,mode:"carro",startPlace:{countryCode:code},endPlace:{countryCode:code},line:[[row[2],row[3]-.08],[row[2],row[3]+.08]],routeGeometry:{encodedPolyline:`${code}-abc`,pointCount:2}};
    const result=await api.scanTripCities(trip);
    assert.equal(result.complete,true);
    assert.ok(result.cities.some(city=>city.countryCode===code && city.city===row[1]));
    assert.equal(calls[code.toLowerCase()],1);
    assert.equal(calls.overpass,0);
  });
}

test("país ainda sem catálogo mantém fallback Overpass", async () => {
  const overpass=[{type:"node",id:10,lat:19.4326,lon:-99.1332,tags:{name:"Ciudad de México",place:"city",population:"9209944","addr:country":"MX"}}];
  const {api,calls}=loadModule({overpassElements:overpass});
  const trip={id:"mx",mode:"carro",startPlace:{countryCode:"MX"},endPlace:{countryCode:"MX"},line:[[19.4326,-99.2],[19.4326,-99.05]],routeGeometry:{encodedPolyline:"mx",pointCount:2}};
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Ciudad de México"));
  assert.ok(calls.overpass > 0);
});

test("Argentina é carregada quando aparece apenas como país de trânsito no traçado", async () => {
  const {api,calls}=loadModule();
  const row=SAMPLE.AR;
  const trip={id:"br-ar-uy",mode:"carro",startPlace:{countryCode:"BR"},endPlace:{countryCode:"UY"},line:[[row[2],row[3]-.1],[row[2],row[3]+.1]],routeGeometry:{encodedPolyline:"abc",pointCount:2}};
  assert.deepEqual(Array.from(api.localCountryCodesAlongLine(trip.line)),["AR"]);
  const result=await api.scanTripCities(trip);
  assert.equal(result.complete,true);
  assert.ok(result.cities.some(city=>city.city==="Buenos Aires" && city.countryCode==="AR"));
  assert.equal(calls.ar,1);
  assert.equal(calls.uy,1);
  assert.equal(calls.overpass,0);
});
