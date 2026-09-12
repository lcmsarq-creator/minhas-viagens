import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_road_catalog.py"
SPEC = importlib.util.spec_from_file_location("build_road_catalog", MODULE_PATH)
catalog = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(catalog)

try:
    import osmium  # noqa: F401
except ImportError:
    osmium = None


def decode_polyline(encoded, precision=5):
    factor = 10**precision
    index = latitude = longitude = 0
    points = []
    while index < len(encoded):
        values = []
        for _ in range(2):
            result = shift = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            values.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += values[0]
        longitude += values[1]
        points.append([latitude / factor, longitude / factor])
    return points


class RoadCatalogTests(unittest.TestCase):
    def test_extracts_standard_and_secondary_references(self):
        self.assertEqual(
            catalog.canonical_keys("BR-153; SP 425, AMG-1010"),
            {"BR|BR|153", "BR|SP|425", "BR|AMG|1010"},
        )

    def test_uses_network_for_bare_relation_number(self):
        self.assertEqual(catalog.canonical_keys("425", network="BR:SP"), {"BR|SP|425"})
        self.assertEqual(catalog.canonical_keys("153", network="BR"), {"BR|BR|153"})

    def test_catalog_path_matches_browser_convention(self):
        self.assertEqual(catalog.catalog_path_for_key("BR|SP|425"), "br/sp/425.json")
        self.assertEqual(catalog.catalog_path_for_key("BR|SPA|075/300"), "br/spa/075-300.json")

    def test_polyline_round_trip(self):
        points = [[-20.81234, -49.37991], [-20.70001, -49.21002], [-20.50111, -49.00123]]
        decoded = decode_polyline(catalog.encode_polyline(points))
        for expected, actual in zip(points, decoded):
            self.assertAlmostEqual(expected[0], actual[0], places=5)
            self.assertAlmostEqual(expected[1], actual[1], places=5)

    def test_payload_is_compact_and_validated(self):
        line = [[-20.0, -49.0], [-20.00001, -49.00001], [-20.1, -49.1]]
        payload = catalog.payload_for_road("BR|SP|425", [line], 25)
        self.assertEqual(payload["validationSchema"], catalog.VALIDATION_SCHEMA)
        self.assertFalse(payload["partial"])
        self.assertGreater(payload["totalKm"], 0)
        self.assertTrue(payload["encodedLines"])
        json.dumps(payload)

    @unittest.skipUnless(osmium, "pyosmium is only required by the catalog build")
    def test_builds_catalog_from_osm_relation_and_way_references(self):
        fixture = Path(__file__).parent / "fixtures" / "road-catalog.osm"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog"
            manifest = catalog.build_catalog(fixture, output, "2026-09-12", 25)
            self.assertEqual(set(manifest["roads"]), {"BR|SP|270", "BR|SP|425"})
            self.assertEqual(manifest["roadCount"], 2)
            for item in manifest["roads"].values():
                self.assertTrue((output / item["path"]).is_file())


if __name__ == "__main__":
    unittest.main()
