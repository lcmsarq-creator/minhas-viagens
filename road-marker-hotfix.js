(() => {
  "use strict";

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.4";
  const BADGE_LAYOUT_SCHEMA = "road-badges-v6-north-america-country-context";
  const TRANSIT_COUNTRIES = Object.freeze(["BR","UY","AR","PY","CL","BO","PE","EC","CO","VE","GY","SR","GF","PA","CR","NI","HN","SV","GT","BZ","MX","US","CA"]);
  const BRAZIL_FEDERAL_REF = /^BR-\d{1,4}[A-Z]?$/i;
  const BRAZIL_STATE_REF = /^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)-\d{1,4}[A-Z]?$/i;
  const layout = window.MinhasViagensRoadMarkerLayout;
  const baseTripRoadCountryContext = typeof tripRoadCountryContext === "function" ? tripRoadCountryContext : null;

  function placeCountryCodes(trip) {
    const places=[trip?.startPlace,...(trip?.stopPlaces||[]),trip?.endPlace].filter(Boolean);
    return [...new Set(places.map(p=>String(p?.countryCode||"").toUpperCase()).filter(c=>/^[A-Z]{2}$/.test(c)))];
  }
  if (baseTripRoadCountryContext) {
    tripRoadCountryContext = function tripRoadCountryContextAllAmericas(trip) {
      const base=baseTripRoadCountryContext(trip), direct=placeCountryCodes(trip);
      if (typeof base === "string" && base && direct.length <= 1) return base;
      const current=base&&typeof base==="object"&&Array.isArray(base.countries)?base.countries.map(c=>String(c||"").toUpperCase()).filter(Boolean):direct;
      const countries=[...new Set([...current,...direct,...TRANSIT_COUNTRIES])];
      if(!countries.length) return base||"";
      return {mode:"AUTO",countries,hint:base&&typeof base==="object"?String(base.hint||"").toUpperCase():""};
    };
  }
  function contextCountries(context){return !context||typeof context!=="object"||context.mode!=="AUTO"?[]:(Array.isArray(context.countries)?context.countries.map(c=>String(c||"").toUpperCase()).filter(Boolean):[]);}
  function pointInPolygon(lat,lng,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[yi,xi]=polygon[i],[yj,xj]=polygon[j];const intersects=((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);if(intersects)inside=!inside;}return inside;}
  const URUGUAY=Object.freeze([[-34.98,-56.16],[-34.86,-57.97],[-33.25,-58.42],[-30.11,-57.63],[-30.08,-56.00],[-30.36,-53.18],[-32.65,-53.10],[-33.75,-53.35],[-34.30,-53.40],[-34.85,-53.80],[-35.00,-54.95]]);
  const COLOMBIA=Object.freeze([[12.6,-71.7],[11.4,-74.4],[8.5,-77.5],[1.4,-79.1],[-4.3,-69.9],[-1.5,-67.0],[4.0,-67.5],[7.0,-72.0],[10.8,-72.8]]);
  const VENEZUELA=Object.freeze([[12.3,-71.7],[11.4,-66.0],[10.6,-61.7],[8.4,-60.5],[5.5,-61.0],[1.0,-66.8],[4.0,-67.5],[7.0,-72.0],[9.0,-73.3]]);
  const MEXICO=Object.freeze([[32.72,-117.13],[32.55,-114.72],[31.33,-111.07],[31.78,-108.20],[31.33,-106.50],[31.76,-104.50],[29.78,-102.30],[28.96,-100.30],[26.00,-99.00],[25.84,-97.15],[22.00,-97.80],[18.00,-94.00],[18.20,-90.70],[21.50,-86.70],[18.20,-87.80],[14.50,-92.20],[16.00,-98.00],[17.50,-101.50],[20.00,-105.70],[23.00,-106.60],[23.00,-110.00],[28.00,-114.00],[32.00,-117.00]]);
  const USA_LOWER48=Object.freeze([[49.00,-124.80],[49.00,-95.00],[48.00,-89.50],[46.50,-84.50],[45.00,-82.50],[42.00,-83.20],[41.70,-82.70],[42.00,-79.80],[43.60,-76.80],[44.80,-74.70],[47.50,-69.20],[45.00,-66.90],[40.00,-73.70],[35.00,-75.50],[30.00,-80.00],[25.00,-80.50],[24.40,-82.00],[29.00,-97.50],[25.80,-97.20],[29.80,-101.00],[31.80,-106.50],[32.50,-117.20],[42.00,-124.80]]);
  function chileEastLimit(lat){if(lat>-23)return-68.4;if(lat>-30)return-69.0;if(lat>-35)return-70.0;if(lat>-45)return-71.0;return-72.0;}
  function countryHintFromPoint(lat,lng){
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return"";
    if(pointInPolygon(lat,lng,MEXICO))return"MX";
    if(pointInPolygon(lat,lng,USA_LOWER48))return"US";
    if(lat>=54.5&&lat<=71.6&&lng>=-170.0&&lng<=-141.0)return"US";
    if(lat>=18.8&&lat<=22.4&&lng>=-160.6&&lng<=-154.5)return"US";
    if(lat>=41.6&&lat<=83.2&&lng>=-141.1&&lng<=-52.6)return"CA";
    if(lat>=15.7&&lat<=18.6&&lng>=-89.3&&lng<=-87.4)return"BZ";
    if(lat>=13.0&&lat<=14.6&&lng>=-90.2&&lng<=-87.6)return"SV";
    if(lat>=13.7&&lat<=17.9&&lng>=-92.3&&lng<=-88.0)return"GT";
    if(lat>=12.8&&lat<=16.5&&lng>=-89.4&&lng<=-83.1)return"HN";
    if(lat>=10.7&&lat<=15.1&&lng>=-87.8&&lng<=-82.5)return"NI";
    if(lat>=8.0&&lat<=11.3&&lng>=-86.2&&lng<=-82.3)return"CR";
    if(lat>=7.0&&lat<=9.8&&lng>=-83.1&&lng<=-77.0)return"PA";
    if(lat>=1.0&&lat<=8.7&&lng>=-61.6&&lng<=-56.3)return"GY";
    if(lat>=1.7&&lat<=6.3&&lng>=-58.2&&lng<=-53.7)return"SR";
    if(lat>=2.0&&lat<=5.9&&lng>=-54.7&&lng<=-51.5)return"GF";
    if(pointInPolygon(lat,lng,COLOMBIA))return"CO";
    if(pointInPolygon(lat,lng,VENEZUELA))return"VE";
    if(pointInPolygon(lat,lng,URUGUAY))return"UY";
    if(lat>=-27.8&&lat<=-19.0&&lng>=-62.8&&lng<=-54.0)return"PY";
    if(lat>=-23.3&&lat<=-9.3&&lng>=-69.9&&lng<=-57.3)return"BO";
    if(lat>=-18.6&&lat<=-0.1&&lng>=-81.6&&lng<=-68.4)return"PE";
    if(lat>=-5.2&&lat<=1.7&&lng>=-81.3&&lng<=-75.0)return"EC";
    if(lat>=-56.2&&lat<=-17.0&&lng>=-76.0&&lng<=chileEastLimit(lat))return"CL";
    if(lat>=-55.5&&lat<=-21.0&&lng>=-73.8&&lng<=-53.4)return"AR";
    if(lat>=-34.0&&lat<=5.4&&lng>=-74.1&&lng<=-34.0)return"BR";
    return"";
  }
  function countryHintFromCoordinates(coordinates){if(!Array.isArray(coordinates)||!coordinates.length)return"";const indexes=[Math.floor(coordinates.length/2),0,coordinates.length-1],votes=new Map();for(const index of indexes){const p=coordinates[index];if(!Array.isArray(p))continue;const h=countryHintFromPoint(Number(p[0]),Number(p[1]));if(h)votes.set(h,(votes.get(h)||0)+1);}return[...votes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";}
  function stepContext(baseContext,coordinates){const hint=countryHintFromCoordinates(coordinates)||(baseContext&&typeof baseContext==="object"?String(baseContext.hint||"").toUpperCase():String(baseContext||"").toUpperCase());const countries=baseContext&&typeof baseContext==="object"?contextCountries(baseContext):[...new Set([String(baseContext||"").toUpperCase(),...TRANSIT_COUNTRIES].filter(Boolean))];return{mode:"AUTO",countries,hint};}
  function sanitizeRefs(refs,context){const hint=context&&typeof context==="object"?String(context.hint||"").toUpperCase():"";return(refs||[]).filter(label=>{const value=String(label||"").toUpperCase().trim();if(!value)return false;if(value.startsWith("INT:"))return true;if(BRAZIL_FEDERAL_REF.test(value))return true;if(BRAZIL_STATE_REF.test(value))return hint==="BR";if(hint&&hint!=="BR")return false;return true;});}

  const status=window.MinhasViagensRoadMarkers={version:APP_VERSION,schema:BADGE_LAYOUT_SCHEMA,minRoadKm:layout?.MIN_BADGE_ROAD_KM??20,maxMinorInterruptionKm:layout?.MAX_MINOR_INTERRUPTION_KM??20,rebuilding:false,rebuiltTrips:0,refreshedTrips:0,missingSegmentCaches:0};
  if(!layout){console.warn("Marcadores de rodovia: núcleo de layout indisponível.");return;}
  function routeTimeline(route,trip){const baseContext=typeof tripRoadCountryContext==="function"?tripRoadCountryContext(trip):tripRoadCountry(trip),chunks=[];for(const leg of route?.legs||[]){for(const step of leg.steps||[]){const coordinates=(step?.geometry?.coordinates||[]).filter(p=>Array.isArray(p)&&p.length>=2).map(([lng,lat])=>[Number(lat),Number(lng)]).filter(([lat,lng])=>Number.isFinite(lat)&&Number.isFinite(lng));if(coordinates.length<2)continue;const context=stepContext(baseContext,coordinates),refs=sanitizeRefs(roadRefsFromStep(step,context),context);chunks.push({label:refs[0]||"",line:coordinates,countryCode:context.hint||""});}}return chunks;}
  function lineKm(line){if(typeof layout?.lineLengthKm==="function")return layout.lineLengthKm(line);let meters=0;if(typeof map==="undefined"||typeof L==="undefined"||typeof map.distance!=="function"||typeof L.latLng!=="function")return 0;for(let i=1;i<(line||[]).length;i+=1){const a=line[i-1],b=line[i];if(!Array.isArray(a)||!Array.isArray(b))continue;meters+=map.distance(L.latLng(a[0],a[1]),L.latLng(b[0],b[1]));}return meters/1000;}
  extractRoadLabelsFromRoute=function extractRoadLabelsFromRouteAmericas(route,trip=null){const markers=layout.markersFromTimeline(routeTimeline(route,trip),{normalizeLabel:normalizeKey});if(trip)trip.roadBadgeLayoutVersion=BADGE_LAYOUT_SCHEMA;return markers;};
  extractHighwaysFromRoute=function extractHighwaysFromRouteAmericas(route,trip=null){const totals=new Map(),labels=new Map();for(const chunk of routeTimeline(route,trip)){const label=String(chunk.label||"").trim();if(!label||!isHighwayRef(label))continue;const key=normalizeKey(label);totals.set(key,(totals.get(key)||0)+lineKm(chunk.line));if(!labels.has(key))labels.set(key,label);}return[...labels.entries()].filter(([key])=>(totals.get(key)||0)>=2).map(([,label])=>label).sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));};
  extractRoadSegmentsFromRoute=function extractRoadSegmentsFromRouteAmericas(route,trip=null){const result={};for(const chunk of routeTimeline(route,trip)){const label=String(chunk.label||"").trim();if(!label||!Array.isArray(chunk.line)||chunk.line.length<2)continue;if(!result[label])result[label]=[];result[label].push(chunk.line);}return result;};
  function reclassifyStoredLabel(raw,badge){const label=String(raw||"").trim(),hint=countryHintFromPoint(Number(badge?.lat),Number(badge?.lng)),match=label.toUpperCase().match(/^INT:(AR|UY):(RN|RU):([0-9A-Z]+)$/);if(match&&hint==="UY")return`INT:UY:RU:${match[3]}`;if(match&&hint==="AR")return`INT:AR:RN:${match[3]}`;return label;}
  function normalizeStoredRoadData(trip){const baseContext=typeof tripRoadCountryContext==="function"?tripRoadCountryContext(trip):"";let changed=false;const nextBadges=[];for(const badge of(trip?.roadLabels||[])){const raw=typeof badge==="string"?badge:badge?.label;let label=reclassifyStoredLabel(raw,badge);const hint=badge&&typeof badge==="object"?countryHintFromPoint(Number(badge.lat),Number(badge.lng)):"",context={mode:"AUTO",countries:contextCountries(baseContext),hint};label=internationalRoadRef(label,context)||cleanRoadRef(label);if(!label){changed=true;continue;}if(typeof badge==="string")nextBadges.push(label);else nextBadges.push({...badge,label});if(label!==raw)changed=true;}trip.roadLabels=nextBadges;return changed;}
  async function refreshTripRoadDataFromRoute(trip){if(!["carro","moto"].includes(trip?.mode))return false;if(typeof tripRoutingPoints!=="function"||typeof fetchOsrmRoute!=="function")return false;const points=tripRoutingPoints(trip);if(!Array.isArray(points)||points.length<2)return false;try{const routes=await fetchOsrmRoute(points,false),preferredIndex=Number.isInteger(Number(trip.routeAlternativeIndex))?Number(trip.routeAlternativeIndex):0,route=routes?.[preferredIndex]||routes?.[0];if(!route)return false;trip.roadLabels=extractRoadLabelsFromRoute(route,trip);trip.conquests||={};trip.conquests.roads=extractHighwaysFromRoute(route,trip);trip.roadSegments=extractRoadSegmentsFromRoute(route,trip);trip.roadBadgeLayoutVersion=BADGE_LAYOUT_SCHEMA;status.refreshedTrips+=1;return true;}catch(error){console.warn("Não foi possível reconsultar a rota para corrigir as placas",trip?.id,error);return false;}}
  async function rebuildTripBadges(trip){if(await refreshTripRoadDataFromRoute(trip))return true;const changed=normalizeStoredRoadData(trip),segmentMap={};for(const[label,lines]of Object.entries(trip?.roadSegments||{})){if(label&&Array.isArray(lines)&&lines.length)segmentMap[label]=lines;}const markers=layout.markersFromSegmentMap(segmentMap,{normalizeLabel:normalizeKey});if(markers.length)trip.roadLabels=markers;trip.roadBadgeLayoutVersion=BADGE_LAYOUT_SCHEMA;return changed||Boolean(markers.length);}
  let rebuildTimer=null,rerunRequested=false;
  async function rebuildStoredBadges(){if(status.rebuilding){rerunRequested=true;return;}status.rebuilding=true;status.rebuiltTrips=0;status.refreshedTrips=0;status.missingSegmentCaches=0;let changed=false;try{const snapshot=[...(state.trips||[])];for(const trip of snapshot){if(trip?.roadBadgeLayoutVersion===BADGE_LAYOUT_SCHEMA)continue;if(!state.trips.includes(trip)){rerunRequested=true;break;}changed=await rebuildTripBadges(trip)||changed;status.rebuiltTrips+=1;await new Promise(resolve=>setTimeout(resolve,0));}if(changed){saveTrips();renderTrips();}}catch(error){console.warn("Não foi possível reconstruir todos os marcadores de rodovia",error);}finally{status.rebuilding=false;if(rerunRequested){rerunRequested=false;scheduleRebuild(50);}}}
  function scheduleRebuild(delay=100){clearTimeout(rebuildTimer);rebuildTimer=setTimeout(rebuildStoredBadges,delay);}
  const app=window.MinhasViagensApp;if(app?.replaceTrips){const baseReplaceTrips=app.replaceTrips.bind(app);app.replaceTrips=trips=>{const result=baseReplaceTrips(trips);scheduleRebuild(50);return result;};}
  window.MinhasViagensRoadCountry=Object.freeze({version:APP_VERSION,schema:BADGE_LAYOUT_SCHEMA,countryHintFromPoint,countryHintFromCoordinates,stepContext,sanitizeRefs});
  scheduleRebuild(100);
  const brandCopy=document.querySelector(".brand p");if(brandCopy)brandCopy.textContent=brandCopy.textContent.replace(/v\d+\.\d+\.\d+/,`v${APP_VERSION}`);
  console.info(`Minhas Viagens ${APP_VERSION}: rodovias reconstruídas por país do próprio trecho nas Américas.`);
})();