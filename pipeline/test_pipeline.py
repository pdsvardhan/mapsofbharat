"""Pipeline / canonical-store integrity tests (risk no-tests / #52).

Run: pytest -q pipeline/test_pipeline.py
The DB is gitignored, so these self-skip when it isn't present (e.g. fresh CI
checkout) and run wherever the data volume exists (server, local build).
"""
import os
import sqlite3

import pytest

DB = os.path.join(os.path.dirname(__file__), "..", "data", "mapsofbharat.db")


@pytest.fixture(scope="module")
def con():
    if not os.path.exists(DB):
        pytest.skip(f"canonical DB not built: {DB}")
    c = sqlite3.connect(DB)
    yield c
    c.close()


def _coverage(con):
    return con.execute(
        "SELECT COUNT(DISTINCT region_code) FROM metric_values WHERE region_level='district'"
    ).fetchone()[0]


def test_core_tables_exist(con):
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"metrics", "metric_values"} <= names


def test_metrics_present(con):
    assert con.execute("SELECT COUNT(*) FROM metrics").fetchone()[0] > 0


def test_no_orphan_values(con):
    orphans = con.execute(
        "SELECT COUNT(*) FROM metric_values v "
        "LEFT JOIN metrics m ON m.id = v.metric_id WHERE m.id IS NULL"
    ).fetchone()[0]
    assert orphans == 0


def test_no_empty_region_codes(con):
    n = con.execute(
        "SELECT COUNT(*) FROM metric_values WHERE region_code IS NULL OR region_code = ''"
    ).fetchone()[0]
    assert n == 0


def test_district_coverage_is_broad(con):
    # union coverage across all verticals; census now covers 733 districts after
    # the bug #18 fix (official sub-district source, no withholding)
    assert _coverage(con) >= 680


def test_each_metric_covers_expected_districts(con):
    # per-metric coverage varies by vertical (census 733, NCRB ~685, NFHS
    # 410-671, economy 0 district rows) — compare against the committed
    # expectations baseline rather than the global union
    import json
    exp_path = os.path.join(os.path.dirname(__file__), "expectations.json")
    if not os.path.exists(exp_path):
        pytest.skip("expectations.json not present")
    expected = json.load(open(exp_path))["per_metric_district_count"]
    rows = dict(con.execute(
        "SELECT metric_id, COUNT(DISTINCT region_code) FROM metric_values "
        "WHERE region_level='district' AND value IS NOT NULL GROUP BY metric_id"
    ).fetchall())
    assert rows, "no district-level values found"
    for metric_id, want in expected.items():
        got = rows.get(metric_id, 0)
        assert abs(got - want) <= max(2, want * 0.02), \
            f"metric {metric_id}: {got} districts vs expected {want}"


def test_values_are_finite(con):
    bad = con.execute(
        "SELECT COUNT(*) FROM metric_values WHERE value IS NOT NULL AND value != value"
    ).fetchone()[0]  # NaN != NaN
    assert bad == 0


def test_boundaries_are_survey_of_india_compliant():
    """SoI compliance (iter-15 item 169): J&K incl. PoK, Ladakh incl. Aksai
    Chin, Arunachal Pradesh present as an Indian state."""
    import json
    geo_dir = os.path.join(os.path.dirname(__file__), "..", "public", "geo")
    states = json.load(open(os.path.join(geo_dir, "states.geojson")))["features"]
    by_name = {f["properties"]["st_nm"]: f for f in states}
    assert "Arunachal Pradesh" in by_name
    assert "Jammu and Kashmir" in by_name and "Ladakh" in by_name

    def _bbox(geom):
        xs, ys = [], []
        def walk(c):
            if isinstance(c[0], (int, float)):
                xs.append(c[0]); ys.append(c[1])
            else:
                for x in c: walk(x)
        walk(geom["coordinates"])
        return min(xs), min(ys), max(xs), max(ys)

    # Ladakh polygon must extend past 79.5E (Aksai Chin) and 36N (Gilgit side)
    lx0, ly0, lx1, ly1 = _bbox(by_name["Ladakh"]["geometry"])
    assert lx1 > 79.5 and ly1 > 36, f"Ladakh bbox {lx0,ly0,lx1,ly1} excludes Aksai Chin"
    # J&K must extend west past 74E (Mirpur/Muzaffarabad side)
    jx0, jy0, jx1, jy1 = _bbox(by_name["Jammu and Kashmir"]["geometry"])
    assert jx0 < 74, f"J&K bbox starts at {jx0} — PoK missing"
    # PoK district polygons exist in the district file
    districts = json.load(open(os.path.join(geo_dir, "districts.geojson")))["features"]
    rids = {f["properties"].get("rid") for f in districts}
    assert {"01_991", "01_992"} <= rids, "PoK districts (Mirpur/Muzaffarabad) missing"
