#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://download.geonames.org/export/dump"
OUT = Path("city-catalog/v1")
COUNTRIES = {
    "AR": {"file": "ar.json", "name": "Argentina"},
    "UY": {"file": "uy.json", "name": "Uruguay"},
}

# Núcleos/localidades habitadas. Exclui PPLX (seções/bairros), PPLH/PPLQ/PPLW
# (históricas, abandonadas ou destruídas) e capitais históricas.
ACCEPTED_CODES = {
    "PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC",
    "PPLF", "PPLL", "PPLR", "PPLS", "PPLG",
}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "minhas-viagens-catalog/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def fetch_text(url: str) -> str:
    return fetch_bytes(url).decode("utf-8")


def admin1_names() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for line in fetch_text(f"{BASE}/admin1CodesASCII.txt").splitlines():
        cols = line.split("\t")
        if len(cols) >= 2:
            mapping[cols[0]] = cols[1]
    return mapping


def compact_number(value: str):
    number = float(value)
    rounded = round(number, 5)
    return int(rounded) if rounded.is_integer() else rounded


def build_country(code: str, admin1: dict[str, str]) -> dict:
    archive = fetch_bytes(f"{BASE}/{code}.zip")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        txt_name = next(name for name in zf.namelist() if name.upper().endswith(f"{code}.TXT"))
        text = zf.read(txt_name).decode("utf-8")

    rows = []
    for line in text.splitlines():
        cols = line.split("\t")
        if len(cols) < 19:
            continue
        geoname_id, name, _ascii, _alts, lat, lng, feature_class, feature_code, country = cols[:9]
        admin_code = cols[10]
        population = cols[14]
        if country != code or feature_class != "P" or feature_code not in ACCEPTED_CODES:
            continue
        try:
            pop = int(population or 0)
            lat_value = compact_number(lat)
            lng_value = compact_number(lng)
        except ValueError:
            continue
        region = admin1.get(f"{code}.{admin_code}", "")
        # Array compacto: id, nome, lat, lng, região, população, featureCode.
        rows.append([int(geoname_id), name, lat_value, lng_value, region, pop, feature_code])

    rows.sort(key=lambda row: (str(row[4]), str(row[1]).casefold(), row[0]))
    return {
        "schema": "mv-city-catalog-v1",
        "countryCode": code,
        "country": COUNTRIES[code]["name"],
        "license": "CC BY 4.0",
        "source": "GeoNames",
        "sourceUrl": "https://www.geonames.org/",
        "fields": ["id", "name", "lat", "lng", "region", "population", "featureCode"],
        "count": len(rows),
        "places": rows,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    admin1 = admin1_names()
    manifest = {
        "schema": "mv-city-catalog-manifest-v1",
        "license": "CC BY 4.0",
        "source": "GeoNames",
        "countries": {},
    }

    for code, meta in COUNTRIES.items():
        payload = build_country(code, admin1)
        path = OUT / meta["file"]
        content = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
        path.write_text(content, encoding="utf-8")
        manifest["countries"][code] = {
            "path": str(path).replace("\\", "/"),
            "count": payload["count"],
            "bytes": len(content.encode("utf-8")),
        }
        print(f"{code}: {payload['count']} localidades, {manifest['countries'][code]['bytes']} bytes")

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (OUT / "ATTRIBUTION.md").write_text(
        "# City catalog attribution\n\n"
        "Argentina and Uruguay place data are derived from GeoNames (https://www.geonames.org/), "
        "licensed under Creative Commons Attribution 4.0 (CC BY 4.0).\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
