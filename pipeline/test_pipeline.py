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
    # union coverage across all verticals; census alone is 688 after the
    # source-coverage gate withheld 45 districts in 5 SHRUG-undercovered states
    assert _coverage(con) >= 680


def test_each_metric_covers_expected_districts(con):
    # per-metric coverage varies by vertical (census 688, NCRB ~650, NFHS
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
