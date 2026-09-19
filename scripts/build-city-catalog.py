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
MIN_POPULATION = 1000
COUNTRIES = {
    "AR": {"file": "ar.json", "name": "Argentina"},
    "UY": {"file": "uy.json", "name": "Uruguai"},
    "PY": {"file": "py.json", "name": "Paraguai"},
    "PE": {"file": "pe.json", "name": "Peru"},
    "BO": {"file": "bo.json", "name": "Bolívia"},
    "CL": {"file": "cl.json", "name": "Chile"},
    "CO": {"file": "co.json", "name": "Colômbia"},
    "VE": {"file": "ve.json", "name": "Venezuela"},
    "EC": {"file": "ec.json", "name": "Equador"},
    "GY": {"file": "gy.json", "name": "Guiana"},
    "SR": {"file": "sr.json", "name": "Suriname"},
    "GF": {"file": "gf.json", "name": "Guiana Francesa"},
    "PA": {"file": "pa.json", "name": "Panamá"},
    "CR": {"file": "cr.json", "name": "Costa Rica"},
    "HN": {"file": "hn.json", "name": "Honduras"},
    "SV": {"file": "sv.json", "name": "El Salvador"},
    "GT": {"file": "gt.json", "name": "Guatemala"},
    "BZ": {"file": "bz.json", "name": "Belize"},
    "MX": {"file": "mx.json", "name": "México"},
    "US": {"file": "us.json", "name": "Estados Unidos"},
    "CA": {"file": "ca.json", "name": "Canadá"},
}

# Para "Cidades Cruzadas" não queremos todo topônimo habitado do GeoNames.
# Mantemos sedes administrativas relevantes mesmo sem população cadastrada e,
# entre localidades comuns, apenas PPL/PPLS com população acima de 1.000.
# Isso segue a ideia do filtro cities1000, mas evita PPLL, PPLF, PPLR e PPLX,
# que representam localidades muito pequenas/específicas ou partes de cidades.
ADMIN_SEAT_CODES = {"PPLC", "PPLG", "PPLA", "PPLA2", "PPLA3"}
POPULATED_CODES = {"PPL", "PPLS"}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "minhas-viagens-catalog/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
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


def relevant_place(feature_class: str, feature_code: str, population: int) -> bool:
    if feature_class != "P":
        return False
    if feature_code in ADMIN_SEAT_CODES:
        return True
    return feature_code in POPULATED_CODES and population > MIN_POPULATION


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
        if country != code:
            continue
        try:
            pop = int(population or 0)
            lat_value = compact_number(lat)
            lng_value = compact_number(lng)
        except ValueError:
            continue
        if not relevant_place(feature_class, feature_code, pop):
            continue
        region = admin1.get(f"{code}.{admin_code}", "")
        rows.append([int(geoname_id), name, lat_value, lng_value, region, pop, feature_code])

    rows.sort(key=lambda row: (str(row[4]), str(row[1]).casefold(), row[0]))
    return {
        "schema": "mv-city-catalog-v2",
        "countryCode": code,
        "country": COUNTRIES[code]["name"],
        "license": "CC BY 4.0",
        "source": "GeoNames",
        "sourceUrl": "https://www.geonames.org/",
        "filter": {
            "populationGreaterThan": MIN_POPULATION,
            "populatedCodes": sorted(POPULATED_CODES),
            "alwaysIncludeCodes": sorted(ADMIN_SEAT_CODES),
        },
        "fields": ["id", "name", "lat", "lng", "region", "population", "featureCode"],
        "count": len(rows),
        "places": rows,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    admin1 = admin1_names()
    manifest = {
        "schema": "mv-city-catalog-manifest-v2",
        "license": "CC BY 4.0",
        "source": "GeoNames",
        "filter": {
            "populationGreaterThan": MIN_POPULATION,
            "populatedCodes": sorted(POPULATED_CODES),
            "alwaysIncludeCodes": sorted(ADMIN_SEAT_CODES),
        },
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
        print(f"{code}: {payload['count']} cidades/localidades relevantes, {manifest['countries'][code]['bytes']} bytes")

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    countries = ", ".join(meta["name"] for meta in COUNTRIES.values())
    (OUT / "ATTRIBUTION.md").write_text(
        "# City catalog attribution\n\n"
        f"Place data for {countries} are derived from GeoNames (https://www.geonames.org/), "
        "licensed under Creative Commons Attribution 4.0 (CC BY 4.0).\n\n"
        "Runtime catalogs keep administrative seats and populated places above 1,000 inhabitants; "
        "neighbourhoods, tiny localities, farm/religious villages, historical, abandoned and destroyed places are excluded.\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
