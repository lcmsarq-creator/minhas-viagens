#!/usr/bin/env python3
from pathlib import Path

p=Path('v0147-crossed-cities-local.js')
text=p.read_text(encoding='utf-8')

marker='''  function explicitCountryCodes(trip) {\n    return [...new Set([trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace]\n      .filter(Boolean)\n      .map(place => String(place.countryCode || "").toUpperCase())\n      .filter(Boolean))];\n  }\n\n'''
insert=marker+'''  function localCountryCodesAlongLine(line) {\n    const api = window.MinhasViagensRoadCountry;\n    if (!api?.countryHintFromPoint || !Array.isArray(line) || !line.length) return [];\n    const found = new Set();\n    const step = Math.max(1, Math.floor(line.length / 200));\n    for (let i = 0; i < line.length; i += step) {\n      const point = line[i];\n      const code = String(api.countryHintFromPoint(Number(point?.[0]), Number(point?.[1])) || "").toUpperCase();\n      if (LOCAL_CATALOGS[code]) found.add(code);\n    }\n    const last = line[line.length - 1];\n    const lastCode = String(api.countryHintFromPoint(Number(last?.[0]), Number(last?.[1])) || "").toUpperCase();\n    if (LOCAL_CATALOGS[lastCode]) found.add(lastCode);\n    return [...found];\n  }\n\n'''
if 'function localCountryCodesAlongLine' not in text:
    if marker not in text:
        raise SystemExit('explicitCountryCodes marker not found')
    text=text.replace(marker,insert,1)

old='''    const codes = explicitCountryCodes(trip);\n    const availableLocalCodes = [];'''
new='''    const explicitCodes = explicitCountryCodes(trip);\n    const inferredLocalCodes = localCountryCodesAlongLine(line);\n    const codes = [...new Set([...explicitCodes, ...inferredLocalCodes])];\n    const availableLocalCodes = [];'''
if old not in text:
    raise SystemExit('scan codes marker not found')
text=text.replace(old,new,1)

old='''    explicitCountryCodes,\n    needsInternationalScan,'''
new='''    explicitCountryCodes,\n    localCountryCodesAlongLine,\n    needsInternationalScan,'''
if old not in text:
    raise SystemExit('export marker not found')
text=text.replace(old,new,1)
p.write_text(text,encoding='utf-8')

p=Path('tests/v0148-local-cities-ar-uy.test.js')
t=p.read_text(encoding='utf-8')
old='''    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}},\n    MinhasViagensSync:{schedule:()=>{}}\n  };'''
new='''    MinhasViagensApp:{replaceTrips:trips=>{context.state.trips=trips;}},\n    MinhasViagensSync:{schedule:()=>{}},\n    MinhasViagensRoadCountry:{\n      countryHintFromPoint:(lat,lng)=>{\n        if (lat < -34.0 && lng < -57.0) return "AR";\n        if (lat < -30.0 && lng >= -57.0) return "UY";\n        return "BR";\n      }\n    }\n  };'''
if old not in t:
    raise SystemExit('test context marker not found')
t=t.replace(old,new,1)
append='''\n\ntest("Argentina é carregada quando aparece apenas como país de trânsito no traçado", async () => {\n  const {api,calls}=loadModule();\n  const trip={\n    id:"br-ar-uy",mode:"carro",\n    startPlace:{countryCode:"BR"},endPlace:{countryCode:"UY"},\n    line:[[-34.61,-58.48],[-34.61,-58.28]],\n    routeGeometry:{encodedPolyline:"abc",pointCount:2}\n  };\n  assert.deepEqual(Array.from(api.localCountryCodesAlongLine(trip.line)),["AR"]);\n  const result=await api.scanTripCities(trip);\n  assert.equal(result.complete,true);\n  assert.ok(result.cities.some(city=>city.city==="Buenos Aires" && city.countryCode==="AR"));\n  assert.equal(calls.ar,1);\n  assert.equal(calls.uy,1);\n  assert.equal(calls.overpass,0);\n});\n'''
if 'Argentina é carregada quando aparece apenas como país de trânsito' not in t:
    t += append
p.write_text(t,encoding='utf-8')
