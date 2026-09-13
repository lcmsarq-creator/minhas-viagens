#!/usr/bin/env python3
"""Build the static geometry catalog used by the iconic-routes UI.

The output is deliberately committed with the application.  Browsers never need
to contact a routing service merely to discover or score an iconic route.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import heapq
import json
import math
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "iconic-routes" / "v1"
ROAD_DIR = ROOT / "road-catalog" / "v1" / "br"
PRECISION = 5
USER_AGENT = "MinhasViagens-iconic-route-builder/1.0"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving/{}?overview=full&geometries=geojson&steps=false"


def haversine_km(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = lat2 - lat1
    dlng = math.radians(b[1] - a[1])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))


def line_km(line):
    return sum(haversine_km(a, b) for a, b in zip(line, line[1:]))


def point_segment_distance_m(point, a, b):
    ref_lat = math.radians((point[0] + a[0] + b[0]) / 3)
    sx = 111_320 * max(0.15, math.cos(ref_lat))
    sy = 110_540
    px, py = point[1] * sx, point[0] * sy
    ax, ay = a[1] * sx, a[0] * sy
    bx, by = b[1] * sx, b[0] * sy
    dx, dy = bx - ax, by - ay
    if not dx and not dy:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(line, tolerance_m=35):
    if len(line) <= 2:
        return line
    keep = {0, len(line) - 1}
    stack = [(0, len(line) - 1)]
    while stack:
        start, end = stack.pop()
        best_distance = tolerance_m
        best_index = -1
        for index in range(start + 1, end):
            distance = point_segment_distance_m(line[index], line[start], line[end])
            if distance > best_distance:
                best_distance = distance
                best_index = index
        if best_index >= 0:
            keep.add(best_index)
            stack.extend(((start, best_index), (best_index, end)))
    return [line[index] for index in sorted(keep)]


def encode_signed(value):
    value = ~(value << 1) if value < 0 else value << 1
    out = []
    while value >= 0x20:
        out.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    out.append(chr(value + 63))
    return "".join(out)


def encode_polyline(line, precision=PRECISION):
    factor = 10**precision
    last_lat = last_lng = 0
    out = []
    for point in line:
        lat = round(point[0] * factor)
        lng = round(point[1] * factor)
        out.append(encode_signed(lat - last_lat))
        out.append(encode_signed(lng - last_lng))
        last_lat, last_lng = lat, lng
    return "".join(out)


def decode_polyline(encoded, precision=PRECISION):
    factor = 10**precision
    index = lat = lng = 0
    points = []

    def next_value():
        nonlocal index
        result = shift = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                return ~(result >> 1) if result & 1 else result >> 1

    while index < len(encoded):
        lat += next_value()
        lng += next_value()
        points.append([lat / factor, lng / factor])
    return points


def bounds_for(lines):
    points = [point for line in lines for point in line]
    return [
        [min(point[0] for point in points), min(point[1] for point in points)],
        [max(point[0] for point in points), max(point[1] for point in points)],
    ]


def route_with_osrm(waypoints):
    coordinates = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in waypoints)
    request = urllib.request.Request(OSRM_URL.format(coordinates), headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RuntimeError(f"OSRM did not return a route: {payload.get('code')}")
    line = [[lat, lng] for lng, lat in payload["routes"][0]["geometry"]["coordinates"]]
    return [simplify(line, 30)]


def road_payload(relative_path):
    with (ROAD_DIR / relative_path).open(encoding="utf-8") as handle:
        return json.load(handle)


def road_lines(relative_paths):
    lines = []
    for relative_path in relative_paths:
        payload = road_payload(relative_path)
        precision = int(payload.get("precision") or PRECISION)
        lines.extend(decode_polyline(value, precision) for value in payload.get("encodedLines", []))
    return [line for line in lines if len(line) > 1]


def node_key(point):
    return round(point[0], 5), round(point[1], 5)


def route_on_road_catalog(relative_paths, waypoints):
    graph = {}
    coordinates = {}
    for line in road_lines(relative_paths):
        for a, b in zip(line, line[1:]):
            ka, kb = node_key(a), node_key(b)
            if ka == kb:
                continue
            coordinates.setdefault(ka, [float(a[0]), float(a[1])])
            coordinates.setdefault(kb, [float(b[0]), float(b[1])])
            distance = haversine_km(a, b)
            graph.setdefault(ka, []).append((distance, kb))
            graph.setdefault(kb, []).append((distance, ka))

    nodes = list(coordinates)
    if not nodes:
        raise RuntimeError("empty road graph")

    def snap(point):
        return min(nodes, key=lambda key: haversine_km(point, coordinates[key]))

    def shortest(start, target):
        queue = [(0.0, start)]
        distance = {start: 0.0}
        previous = {}
        while queue:
            current_distance, current = heapq.heappop(queue)
            if current == target:
                break
            if current_distance != distance.get(current):
                continue
            for edge_distance, neighbor in graph.get(current, []):
                candidate = current_distance + edge_distance
                if candidate < distance.get(neighbor, float("inf")):
                    distance[neighbor] = candidate
                    previous[neighbor] = current
                    heapq.heappush(queue, (candidate, neighbor))
        if target not in distance:
            raise RuntimeError("road catalog components are disconnected")
        path = [target]
        while path[-1] != start:
            path.append(previous[path[-1]])
        return list(reversed(path))

    path_keys = []
    snapped = [snap(point) for point in waypoints]
    for start, target in zip(snapped, snapped[1:]):
        section = shortest(start, target)
        path_keys.extend(section if not path_keys else section[1:])
    line = [coordinates[key] for key in path_keys]
    return [simplify(line, 25)]


def route_on_osm_network(waypoint_groups, bbox):
    """Route on every motorable OSM way, including unpaved tracks omitted by OSRM."""
    west, south, east, north = bbox
    step = 0.20
    tiles = []
    x = west
    while x < east:
        y = south
        while y < north:
            tiles.append((x, y, min(x + step, east), min(y + step, north)))
            y += step
        x += step

    def fetch_tile(tile):
        query = urllib.parse.urlencode({"bbox": ",".join(f"{value:.6f}" for value in tile)})
        request = urllib.request.Request(
            f"https://api.openstreetmap.org/api/0.6/map?{query}",
            headers={"User-Agent": USER_AGENT},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        documents = list(executor.map(fetch_tile, tiles))

    nodes = {}
    ways = {}
    blocked = {"footway", "path", "steps", "pedestrian", "cycleway", "construction", "proposed"}
    for document in documents:
        root = ET.fromstring(document)
        for node in root.findall("node"):
            nodes[int(node.attrib["id"])] = [float(node.attrib["lat"]), float(node.attrib["lon"])]
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            if not tags.get("highway") or tags["highway"] in blocked:
                continue
            ways[int(way.attrib["id"])] = ([int(item.attrib["ref"]) for item in way.findall("nd")], tags)

    graph = {}
    for references, tags in ways.values():
        preference = 1.05 if tags.get("highway") == "track" else 1.0
        for a, b in zip(references, references[1:]):
            if a not in nodes or b not in nodes:
                continue
            distance = haversine_km(nodes[a], nodes[b])
            graph.setdefault(a, []).append((distance * preference, distance, b))
            graph.setdefault(b, []).append((distance * preference, distance, a))
    graph_nodes = list(graph)

    def snap(point):
        return min(graph_nodes, key=lambda node: haversine_km(point, nodes[node]))

    def shortest(start, target):
        queue = [(0.0, start)]
        distance = {start: 0.0}
        previous = {}
        while queue:
            current_distance, current = heapq.heappop(queue)
            if current == target:
                break
            if current_distance != distance.get(current):
                continue
            for weighted, actual, neighbor in graph.get(current, []):
                candidate = current_distance + weighted
                if candidate < distance.get(neighbor, float("inf")):
                    distance[neighbor] = candidate
                    previous[neighbor] = (current, actual)
                    heapq.heappush(queue, (candidate, neighbor))
        if target not in distance:
            raise RuntimeError("OSM local road network is disconnected")
        path = [target]
        while path[-1] != start:
            path.append(previous[path[-1]][0])
        return list(reversed(path))

    results = {}
    for route_id, waypoints in waypoint_groups.items():
        snapped = [snap(point) for point in waypoints]
        route_nodes = []
        for start, target in zip(snapped, snapped[1:]):
            section = shortest(start, target)
            route_nodes.extend(section if not route_nodes else section[1:])
        results[route_id] = [simplify([nodes[node] for node in route_nodes], 20)]
    return results


def copy_whole_road(relative_path):
    return [simplify(line, 25) for line in road_lines([relative_path])]


def official_estrada_real(gpx_path):
    namespace = {"g": "http://www.topografix.com/GPX/1/1"}
    root = ET.parse(gpx_path).getroot()
    result = []
    seen = set()
    for track in root.findall("g:trk", namespace):
        name = track.findtext("g:name", "", namespace)
        if re.search(r"alternativ|para carro|caminho para carro|trilha", name, re.I):
            continue
        points = [
            [float(point.attrib["lat"]), float(point.attrib["lon"])]
            for point in track.findall(".//g:trkpt", namespace)
        ]
        if len(points) < 2 or line_km(points) < 1:
            continue
        line = simplify(points, 20)
        encoded = encode_polyline(line)
        reverse = encode_polyline(list(reversed(line)))
        key = min(encoded, reverse)
        if key in seen:
            continue
        seen.add(key)
        result.append(line)
    if not result:
        raise RuntimeError(f"no official tracks in {gpx_path}")
    return result


ER_SPECS = {
    "estrada-real-caminho-dos-diamantes": {
        "file": "estrada-real-diamantes.gpx",
        "sourceUrl": "https://institutoestradareal.com.br/roteiros-planilhados/caminho-dos-diamantes/",
        "alternate": [
            [-18.24692, -43.60345], [-18.60472, -43.37944], [-19.03722, -43.425],
            [-19.88639, -43.80667], [-20.39484, -43.50517],
        ],
    },
    "estrada-real-caminho-novo": {
        "file": "estrada-real-novo.gpx",
        "sourceUrl": "https://institutoestradareal.com.br/roteiros-planilhados/caminho-novo/",
        "alternate": [
            [-20.39484, -43.50517], [-20.66028, -43.78611], [-21.22583, -43.77361],
            [-21.76417, -43.35028], [-22.15847, -43.29321], [-22.505, -43.17861],
            [-22.65278, -43.04056],
        ],
    },
    "estrada-real-caminho-velho": {
        "file": "estrada-real-velho.gpx",
        "sourceUrl": "https://institutoestradareal.com.br/roteiros-planilhados/caminho-velho/",
        "alternate": [
            [-20.39484, -43.50517], [-21.13556, -44.26167], [-21.11028, -44.17806],
            [-21.4875, -44.6425], [-21.97722, -44.9325], [-22.39028, -44.96667],
            [-22.81639, -45.1925], [-23.07444, -44.95972], [-23.21778, -44.71306],
        ],
    },
    "estrada-real-caminho-de-sabarabucu": {
        "file": "estrada-real-sabarabucu.gpx",
        "sourceUrl": "https://institutoestradareal.com.br/roteiros-planilhados/caminho-do-sabarabucu/",
        "alternate": [
            [-19.942, -43.487], [-19.88, -43.66972], [-19.88639, -43.80667],
            [-20.0875, -43.78944], [-20.246, -43.712],
        ],
    },
}


ROAD_SPECS = {
    "estrada-da-graciosa": ("whole", ["pr/410.json"], []),
    "serra-do-corvo-branco": ("path", ["sc/370.json"], [[-28.185, -49.21472], [-28.015, -49.59167]]),
    "serra-dona-francisca": ("path", ["sc/418.json"], [[-26.30444, -48.84556], [-26.1925, -49.26556]]),
    "serra-do-rio-do-rastro": ("path", ["sc/390.json"], [[-28.39278, -49.39667], [-28.33694, -49.62472]]),
    "serra-da-rocinha": ("path", ["br/285.json"], [[-28.83161, -49.84575], [-28.74806, -50.06357]]),
    "rota-do-sol": ("path", ["rsc/453.json", "ers/486.json"], [[-29.16806, -51.17944], [-29.265, -50.303], [-29.58528, -50.07083]]),
    "serra-da-macaca": ("path", ["sp/139.json"], [[-24.03396, -48.01394], [-24.193393, -47.919748]]),
    "estrada-parque-pantanal": ("path", ["ms/184.json", "ms/228.json"], [[-19.649147, -57.026802], [-19.257672, -57.235742], [-19.02, -57.62]]),
    "rio-santos": ("path", ["sp/055.json", "br/101.json"], [[-23.96083, -46.33361], [-23.85444, -46.13861], [-23.76, -45.40972], [-23.43389, -45.07111], [-23.21778, -44.71306], [-23.00667, -44.31806], [-22.9068, -43.1729]]),
    "estrada-do-pacifico": ("path", ["br/317.json"], [[-9.97472, -67.81], [-10.65167, -68.50444], [-11.01611, -68.74806], [-10.94139, -69.56694]]),
    "br-319-manaus-porto-velho": ("path", ["br/319.json"], [[-3.10194, -60.025], [-8.76194, -63.90389]]),
    "corredor-chapada-dos-veadeiros": ("path", ["go/118.json"], [[-15.50, -47.61], [-14.13628, -47.52166], [-13.77965, -47.26782], [-13.7975, -47.45833]]),
    "serra-do-tepequem": ("path", ["rr/203.json"], [[3.65222, -61.37056], [3.780785, -61.729123]]),
    "rastro-da-serpente": ("path", ["sp/250.json", "br/476.json"], [[-24.00583, -48.34944], [-24.50944, -48.8425], [-24.65694, -49.00889], [-25.42778, -49.27306]]),
    "estrada-parque-da-serra": ("path", ["ba/001.json"], [[-14.793, -39.046], [-14.2789, -38.99584]]),
}


OSRM_SPECS = {
    "caminhos-de-pedra": [[-29.17139, -51.51917], [-29.174801, -51.44033]],
    "rota-romantica": [[-29.76028, -51.14722], [-29.67833, -51.13056], [-29.64833, -51.17389], [-29.59111, -51.16056], [-29.58028, -51.08528], [-29.53806, -51.08083], [-29.49806, -50.99278], [-29.51944, -51.17806], [-29.4675, -51.20083], [-29.45152, -51.13335], [-29.37639, -51.11444], [-29.37861, -50.87389], [-29.35622, -50.81357], [-29.44806, -50.58361]],
    "caminho-da-fe": [[-21.93667, -46.71667], [-22.06806, -46.56917], [-22.31694, -46.32778], [-22.46278, -46.01722], [-22.55139, -45.92111], [-22.55417, -45.78], [-22.73944, -45.59139], [-22.92389, -45.46167], [-22.84694, -45.22972]],
    "rota-das-missoes": [[-28.66056, -56.00444], [-28.1825, -55.26722], [-28.40833, -54.96083], [-28.56278, -54.55417], [-28.29917, -54.26306]],
    "caminho-dos-canions": [[-28.33694, -49.62472], [-28.74806, -50.06357], [-29.04758, -50.14302]],
    "circuito-das-aguas-paulista": [[-22.70556, -46.98583], [-22.63306, -47.05556], [-22.741, -46.901], [-22.70111, -46.76444], [-22.68194, -46.68083], [-22.61222, -46.70056], [-22.52306, -46.65], [-22.47639, -46.63278], [-22.59139, -46.52889], [-22.70556, -46.98583]],
    "rota-do-vinho-sao-roque": [[-23.52917, -47.13528], [-23.55730, -47.12648], [-23.57830, -47.13944], [-23.60957, -47.16338]],
    "vale-europeu": [[-26.91944, -49.06611], [-26.74056, -49.17694], [-26.82333, -49.27167], [-26.73833, -49.27417], [-26.71444, -49.48333], [-26.78278, -49.36444], [-26.92278, -49.36639], [-26.95528, -49.37556], [-26.89778, -49.23167], [-26.91944, -49.06611]],
    "costa-dourada": [[-18.08639, -39.55083], [-18.18, -39.69], [-18.26055, -39.64421]],
}


OSM_NETWORK_SPECS = {
    "caminho-do-ceu-canastra": [[-20.34389, -46.85389], [-20.43439, -46.56746], [-20.32667, -46.36611]],
    "serra-branca-canastra": [[-20.43439, -46.56746], [-20.32804, -46.51329]],
}


def write_payload(route_id, lines, source_type, extra=None):
    lines = [line for line in lines if len(line) > 1]
    payload = {
        "kind": "iconic_route_geometry",
        "schema": "iconic-route-polyline5-v1",
        "id": route_id,
        "precision": PRECISION,
        "encodedLines": [encode_polyline(line) for line in lines],
        "totalKm": round(sum(line_km(line) for line in lines), 3),
        "bounds": bounds_for(lines),
        "sourceType": source_type,
    }
    if extra:
        payload.update(extra)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_DIR / f"{route_id}.json").open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    return route_id, payload["totalKm"], len(payload["encodedLines"])


def build_one_road(item):
    route_id, (method, paths, waypoints) = item
    try:
        lines = copy_whole_road(paths[0]) if method == "whole" else route_on_road_catalog(paths, waypoints)
        source_type = "road-catalog"
    except Exception as error:
        print(f"warning: {route_id}: {error}; falling back to OSRM")
        lines = route_with_osrm(waypoints)
        source_type = "routed-waypoints"
    return write_payload(route_id, lines, source_type, {"roadCatalogPaths": paths})


def build_one_osrm(item):
    route_id, waypoints = item
    return write_payload(route_id, route_with_osrm(waypoints), "routed-waypoints")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--estrada-real-dir", type=Path, required=True)
    arguments = parser.parse_args()

    for route_id, spec in ER_SPECS.items():
        official = official_estrada_real(arguments.estrada_real_dir / spec["file"])
        alternate = route_with_osrm(spec["alternate"])
        write_payload(route_id, official, "official-gpx", {
            "sourceUrl": spec["sourceUrl"],
            "alternateEncodedLines": [encode_polyline(line) for line in alternate],
            "alternateTotalKm": round(sum(line_km(line) for line in alternate), 3),
            "alternateBounds": bounds_for(alternate),
            "alternateSourceType": "routed-stage-cities",
        })

    canastra = route_on_osm_network(OSM_NETWORK_SPECS, (-46.95, -20.60, -46.25, -20.20))
    for route_id, lines in canastra.items():
        write_payload(route_id, lines, "openstreetmap-local-network")

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(build_one_road, item) for item in ROAD_SPECS.items()]
        futures.extend(executor.submit(build_one_osrm, item) for item in OSRM_SPECS.items())
        for future in concurrent.futures.as_completed(futures):
            route_id, distance, line_count = future.result()
            print(f"built {route_id}: {distance:.1f} km, {line_count} line(s)")


if __name__ == "__main__":
    main()
