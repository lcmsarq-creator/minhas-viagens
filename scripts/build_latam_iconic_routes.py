#!/usr/bin/env python3
"""Build static geometry for long Latin-American iconic routes from OSM relations.

The generated files use the same polyline5 schema consumed by iconic-routes.js.
Only the canonical corridor between configured endpoints is retained, so branches
inside a super-relation do not inflate achievement progress.
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
USER_AGENT = "minhas-viagens-iconic-route-builder/1.0 (+https://github.com/lcmsarq-creator/minhas-viagens)"
OVERPASS_ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

# OSM relation sources and canonical endpoints. The Pan-American Highway is
# intentionally kept as two disconnected lines because the Darien Gap has no road.
ROUTES = {
    "via-panamericana": {
        "segments": [
            {
                "relation": 1661488,
                "start": (27.4994, -99.5073),  # Nuevo Laredo / Laredo border
                "end": (8.1587, -77.6928),     # Yaviza, Panama
                "label": "Nuevo Laredo–Yaviza",
            },
            {
                "relation": 240861,
                "start": (8.0928, -76.7282),   # northwestern Colombia / Turbo area
                "end": (-34.6037, -58.3816),   # Buenos Aires
                "label": "Colombia–Buenos Aires",
            },
        ],
        "source_type": "osm-route-relation",
        "source_url": "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
        "note": "Eixo principal latino-americano em dois trechos, separado pelo Tapón del Darién.",
    },
    "carretera-austral": {
        "segments": [
            {
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
    dlat = lat2 - lat1
    dlon = lon2 - lon1
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
                    endpoint,
                    data=payload,
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
            except Exception as exc:  # network fallback is intentional
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
    key, distance = min(coords.items(), key=lambda item: haversine(item[1], target))
    return key, haversine(distance, target)


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
    result.reverse()
    return result


def point_segment_distance_m(point, a, b) -> float:
    lat0 = math.radians(point[0])
    kx = 111_320.0 * math.cos(lat0)
    ky = 111_320.0
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
        best_distance = -1.0
        best_index = None
        for index in range(first + 1, last):
            distance = point_segment_distance_m(points[index], a, b)
            if distance > best_distance:
                best_distance = distance
                best_index = index
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
        lat_i = int(round(lat * factor))
        lon_i = int(round(lon * factor))
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


def bounds(lines):
    pts = [p for line in lines for p in line]
    return [
        [round(min(p[0] for p in pts), 6), round(min(p[1] for p in pts), 6)],
        [round(max(p[0] for p in pts), 6), round(max(p[1] for p in pts), 6)],
    ]


def build_route(route_id: str, config: dict):
    lines = []
    relation_ids = []
    segment_meta = []
    for segment in config["segments"]:
        relation_id = int(segment["relation"])
        ways = overpass_ways(relation_id)
        graph, coords = graph_from_ways(ways)
        start, start_snap = nearest_node(coords, segment["start"])
        end, end_snap = nearest_node(coords, segment["end"])
        if start_snap > 80 or end_snap > 80:
            raise RuntimeError(
                f"{route_id}/{segment['label']}: endpoint too far from relation "
                f"(start {start_snap:.1f} km, end {end_snap:.1f} km)"
            )
        nodes = shortest_path(graph, start, end)
        raw_line = [coords[node] for node in nodes]
        simplified = simplify(raw_line)
        distance = line_km(raw_line)
        print(
            f"{route_id}/{segment['label']}: {len(raw_line)} -> {len(simplified)} points, "
            f"{distance:.1f} km, snaps {start_snap:.1f}/{end_snap:.1f} km"
        )
        lines.append(simplified)
        relation_ids.append(relation_id)
        segment_meta.append({
            "label": segment["label"],
            "osmRelationId": relation_id,
            "totalKm": round(distance, 3),
        })

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
    path = OUT / f"{route_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return payload


def main():
    selected = os.environ.get("ICONIC_ROUTE", "").strip()
    entries = ROUTES.items() if not selected else [(selected, ROUTES[selected])]
    for route_id, config in entries:
        payload = build_route(route_id, config)
        print(f"wrote {route_id}: {payload['totalKm']:.1f} km, {len(payload['encodedLines'])} line(s)")


if __name__ == "__main__":
    main()
