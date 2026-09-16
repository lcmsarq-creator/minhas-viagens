#!/usr/bin/env python3
"""Build static geometry for Latin-American iconic road corridors.

Long transnational OSM super-relations are often split into disconnected country
components. For achievement matching we therefore route through documented corridor
milestones on the OSM road graph. The Pan-American Highway is kept as two lines,
with the Darien Gap deliberately absent.
"""

from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "iconic-routes" / "v1"
USER_AGENT = "minhas-viagens-iconic-route-builder/1.2 (+https://github.com/lcmsarq-creator/minhas-viagens)"
OSRM_ENDPOINTS = (
    "https://router.project-osrm.org/route/v1/driving",
)

ROUTES = {
    "via-panamericana": {
        "lines": [
            {
                "label": "Nuevo Laredo–Yaviza",
                "points": [
                    (27.4994, -99.5073), # Nuevo Laredo
                    (25.6866, -100.3161),# Monterrey / MEX-85
                    (24.8577, -99.5674), # Linares
                    (23.7369, -99.1411), # Ciudad Victoria
                    (22.7433, -98.9711), # Ciudad Mante
                    (21.9833, -99.0167), # Ciudad Valles
                    (21.2590, -98.7890), # Tamazunchale
                    (20.1011, -98.7591), # Pachuca
                    (19.4326, -99.1332), # Ciudad de Mexico
                    (19.0414, -98.2063), # Puebla / MEX-190
                    (17.8079, -97.7796), # Huajuapan de Leon
                    (17.0732, -96.7266), # Oaxaca
                    (16.3246, -95.2380), # Tehuantepec
                    (16.7516, -93.1029), # Tuxtla Gutierrez
                    (16.7370, -92.6376), # San Cristobal de las Casas
                    (16.2470, -92.1350), # Comitan
                    (15.6630, -92.1460), # La Mesilla / Guatemala
                    (14.6349, -90.5069), # Guatemala City
                    (13.6929, -89.2182), # San Salvador
                    (13.3003, -87.1908), # Choluteca
                    (12.1150, -86.2362), # Managua
                    (9.9281, -84.0907),  # San Jose
                    (8.5330, -82.8380),  # Paso Canoas
                    (8.4333, -82.4333),  # David
                    (8.9824, -79.5199),  # Panama City
                    (8.1587, -77.6928),  # Yaviza
                ],
            },
            {
                "label": "Colombia–Buenos Aires",
                "points": [
                    (8.0928, -76.7282),  # Turbo / NW Colombia
                    (6.2442, -75.5812),  # Medellin
                    (3.4516, -76.5320),  # Cali
                    (2.4448, -76.6147),  # Popayan
                    (1.2136, -77.2811),  # Pasto
                    (0.8303, -77.6444),  # Ipiales / Rumichaca
                    (-0.1807, -78.4678), # Quito / E35
                    (-1.2491, -78.6168), # Ambato
                    (-1.6636, -78.6546), # Riobamba
                    (-2.9001, -79.0059), # Cuenca
                    (-3.9931, -79.2042), # Loja
                    (-4.3789, -79.9430), # Macara / La Tina
                    (-5.1945, -80.6328), # Piura / PE-1N
                    (-6.7714, -79.8409), # Chiclayo
                    (-8.1091, -79.0215), # Trujillo
                    (-12.0464, -77.0428),# Lima
                    (-13.7135, -76.1842),# Pisco
                    (-14.8340, -74.9380),# Nazca
                    (-16.4090, -71.5375),# Arequipa corridor
                    (-18.0146, -70.2536),# Tacna
                    (-18.4783, -70.3126),# Arica / CH-5
                    (-23.6509, -70.3975),# Antofagasta
                    (-29.9027, -71.2519),# La Serena
                    (-32.8400, -70.9560),# Llay-Llay, split north of Santiago
                    (-32.8337, -70.5980),# Los Andes / CH-60
                    (-32.8895, -68.8458),# Mendoza / AR RN7
                    (-33.3017, -66.3378),# San Luis
                    (-34.6037, -58.3816),# Buenos Aires
                ],
            },
        ],
        "source_type": "routed-waypoints",
        "source_url": "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
        "osm_relation_ids": [1661488, 240861],
        "note": "Eixo principal latino-americano em dois trechos, separado pelo Tapón del Darién; ramais para Quellón e Ushuaia não integram este recorte inicial.",
    },
    "carretera-austral": {
        "lines": [
            {
                "label": "Puerto Montt–Villa O'Higgins",
                "points": [
                    (-41.4717, -72.9369), # Puerto Montt
                    (-41.6890, -72.6740), # Caleta La Arena
                    (-41.9690, -72.4720), # Hornopiren
                    (-42.6070, -72.6100), # Caleta Gonzalo
                    (-42.9167, -72.7167), # Chaiten
                    (-43.9740, -72.4050), # La Junta
                    (-44.3260, -72.5570), # Puyuhuapi
                    (-45.5712, -72.0685), # Coyhaique
                    (-46.6260, -72.6700), # Puerto Rio Tranquilo
                    (-47.2530, -72.5720), # Cochrane
                    (-47.9700, -73.1350), # Puerto Yungay
                    (-48.4666, -72.5592), # Villa O'Higgins
                ],
            },
        ],
        "source_type": "routed-waypoints",
        "source_url": "https://www.openstreetmap.org/relation/6582701",
        "osm_relation_ids": [6582701],
        "note": "Ruta 7 / Longitudinal Austral; o corredor inclui as conexões marítimas que fazem parte da travessia.",
    },
}


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def route_osrm(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    coordinates = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    query = urllib.parse.urlencode({"overview": "full", "geometries": "geojson", "steps": "false"})
    last_error = None
    for endpoint in OSRM_ENDPOINTS:
        url = f"{endpoint}/{coordinates}?{query}"
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=240) as response:
                payload = json.load(response)
            if payload.get("code") != "Ok" or not payload.get("routes"):
                raise RuntimeError(f"routing response {payload.get('code', 'unknown')}")
            geometry = payload["routes"][0]["geometry"]["coordinates"]
            return [(float(lat), float(lon)) for lon, lat in geometry]
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"OSM routing failed: {last_error}")


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


def bounds(lines):
    pts = [p for line in lines for p in line]
    return [
        [round(min(p[0] for p in pts), 6), round(min(p[1] for p in pts), 6)],
        [round(max(p[0] for p in pts), 6), round(max(p[1] for p in pts), 6)],
    ]


def build_route(route_id: str, config: dict):
    lines = []
    segments = []
    for definition in config["lines"]:
        raw = route_osrm(definition["points"])
        simplified = simplify(raw)
        distance = line_km(raw)
        if distance < 100:
            raise RuntimeError(f"{route_id}/{definition['label']} returned an implausibly short route")
        print(f"{route_id}/{definition['label']}: {len(raw)} -> {len(simplified)} points, {distance:.1f} km")
        lines.append(simplified)
        segments.append({"label": definition["label"], "totalKm": round(distance, 3)})

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
        "osmRelationIds": config.get("osm_relation_ids", []),
        "segments": segments,
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
