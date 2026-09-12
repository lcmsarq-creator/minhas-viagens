#!/usr/bin/env python3
"""Build a compact, deterministic Brazilian road-geometry catalog from OSM PBF.

The input should contain highway ways plus road-route relations and their
referenced nodes. The GitHub workflow creates that reduced extract with
osmium-tool before invoking this script.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence


CATALOG_SCHEMA = "road-catalog-polyline5-v1"
MANIFEST_SCHEMA = "road-catalog-manifest-v1"
VALIDATION_SCHEMA = "complete-road-catalog-v1"
CACHE_VERSION = 2
PRECISION = 5
DEFAULT_TOLERANCE_M = 25.0

STANDARD_PREFIXES = {
    "BR", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS",
    "RO", "RR", "SC", "SP", "SE", "TO",
}
SECONDARY_PARENT_STATE = {
    "LMG": "MG", "AMG": "MG", "MGC": "MG", "CMG": "MG",
    "ERS": "RS", "RSC": "RS", "VRS": "RS",
    "SPV": "SP", "SPA": "SP", "SPI": "SP",
}
ALL_PREFIXES = STANDARD_PREFIXES | set(SECONDARY_PARENT_STATE)
PREFIX_PATTERN = "|".join(sorted(ALL_PREFIXES, key=lambda value: (-len(value), value)))
EXPLICIT_REF_RE = re.compile(
    rf"\b({PREFIX_PATTERN})\s*[- ]?\s*(\d{{1,4}}(?:/\d{{1,4}})?)\b",
    re.IGNORECASE,
)
BARE_NUMBER_RE = re.compile(r"^\s*(\d{1,4}(?:/\d{1,4})?)\s*$")


def canonical_keys(*values: str | None, network: str | None = None) -> set[str]:
    """Extract app-compatible BR|network|number keys from OSM reference tags."""
    keys: set[str] = set()
    for value in values:
        for prefix, number in EXPLICIT_REF_RE.findall(str(value or "").upper().replace("–", "-").replace("—", "-")):
            keys.add(f"BR|{prefix.upper()}|{number.upper()}")

    if keys:
        return keys

    network_tokens = re.findall(r"[A-Z]{2,3}", str(network or "").upper())
    candidates = [token for token in network_tokens if token in ALL_PREFIXES]
    prefix = next((token for token in reversed(candidates) if token != "BR"), None)
    if prefix is None and "BR" in candidates:
        prefix = "BR"
    if prefix:
        for value in values:
            bare = BARE_NUMBER_RE.match(str(value or ""))
            if bare:
                keys.add(f"BR|{prefix}|{bare.group(1)}")
    return keys


def catalog_path_for_key(key: str) -> str:
    def safe(segment: str) -> str:
        value = re.sub(r"[^a-z0-9]+", "-", segment.lower()).strip("-")
        if not value:
            raise ValueError(f"Invalid empty catalog path segment in {key!r}")
        return value

    parts = key.split("|")
    if len(parts) != 3:
        raise ValueError(f"Invalid road key: {key!r}")
    return "/".join(safe(part) for part in parts) + ".json"


def point_segment_distance_m(point: Sequence[float], a: Sequence[float], b: Sequence[float]) -> float:
    lat_scale = 111_320.0
    lng_scale = max(1.0, math.cos(math.radians(point[0])) * 111_320.0)
    px, py = point[1] * lng_scale, point[0] * lat_scale
    ax, ay = a[1] * lng_scale, a[0] * lat_scale
    bx, by = b[1] * lng_scale, b[0] * lat_scale
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    t = 0.0 if denominator == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denominator))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify_line(points: Sequence[Sequence[float]], tolerance_m: float) -> list[list[float]]:
    clean = [[float(point[0]), float(point[1])] for point in points]
    if len(clean) <= 2 or tolerance_m <= 0:
        return clean

    keep = {0, len(clean) - 1}
    stack = [(0, len(clean) - 1)]
    while stack:
        start, end = stack.pop()
        farthest_index = -1
        farthest_distance = -1.0
        for index in range(start + 1, end):
            distance = point_segment_distance_m(clean[index], clean[start], clean[end])
            if distance > farthest_distance:
                farthest_distance = distance
                farthest_index = index
        if farthest_index >= 0 and farthest_distance > tolerance_m:
            keep.add(farthest_index)
            stack.append((start, farthest_index))
            stack.append((farthest_index, end))
    return [clean[index] for index in sorted(keep)]


def haversine_km(a: Sequence[float], b: Sequence[float]) -> float:
    radius = 6371.0088
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = lat2 - lat1
    dlon = math.radians(b[1] - a[1])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0.0, 1 - value)))


def line_length_km(line: Sequence[Sequence[float]]) -> float:
    return sum(haversine_km(line[index - 1], line[index]) for index in range(1, len(line)))


def encode_polyline(points: Sequence[Sequence[float]], precision: int = PRECISION) -> str:
    factor = 10**precision
    previous_lat = 0
    previous_lon = 0
    output: list[str] = []

    def encode_value(value: int) -> None:
        transformed = ~(value << 1) if value < 0 else value << 1
        while transformed >= 0x20:
            output.append(chr((0x20 | (transformed & 0x1F)) + 63))
            transformed >>= 5
        output.append(chr(transformed + 63))

    for lat, lon in points:
        current_lat = round(float(lat) * factor)
        current_lon = round(float(lon) * factor)
        encode_value(current_lat - previous_lat)
        encode_value(current_lon - previous_lon)
        previous_lat, previous_lon = current_lat, current_lon
    return "".join(output)


def geometry_signature(line: Sequence[Sequence[float]]) -> tuple:
    forward = tuple((round(point[0], 6), round(point[1], 6)) for point in line)
    reverse = tuple(reversed(forward))
    return min(forward, reverse)


def payload_for_road(key: str, raw_lines: Iterable[Sequence[Sequence[float]]], tolerance_m: float) -> dict:
    unique: dict[tuple, list[list[float]]] = {}
    for raw_line in raw_lines:
        line = simplify_line(raw_line, tolerance_m)
        if len(line) < 2:
            continue
        unique.setdefault(geometry_signature(line), line)
    lines = sorted(unique.values(), key=lambda line: (round(line[0][0], 6), round(line[0][1], 6), len(line)))
    if not lines:
        raise ValueError(f"Road {key} has no usable lines")

    flat = [point for line in lines for point in line]
    country, network, number = key.split("|")
    parent_state = SECONDARY_PARENT_STATE.get(network, "" if network == "BR" else network)
    return {
        "kind": "road_geometry_catalog",
        "schema": CATALOG_SCHEMA,
        "validationSchema": VALIDATION_SCHEMA,
        "key": key,
        "descriptor": {
            "countryCode": country,
            "network": network,
            "number": number,
            "stateCode": parent_state or None,
            "ref": f"{network}-{number}",
        },
        "cacheVersion": CACHE_VERSION,
        "precision": PRECISION,
        "compactToleranceM": tolerance_m,
        "partial": False,
        "pointCount": len(flat),
        "totalKm": round(sum(line_length_km(line) for line in lines), 3),
        "bounds": [
            [min(point[0] for point in flat), min(point[1] for point in flat)],
            [max(point[0] for point in flat), max(point[1] for point in flat)],
        ],
        "encodedLines": [encode_polyline(line) for line in lines],
    }


def build_catalog(input_path: Path, output_path: Path, source_date: str, tolerance_m: float) -> dict:
    try:
        import osmium  # type: ignore
    except ImportError as error:
        raise SystemExit("Install the pinned dependency from scripts/requirements-road-catalog.txt") from error

    member_keys: dict[int, set[str]] = defaultdict(set)

    class RelationHandler(osmium.SimpleHandler):
        def relation(self, relation):
            if relation.tags.get("route") != "road":
                return
            keys = canonical_keys(
                relation.tags.get("ref"),
                relation.tags.get("nat_ref"),
                relation.tags.get("official_ref"),
                network=relation.tags.get("network"),
            )
            if not keys:
                return
            for member in relation.members:
                if member.type == "w":
                    member_keys[int(member.ref)].update(keys)

    RelationHandler().apply_file(str(input_path))

    roads: dict[str, list[list[list[float]]]] = defaultdict(list)

    class WayHandler(osmium.SimpleHandler):
        def way(self, way):
            keys = set(member_keys.get(int(way.id), ()))
            keys.update(canonical_keys(
                way.tags.get("ref"),
                way.tags.get("nat_ref"),
                way.tags.get("official_ref"),
                network=way.tags.get("network"),
            ))
            if not keys:
                return
            try:
                line = [[node.location.lat, node.location.lon] for node in way.nodes if node.location.valid()]
            except osmium.InvalidLocationError:
                return
            if len(line) < 2:
                return
            for key in keys:
                roads[key].append(line)

    WayHandler().apply_file(str(input_path), locations=True, idx="flex_mem")

    output_path.mkdir(parents=True, exist_ok=True)
    manifest_roads: dict[str, dict] = {}
    total_bytes = 0
    total_points = 0
    total_km = 0.0

    for key in sorted(roads):
        payload = payload_for_road(key, roads[key], tolerance_m)
        relative_path = catalog_path_for_key(key)
        target = output_path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        target.write_bytes(encoded)
        size_bytes = len(encoded)
        total_bytes += size_bytes
        total_points += payload["pointCount"]
        total_km += payload["totalKm"]
        manifest_roads[key] = {
            "path": relative_path,
            "bytes": size_bytes,
            "points": payload["pointCount"],
            "km": payload["totalKm"],
        }

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "catalogSchema": CATALOG_SCHEMA,
        "validationSchema": VALIDATION_SCHEMA,
        "revision": source_date,
        "generatedAt": generated_at,
        "source": "OpenStreetMap data via Geofabrik",
        "sourceDate": source_date,
        "countryCode": "BR",
        "precision": PRECISION,
        "compactToleranceM": tolerance_m,
        "roadCount": len(manifest_roads),
        "totalBytes": total_bytes,
        "totalPoints": total_points,
        "totalKm": round(total_km, 3),
        "roads": manifest_roads,
    }
    (output_path / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-date", required=True)
    parser.add_argument("--tolerance-m", type=float, default=DEFAULT_TOLERANCE_M)
    args = parser.parse_args()
    manifest = build_catalog(args.input, args.output, args.source_date, args.tolerance_m)
    print(json.dumps({
        "roadCount": manifest["roadCount"],
        "totalBytes": manifest["totalBytes"],
        "totalPoints": manifest["totalPoints"],
        "totalKm": manifest["totalKm"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
