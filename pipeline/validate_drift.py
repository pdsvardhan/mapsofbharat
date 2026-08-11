#!/usr/bin/env python3
"""Scheduled drift / integrity re-validation for the canonical store.

Risk: data-drift-undetected (#50). The ingestion pipeline already refuses to
write on a >2% median diff; this is the *standing* guard that re-checks the
live DB against committed expectations and exits non-zero (so a cron wrapper
can notify) when something has drifted.

Usage:
    python3 pipeline/validate_drift.py [--db data/mapsofbharat.db]
                                       [--expectations pipeline/expectations.json]

Exit codes: 0 = OK, 1 = drift/anomaly detected, 2 = setup error.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

from region_match import ORPHAN_CITATION_SQL

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "data", "mapsofbharat.db")
DEFAULT_EXP = os.path.join(os.path.dirname(__file__), "expectations.json")


def load_expectations(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--expectations", default=DEFAULT_EXP)
    ap.add_argument("--tolerance", type=float, default=0.02, help="fractional drift tolerance")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        print(f"validate_drift: DB not found: {args.db}", file=sys.stderr)
        return 2

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    problems: list[str] = []

    # --- structural invariants (always enforced) -------------------------
    metric_count = con.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]
    null_codes = con.execute(
        "SELECT COUNT(*) FROM metric_values WHERE region_code IS NULL OR region_code = ''"
    ).fetchone()[0]
    null_values = con.execute(
        "SELECT COUNT(*) FROM metric_values WHERE value IS NULL"
    ).fetchone()[0]
    coverage = con.execute(
        "SELECT COUNT(DISTINCT region_code) FROM metric_values WHERE region_level='district'"
    ).fetchone()[0]

    # Inherited-estimate integrity (ADR-018). Every citation in
    # district_estimate_source must still explain a live estimated=1 row. Re-running
    # ONE adapter deletes the inherited rows inside its (metric, level, year) scope
    # and strands their citations, greying out post-2011 districts until
    # fill_new_districts.py re-runs. This is checked STRUCTURALLY, not as drift,
    # because the per-metric drift test below cannot see it: dropping all 14
    # inherited rows from a 706-district metric is 1.98% drift — under the 2%
    # tolerance, so a damaged store reported OK (measured 2026-08-11).
    try:
        orphan_citations = con.execute(ORPHAN_CITATION_SQL).fetchone()[0]
    except sqlite3.OperationalError:
        orphan_citations = 0    # no citation table: fill_new_districts.py never ran

    # Run-ordering (ADR-018). The orphan check above catches inherited rows DELETED
    # after a fill. It cannot see a metric that was never filled at all — no citation
    # existed to strand — which is how 23 MGNREGA values went missing (ingest_mgnrega.py
    # loaded 2026-07-18, the fill never followed). So also compare load_log timestamps:
    # fill_new_districts.py must be the last data pass. Re-running it is idempotent and
    # harmless even when the adapter in question writes nothing inheritable.
    try:
        last_fill = con.execute(
            "SELECT MAX(loaded_at) FROM load_log WHERE adapter = 'fill_new_districts.py'"
        ).fetchone()[0]
        stale_adapters = [
            r[0] for r in con.execute(
                "SELECT DISTINCT adapter FROM load_log WHERE adapter LIKE 'ingest\\_%' "
                "ESCAPE '\\' AND adapter NOT LIKE '%(skipped)%' AND loaded_at > ? "
                "ORDER BY adapter", (last_fill,))
        ] if last_fill else []
    except sqlite3.OperationalError:
        last_fill, stale_adapters = None, []

    if metric_count == 0:
        problems.append("no metrics in DB")
    if stale_adapters:
        problems.append(
            f"{len(stale_adapters)} adapter(s) loaded after the last inheritance pass "
            f"({', '.join(stale_adapters)}) — their post-2011 districts may be grey; "
            "re-run pipeline/fill_new_districts.py"
        )
    if orphan_citations:
        problems.append(
            f"{orphan_citations} inherited-estimate citations explain no value — an "
            "adapter re-run dropped inherited rows (ADR-018); "
            "re-run pipeline/fill_new_districts.py"
        )
    if null_codes:
        problems.append(f"{null_codes} metric_values rows with empty region_code")
    if null_values:
        problems.append(f"{null_values} metric_values rows with NULL value")

    # per-metric district counts
    per_metric = {
        r["metric_id"]: r["n"]
        for r in con.execute(
            "SELECT metric_id, COUNT(*) AS n FROM metric_values "
            "WHERE region_level='district' GROUP BY metric_id"
        )
    }

    # --- drift vs committed expectations (if present) --------------------
    exp = load_expectations(args.expectations)
    if exp:
        tol = args.tolerance

        def drifted(actual: float, expected: float) -> bool:
            if expected == 0:
                return actual != 0
            return abs(actual - expected) / expected > tol

        if "metric_count" in exp and exp["metric_count"] != metric_count:
            problems.append(f"metric_count {metric_count} != expected {exp['metric_count']}")
        if "district_coverage" in exp and drifted(coverage, exp["district_coverage"]):
            problems.append(
                f"district_coverage {coverage} drifted >|{tol:.0%}| from {exp['district_coverage']}"
            )
        for mid, expected_n in (exp.get("per_metric_district_count") or {}).items():
            actual_n = per_metric.get(mid, 0)
            if drifted(actual_n, expected_n):
                problems.append(f"metric '{mid}' count {actual_n} drifted from {expected_n}")
    else:
        print(
            f"validate_drift: no expectations file at {args.expectations} — "
            "structural checks only. Write one to enable drift detection.",
            file=sys.stderr,
        )

    con.close()

    print(
        json.dumps(
            {
                "metric_count": metric_count,
                "district_coverage": coverage,
                "null_region_codes": null_codes,
                "null_values": null_values,
                "orphan_citations": orphan_citations,
                "last_inheritance_pass": last_fill,
            }
        )
    )

    if problems:
        print("DRIFT/ANOMALY DETECTED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("validate_drift: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
