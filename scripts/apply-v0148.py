#!/usr/bin/env python3
from pathlib import Path
import re

p = Path("v0147-crossed-cities-local.js")
text = p.read_text(encoding="utf-8")

text = text.replace('const SCHEMA = "route-city-crossings-v6-local-catalog";', 'const SCHEMA = "route-city-crossings-v7-local-ar-uy";')

marker = '  const BRAZIL_CSV = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";\n'
insert = marker + '''  const LOCAL_CATALOGS = Object.freeze({\n    AR: { path:"city-catalog/v1/ar.json", country:"Argentina" },\n    UY: { path:"city-catalog/v1/uy.json", country:"Uruguai" }\n  });\n'''
if 'const LOCAL_CATALOGS' not in text:
    if marker not in text:
        raise SystemExit("BRAZIL_CSV marker not found")
    text = text.replace(marker, insert, 1)

marker = '  const tileCache = new Map();\n'
if 'const localCatalogCache' not in text:
    text = text.replace(marker, marker + '  const localCatalogCache = new Map();\n', 1)

helpers = r'''
  function localCatalogRadiusKm(place = {}) {
    const population = Number(place.population) || 0;
    const featureCode = String(place.featureCode || "");
    if (population >= 5000000) return 12;
    if (population >= 1000000) return 8;
    if (population >= 500000) return 6;
    if (population >= 200000) return 5;
    if (population >= 100000) return 4.5;
    if (population >= 50000) return 3.8;
    if (population >= 10000) return 2.8;
    if (population >= 2000) return 2;
    if (population > 0) return 1.2;
    if (featureCode === "PPLC") return 8;
    if (/^PPLA/.test(featureCode) || featureCode === "PPLG") return 3;
    if (featureCode === "PPLL" || featureCode === "PPLF" || featureCode === "PPLR") return 1;
    return 1.5;
  }

  async function loadLocalCountryCatalog(code) {
    code = String(code || "").toUpperCase();
    const meta = LOCAL_CATALOGS[code];
    if (!meta) return { code, country:"", places:[], available:false };
    if (localCatalogCache.has(code)) return localCatalogCache.get(code);
    const promise = (async () => {
      const response = await fetch(`${meta.path}?v=${VERSION}`, { cache:"force-cache" });
      if (!response.ok) throw new Error(`Catálogo ${code} ${response.status}`);
      const payload = await response.json();
      if (payload?.schema !== "mv-city-catalog-v1" || payload?.countryCode !== code || !Array.isArray(payload?.places)) {
        throw new Error(`Catálogo ${code} inválido`);
      }
      return { code, country:meta.country, places:payload.places, available:true };
    })();
    localCatalogCache.set(code, promise);
    try { return await promise; }
    catch (error) {
      localCatalogCache.delete(code);
      console.warn(`Cidades cruzadas: catálogo local ${code} indisponível`, error);
      return { code, country:meta.country, places:[], available:false, error };
    }
  }

  function localCatalogRecord(row, code, country) {
    const [id,name,lat,lng,region,population,featureCode] = row || [];
    return {
      label:[name,region,country].filter(Boolean).join(", "),
      city:name || "",
      region:region || "",
      country:country || "",
      countryCode:code,
      lat:Number(lat),
      lng:Number(lng),
      geonameId:id,
      population:Number(population) || 0,
      featureCode:featureCode || "",
      source:`route-${String(code).toLowerCase()}-local-catalog`
    };
  }

  async function scanLocalCountryCatalog(line, code) {
    const catalog = await loadLocalCountryCatalog(code);
    if (!catalog.available || !Array.isArray(line) || line.length < 2) return { cities:[], available:false, code };
    const box = lineBounds(line);
    if (!box) return { cities:[], available:true, code };
    const found = [];
    for (const row of catalog.places) {
      const lat = Number(row?.[2]), lng = Number(row?.[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < box.s - BRAZIL_PAD_DEG || lat > box.n + BRAZIL_PAD_DEG || lng < box.w - BRAZIL_PAD_DEG || lng > box.e + BRAZIL_PAD_DEG) continue;
      const place = { population:Number(row?.[5]) || 0, featureCode:String(row?.[6] || "") };
      if (minDistanceToLine([lat,lng], line) > localCatalogRadiusKm(place)) continue;
      const record = localCatalogRecord(row, code, catalog.country);
      if (record.city) found.push(record);
    }
    return { cities:core.uniqueCities(found), available:true, code };
  }

'''
marker = '  function explicitCountryCodes(trip) {'
if 'function localCatalogRadiusKm' not in text:
    if marker not in text:
        raise SystemExit("explicitCountryCodes marker not found")
    text = text.replace(marker, helpers + marker, 1)

text = re.sub(
    r'  function needsInternationalScan\(trip\) \{.*?\n  \}\n',
    '''  function needsInternationalScan(trip, availableLocalCodes = []) {\n    const codes = explicitCountryCodes(trip);\n    const supported = new Set(["BR", ...(availableLocalCodes || [])]);\n    return !codes.length || codes.some(code => !supported.has(code));\n  }\n''',
    text,
    count=1,
    flags=re.S,
)

new_scan = r'''  async function scanTripCities(trip) {
    if (!trip || trip.mode === "aviao") return {cities:[], complete:true, source:"flight"};
    const line = typeof tripLatLngs === "function" ? tripLatLngs(trip) : [];
    if (!Array.isArray(line) || line.length < 2) return {cities:[], complete:true, source:"no-route"};

    const codes = explicitCountryCodes(trip);
    const availableLocalCodes = [];
    const sourceParts = [];
    let cities = [];
    let localFailure = false;

    if (!codes.length || codes.includes("BR")) {
      const brazil = await scanBrazilCatalog(line);
      cities = core.uniqueCities([...cities, ...brazil.cities]);
      if (brazil.available) {
        availableLocalCodes.push("BR");
        sourceParts.push("local-br");
      } else localFailure = true;
    }

    for (const code of codes.filter(code => LOCAL_CATALOGS[code])) {
      const local = await scanLocalCountryCatalog(line, code);
      cities = core.uniqueCities([...cities, ...local.cities]);
      if (local.available) {
        availableLocalCodes.push(code);
        sourceParts.push(`local-${code.toLowerCase()}`);
      } else localFailure = true;
    }

    const internationalNeeded = localFailure || needsInternationalScan(trip, availableLocalCodes);
    if (!internationalNeeded) {
      return { cities:core.uniqueCities(cities), complete:true, source:sourceParts.join("+") || "local" };
    }

    try {
      const international = await scanInternational(line);
      cities = core.uniqueCities([...cities, ...international]);
      return { cities, complete:true, source:[...sourceParts,"overpass"].join("+") || "overpass" };
    } catch (error) {
      console.warn("Cidades cruzadas: complemento internacional ficará pendente", trip?.id, error);
      return { cities:core.uniqueCities(cities), complete:false, source:[...sourceParts,"partial"].join("+") || "pending", error };
    }
  }
'''
pattern = r'  async function scanTripCities\(trip\) \{.*?\n  \}\n\n  function explicitDestinationsForTrip'
replacement = new_scan + '\n  function explicitDestinationsForTrip'
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("scanTripCities replacement failed")

export_marker = '''    scanBrazilCatalog,\n    explicitCountryCodes,\n    needsInternationalScan,'''
export_replacement = '''    scanBrazilCatalog,\n    localCatalogRadiusKm,\n    loadLocalCountryCatalog,\n    scanLocalCountryCatalog,\n    explicitCountryCodes,\n    needsInternationalScan,'''
if export_marker not in text:
    raise SystemExit("API export marker not found")
text = text.replace(export_marker, export_replacement, 1)
p.write_text(text, encoding="utf-8")

# Publica a nova versão e invalida caches sem alterar versões históricas anteriores.
paths = list(Path('.').glob('*.js')) + [Path('index.html')] + list(Path('tests').glob('*.test.js'))
for path in paths:
    if not path.exists():
        continue
    source = path.read_text(encoding='utf-8')
    source = source.replace('0.14.7','0.14.8').replace('0\\.14\\.7','0\\.14\\.8')
    path.write_text(source, encoding='utf-8')
