#!/usr/bin/env python3
"""Build static geometry for long Latin-American iconic routes.

OSM route relations are preferred. The Mexican original Pan-American corridor is
completed with routed waypoints because the current Pan-American OSM superrelation
does not reach Nuevo Laredo. Generated files use the polyline5 schema consumed by
the app and retain only the canonical corridor, not side branches.
"""

from __future__ import annotations

import heapq
import json
import math
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "iconic-routes" / "v1"
USER_AGENT = "minhas-viagens-iconic-route-builder/1.1 (+https://github.com/lcmsarq-creator/minhas-viagens)"
OVERPASS_ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving"

ROUTES = {
    "via-panamericana": {
        "segments": [
            {
                "kind": "osrm",
                "label": "Nuevo Laredo–La Mesilla",
                # Original Mexican corridor: MEX-85 north of Mexico City and
                # MEX-190 southward. Intermediate points keep the router on it.
                "points": [
                    (27.4994, -99.5073), # Nuevo Laredo
                    (25.6866, -100.3161),# Monterrey
                    (24.8577, -99.5674), # Linares
                    (23.7369, -99.1411), # Ciudad Victoria
                    (22.7433, -98.9711), # Ciudad Mante
                    (21.9833, -99.0167), # Ciudad Valles
                    (21.2590, -98.7890), # Tamazunchale
                    (20.1011, -98.7591), # Pachuca
                    (19.4326, -99.1332), # Ciudad de Mexico
                    (19.0414, -98.2063), # Puebla
                    (17.8079, -97.7796), # Huajuapan de Leon
                    (17.0732, -96.7266), # Oaxaca
                    (16.3246, -95.2380), # Tehuantepec
                    (16.7516, -93.1029), # Tuxtla Gutierrez
                    (16.7370, -92.6376), # San Cristobal de las Casas
                    (16.2470, -92.1350), # Comitan
                    (15.6630, -92.1460), # La Mesilla
                ],
            },
            {
                "kind": "relation",
                "relation": 1661488,
                "start": (15.6630, -92.1460), # La Mesilla / Guatemala border
                "end": (8.1587, -77.6928),    # Yaviza, Panama
                "label": "La Mesilla–Yaviza",
            },
            {
                "kind": "relation",
                "relation": 240861,
                "start": (8.0928, -76.7282),  # northwestern Colombia / Turbo area
                "end": (-34.6037, -58.3816),  # Buenos Aires
                "label": "Colombia–Buenos Aires",
            },
        ],
        "source_type": "osm-route-relation+osrm-waypoints",
        "source_url": "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
        "note": "Eixo principal latino-americano em dois trechos, separado pelo Tapón del Darién.",
    },
    "carretera-austral": {
        "segments": [
            {
                "kind": "relation",
                "relation": 6582701,
                "start": (-41.4717, -72.9369), # Puerto Montt
                "end": (-48.4666, -72.5592),   # Villa O'Higgins
                "label": "Puerto Montt–Villa O'Higgins",
            },
        ],
        "source_type": "osm-route-relation",
        "source_url": "https://www.openstreetmap.org/relation/6582701",
        "note": "Ruta 7 / Longitudinal Austral; o corredor inclui conexões marítimas da rota.",
    },
}


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def overpass_ways(relation_id: int) -> list[dict]:
    query = f"""[out:json][timeout:240][maxsize:1073741824];
relation({relation_id})->.root;
(.root; >>;)->.all;
way.all;
out geom;"""
    payload = urllib.parse.urlencode({"data": query}).encode()
    errors: list[str] = []
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(2):
            try:
                request = urllib.request.Request(
                    endpoint, data=payload,
                    headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=300) as response:
                    data = json.load(response)
                ways = [e for e in data.get("elements", []) if e.get("type") == "way" and len(e.get("geometry", [])) > 1]
                if not ways:
                    raise RuntimeError("Overpass returned no way geometry")
                print(f"relation {relation_id}: {len(ways)} ways from {endpoint}")
                return ways
            except Exception as exc:
                errors.append(f"{endpoint} attempt {attempt + 1}: {exc}")
                time.sleep(4 + attempt * 4)
    raise RuntimeError(f"Could not download relation {relation_id}: " + " | ".join(errors[-6:]))


def graph_from_ways(ways: list[dict]):
    coords: dict[object, tuple[float, float]] = {}
    graph: dict[object, list[tuple[object, float]]] = {}
    for way in ways:
        geometry = way.get("geometry") or []
        node_ids = way.get("nodes") or []
        use_ids = len(node_ids) == len(geometry)
        keys: list[object] = []
        for index, point in enumerate(geometry):
            lat, lon = float(point["lat"]), float(point["lon"])
            key: object = node_ids[index] if use_ids else (round(lat, 7), round(lon, 7))
            coords[key] = (lat, lon)
            graph.setdefault(key, [])
            keys.append(key)
        for a, b in zip(keys, keys[1:]):
            if a == b:
                continue
            weight = haversine(coords[a], coords[b])
            if weight <= 0:
                continue
            graph[a].append((b, weight))
            graph[b].append((a, weight))
    return graph, coords


def nearest_node(coords: dict, target: tuple[float, float]):
    key, coord = min(coords.items(), key=lambda item: haversine(item[1], target))
    return key, haversine(coord, target), coord


def shortest_path(graph: dict, start, end) -> list:
    queue = [(0.0, start)]
    distance = {start: 0.0}
    previous = {}
    while queue:
        cost, node = heapq.heappop(queue)
        if cost != distance.get(node):
            continue
        if node == end:
            break
        for nxt, weight in graph.get(node, ()):
            candidate = cost + weight
            if candidate < distance.get(nxt, float("inf")):
                distance[nxt] = candidate
                previous[nxt] = node
                heapq.heappush(queue, (candidate, nxt))
    if end not in distance:
        raise RuntimeError("Configured endpoints are not connected inside the OSM route relation")
    result = [end]
    while result[-1] != start:
        result.append(previous[result[-1]])
    return list(reversed(result))


def osrm_route(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    coordinates = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    query = urllib.parse.urlencode({"overview": "full", "geometries": "geojson", "steps": "false"})
    url = f"{OSRM_ENDPOINT}/{coordinates}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RuntimeError(f"OSRM route failed: {payload.get('code', 'unknown')}")
    geometry = payload["routes"][0]["geometry"]["coordinates"]
    return [(float(lat), float(lon)) for lon, lat in geometry]


def point_segment_distance_m(point, a, b) -> float:
    lat0 = math.radians(point[0])
    kx, ky = 111_320.0 * math.cos(lat0), 111_320.0
    px, py = point[1] * kx, point[0] * ky
    ax, ay = a[1] * kx, a[0] * ky
    bx, by = b[1] * kx, b[0] * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points: list[tuple[float, float]], tolerance_m: float = 12.0):
    if len(points) <= 2:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        a, b = points[first], points[last]
        best_distance, best_index = -1.0, None
        for index in range(first + 1, last):
            distance = point_segment_distance_m(points[index], a, b)
            if distance > best_distance:
                best_distance, best_index = distance, index
        if best_index is not None and best_distance > tolerance_m:
            keep.add(best_index)
            stack.append((first, best_index))
            stack.append((best_index, last))
    return [points[index] for index in sorted(keep)]


def encode_polyline(points: list[tuple[float, float]], precision: int = 5) -> str:
    factor = 10 ** precision
    output: list[str] = []
    previous_lat = previous_lon = 0
    for lat, lon in points:
        lat_i, lon_i = int(round(lat * factor)), int(round(lon * factor))
        for value in (lat_i - previous_lat, lon_i - previous_lon):
            value = ~(value << 1) if value < 0 else value << 1
            while value >= 0x20:
                output.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            output.append(chr(value + 63))
        previous_lat, previous_lon = lat_i, lon_i
    return "".join(output)


def line_km(points):
    return sum(haversine(a, b) for a, b in zip(points, points[1:]))


def merge_contiguous(lines: list[list[tuple[float, float]]], threshold_km: float = 25.0):
    merged: list[list[tuple[float, float]]] = []
    for line in lines:
        if not line:
            continue
        if merged and haversine(merged[-1][-1], line[0]) <= threshold_km:
            merged[-1].extend(line[1:])
        else:
            merged.append(list(line))
    return merged


def bounds(lines):
    pts = [p for line in lines for p in line]
    return [
        [round(min(p[0] for p in pts), 6), round(min(p[1] for p in pts), 6)],
        [round(max(p[0] for p in pts), 6), round(max(p[1] for p in pts), 6)],
    ]


def relation_line(route_id: str, segment: dict):
    relation_id = int(segment["relation"])
    ways = overpass_ways(relation_id)
    graph, coords = graph_from_ways(ways)
    start, start_snap, start_coord = nearest_node(coords, segment["start"])
    end, end_snap, end_coord = nearest_node(coords, segment["end"])
    if start_snap > 80 or end_snap > 80:
        raise RuntimeError(
            f"{route_id}/{segment['label']}: endpoint too far from relation "
            f"(start {start_snap:.1f} km at {start_coord}, end {end_snap:.1f} km at {end_coord})"
        )
    nodes = shortest_path(graph, start, end)
    return [coords[node] for node in nodes], relation_id, start_snap, end_snap


def build_route(route_id: str, config: dict):
    raw_lines = []
    relation_ids = []
    segment_meta = []
    for segment in config["segments"]:
        kind = segment.get("kind", "relation")
        if kind == "osrm":
            raw_line = osrm_route(segment["points"])
            relation_id = None
            start_snap = end_snap = 0.0
        else:
            raw_line, relation_id, start_snap, end_snap = relation_line(route_id, segment)
            relation_ids.append(relation_id)
        distance = line_km(raw_line)
        simplified = simplify(raw_line)
        print(
            f"{route_id}/{segment['label']}: {len(raw_line)} -> {len(simplified)} points, "
            f"{distance:.1f} km" + (f", snaps {start_snap:.1f}/{end_snap:.1f} km" if relation_id else "")
        )
        raw_lines.append(simplified)
        meta = {"label": segment["label"], "source": kind, "totalKm": round(distance, 3)}
        if relation_id:
            meta["osmRelationId"] = relation_id
        segment_meta.append(meta)

    lines = merge_contiguous(raw_lines)
    payload = {
        "kind": "iconic_route_geometry",
        "schema": "iconic-route-polyline5-v1",
        "id": route_id,
        "precision": 5,
        "encodedLines": [encode_polyline(line) for line in lines],
        "totalKm": round(sum(line_km(line) for line in lines), 3),
        "bounds": bounds(lines),
        "sourceType": config["source_type"],
        "sourceUrl": config["source_url"],
        "osmRelationIds": relation_ids,
        "segments": segment_meta,
        "note": config["note"],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{route_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    return payload


def main():
    selected = os.environ.get("ICONIC_ROUTE", "").strip()
    entries = ROUTES.items() if not selected else [(selected, ROUTES[selected])]
    for route_id, config in entries:
        payload = build_route(route_id, config)
        print(f"wrote {route_id}: {payload['totalKm']:.1f} km, {len(payload['encodedLines'])} line(s)")


if __name__ == "__main__":
    main()
