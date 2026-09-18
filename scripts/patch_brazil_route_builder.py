#!/usr/bin/env python3
from pathlib import Path

path = Path('scripts/build_brazil_park_pilgrimage_routes.py')
text = path.read_text(encoding='utf-8')

old = '''def geocode(query: str):
    global LAST_GEOCODE
    if query in GEOCODE_CACHE:
        return GEOCODE_CACHE[query]
    wait = 1.05 - (time.monotonic() - LAST_GEOCODE)
    if wait > 0:
        time.sleep(wait)
    params = urllib.parse.urlencode({
        "q": query,
        "format": "jsonv2",
        "limit": 1,
        "countrycodes": "br",
    })
    request = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    LAST_GEOCODE = time.monotonic()
    if not payload:
        raise RuntimeError(f"Nominatim sem resultado para: {query}")
    point = [float(payload[0]["lat"]), float(payload[0]["lon"])]
    GEOCODE_CACHE[query] = point
    print(f"geocode: {query} -> {point[0]:.5f},{point[1]:.5f}")
    return point
'''
new = '''def geocode(query: str):
    global LAST_GEOCODE
    if query in GEOCODE_CACHE:
        return GEOCODE_CACHE[query]
    parts = [part.strip() for part in query.split(",") if part.strip()]
    candidates = [query]
    # Localidades rurais nem sempre possuem objeto próprio no Nominatim. Nesse
    # caso, recuamos para o município/UF mais específico disponível. A geometria
    # continua sendo um recorte veicular e nunca inventa uma trilha pedestre.
    for index in range(1, max(1, len(parts) - 1)):
        fallback = ", ".join(parts[index:])
        if fallback and fallback not in candidates:
            candidates.append(fallback)
    for candidate in candidates:
        wait = 1.05 - (time.monotonic() - LAST_GEOCODE)
        if wait > 0:
            time.sleep(wait)
        params = urllib.parse.urlencode({
            "q": candidate,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "br",
        })
        request = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.load(response)
        finally:
            LAST_GEOCODE = time.monotonic()
        if not payload:
            continue
        point = [float(payload[0]["lat"]), float(payload[0]["lon"])]
        GEOCODE_CACHE[query] = point
        suffix = "" if candidate == query else f" (fallback: {candidate})"
        print(f"geocode: {query} -> {point[0]:.5f},{point[1]:.5f}{suffix}")
        return point
    raise RuntimeError(f"Nominatim sem resultado para: {query}")
'''
if old not in text:
    raise SystemExit('geocode block not found')
text = text.replace(old, new, 1)

old = '''def build_route(route_id, spec):
    waypoints = points(spec["waypoints"])
    road_paths = existing_road_paths(spec.get("roads", []))
    source_type = "vehicle-recut-official-checkpoints"
    lines = None
    if road_paths:
        try:
            lines = helper.route_on_road_catalog(road_paths, waypoints)
            source_type = "road-catalog"
        except Exception as error:
            print(f"warning: {route_id}: catálogo rodoviário falhou ({error}); usando OSRM")
    if lines is None:
        lines = helper.route_with_osrm(waypoints)
'''
new = '''def build_route(route_id, spec):
    road_paths = existing_road_paths(spec.get("roads", []))
    source_type = "vehicle-recut-official-checkpoints"
    lines = None
    if spec.get("wholeRoad") and road_paths:
        lines = helper.copy_whole_road(road_paths[0])
        source_type = "road-catalog"
    else:
        waypoints = points(spec["waypoints"])
        if road_paths:
            try:
                lines = helper.route_on_road_catalog(road_paths, waypoints)
                source_type = "road-catalog"
            except Exception as error:
                print(f"warning: {route_id}: catálogo rodoviário falhou ({error}); usando OSRM")
        if lines is None:
            lines = helper.route_with_osrm(waypoints)
'''
if old not in text:
    raise SystemExit('build_route block not found')
text = text.replace(old, new, 1)

text = text.replace('''    "estrada-parque-pocone-porto-cercado": {
        "roads": ["mt/370.json"],''', '''    "estrada-parque-pocone-porto-cercado": {
        "roads": ["mt/370.json"],
        "wholeRoad": True,''', 1)
text = text.replace('''    "estrada-parque-cachoeira-da-fumaca": {
        "roads": ["mt/457.json"],''', '''    "estrada-parque-cachoeira-da-fumaca": {
        "roads": ["mt/457.json"],
        "wholeRoad": True,''', 1)

path.write_text(text, encoding='utf-8')
print('builder patched for whole-road and rural geocoding fallbacks')
