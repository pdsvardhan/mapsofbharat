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

    if metric_count == 0:
        problems.append("no metrics in DB")
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
