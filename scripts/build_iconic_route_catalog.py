#!/usr/bin/env python3
import json
import math
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path("iconic-routes/v1")
OUTPUT = Path("iconic-route-catalog/v1")
SCHEMA = "iconic-route-preview-polyline5-v1"
MANIFEST_SCHEMA = "iconic-route-preview-manifest-v1"
BUNDLE_SCHEMA = "iconic-route-preview-bundle-v1"
PRECISION = 5
TOLERANCE_M = 40.0
MAX_POINTS_PER_LINE = 2200


def decode_polyline(encoded, precision=5):
    factor = 10 ** precision
    points = []
    index = lat = lon = 0
    while index < len(encoded):
        result = shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1

        result = shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lon += ~(result >> 1) if result & 1 else result >> 1
        points.append((lat / factor, lon / factor))
    return points


def encode_value(value):
    value = ~(value << 1) if value < 0 else value << 1
    out = []
    while value >= 0x20:
        out.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    out.append(chr(value + 63))
    return "".join(out)


def encode_polyline(points, precision=5):
    factor = 10 ** precision
    last_lat = last_lon = 0
    out = []
    for lat, lon in points:
        ilat = int(round(lat * factor))
        ilon = int(round(lon * factor))
        out.append(encode_value(ilat - last_lat))
        out.append(encode_value(ilon - last_lon))
        last_lat, last_lon = ilat, ilon
    return "".join(out)


def project(point, lat0):
    lat, lon = point
    return (
        lon * 111320.0 * math.cos(math.radians(lat0)),
        lat * 110540.0,
    )


def point_segment_distance(point, start, end, lat0):
    px, py = project(point, lat0)
    ax, ay = project(start, lat0)
    bx, by = project(end, lat0)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def simplify_rdp(points, tolerance_m=TOLERANCE_M):
    if len(points) <= 2:
        return points
    lat0 = sum(p[0] for p in points) / len(points)
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        max_distance = -1.0
        max_index = None
        for idx in range(start + 1, end):
            distance = point_segment_distance(points[idx], points[start], points[end], lat0)
            if distance > max_distance:
                max_distance = distance
                max_index = idx
        if max_index is not None and max_distance > tolerance_m:
            keep.add(max_index)
            stack.append((start, max_index))
            stack.append((max_index, end))
    return [points[i] for i in sorted(keep)]


def cap_points(points, limit=MAX_POINTS_PER_LINE):
    if len(points) <= limit:
        return points
    last = len(points) - 1
    indices = [round(i * last / (limit - 1)) for i in range(limit)]
    result = []
    previous = None
    for idx in indices:
        if idx != previous:
            result.append(points[idx])
            previous = idx
    if result[-1] != points[-1]:
        result[-1] = points[-1]
    return result


def compact_line(encoded, precision):
    points = decode_polyline(encoded, precision)
    if len(points) <= 2:
        compact = points
    else:
        compact = cap_points(simplify_rdp(points))
    return encode_polyline(compact, PRECISION), len(points), len(compact), compact


def bounds_for(lines):
    points = [p for line in lines for p in line]
    if not points:
        return None
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    return [[min(lats), min(lons)], [max(lats), max(lons)]]


def compact_payload(source_path):
    source = json.loads(source_path.read_text(encoding="utf-8"))
    if source.get("disabled") is True:
        return None
    route_id = str(source.get("id") or source_path.stem)
    precision = int(source.get("precision") or 5)
    encoded_lines = []
    alternate_lines = []
    decoded_for_bounds = []
    source_points = compact_points = 0

    for encoded in source.get("encodedLines", []):
        compact, before, after, decoded = compact_line(encoded, precision)
        encoded_lines.append(compact)
        decoded_for_bounds.append(decoded)
        source_points += before
        compact_points += after

    for encoded in source.get("alternateEncodedLines", []):
        compact, before, after, decoded = compact_line(encoded, precision)
        alternate_lines.append(compact)
        decoded_for_bounds.append(decoded)
        source_points += before
        compact_points += after

    if not encoded_lines:
        raise ValueError(f"{source_path}: sem encodedLines")

    bounds = source.get("bounds") or bounds_for(decoded_for_bounds)
    payload = {
        "kind": "iconic_route_preview_catalog",
        "schema": SCHEMA,
        "id": route_id,
        "precision": PRECISION,
        "encodedLines": encoded_lines,
        "alternateEncodedLines": alternate_lines,
        "bounds": bounds,
        "totalKm": source.get("totalKm"),
        "alternateTotalKm": source.get("alternateTotalKm"),
        "sourceSchema": source.get("schema"),
        "sourcePath": str(source_path).replace("\\", "/"),
        "compactToleranceM": TOLERANCE_M,
        "sourcePointCount": source_points,
        "pointCount": compact_points,
    }
    return payload


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT.glob("*.json"):
        old.unlink()

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    revision = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    manifest_routes = {}
    bundle_routes = {}

    sources = sorted(SOURCE.glob("*.json"))
    if not sources:
        raise SystemExit("Nenhuma geometria icônica encontrada")

    for source_path in sources:
        payload = compact_payload(source_path)
        if payload is None:
            continue
        route_id = payload["id"]
        payload["generatedAt"] = generated_at
        out_path = OUTPUT / f"{route_id}.json"
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        out_path.write_text(text, encoding="utf-8")
        manifest_routes[route_id] = {
            "path": out_path.name,
            "bytes": len(text.encode("utf-8")),
            "points": payload["pointCount"],
            "sourcePoints": payload["sourcePointCount"],
            "km": payload.get("totalKm"),
            "bounds": payload.get("bounds"),
        }
        bundle_routes[route_id] = {
            "precision": payload["precision"],
            "encodedLines": payload["encodedLines"],
            "alternateEncodedLines": payload["alternateEncodedLines"],
            "bounds": payload["bounds"],
            "totalKm": payload.get("totalKm"),
            "alternateTotalKm": payload.get("alternateTotalKm"),
        }

    manifest = {
        "schema": MANIFEST_SCHEMA,
        "catalogSchema": SCHEMA,
        "revision": revision,
        "generatedAt": generated_at,
        "routeCount": len(manifest_routes),
        "compactToleranceM": TOLERANCE_M,
        "maxPointsPerLine": MAX_POINTS_PER_LINE,
        "routes": manifest_routes,
    }
    bundle = {
        "kind": "iconic_route_preview_bundle",
        "schema": BUNDLE_SCHEMA,
        "catalogSchema": SCHEMA,
        "revision": revision,
        "generatedAt": generated_at,
        "routeCount": len(bundle_routes),
        "routes": bundle_routes,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUTPUT / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    bundle_bytes = (OUTPUT / "bundle.json").stat().st_size
    total_source = sum(v["sourcePoints"] for v in manifest_routes.values())
    total_compact = sum(v["points"] for v in manifest_routes.values())
    print(f"Rotas: {len(manifest_routes)}")
    print(f"Pontos: {total_source} -> {total_compact}")
    print(f"Bundle: {bundle_bytes / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
