"""Add metric_values.estimate_kind and backfill it (item 638, adr-021).

WHY: `estimated` is one boolean that answers two unrelated questions, so the UI
could only ever tell one of the two stories — and told the wrong one to 60 rows.

  district estimated=1  ->  the value was INHERITED from a donor district that
                            existed when the survey ran (fill_new_districts.py).
                            Donor recorded in district_estimate_source (adr-020).
  state    estimated=1  ->  the RBI fiscal year is a Budget Estimate or Revised
                            Estimate rather than an Actual (ingest_rbi_fiscal.py,
                            ESTIMATE_TAG). Nothing is inherited; there is no donor.

right-rail.tsx told all 60 state rows "Inherited from the parent district — this
district formed after the source's survey". Every clause of that is false for
them. Rewording alone would only make a false sentence read better, so the fix is
to record what each writer actually did.

A third kind exists in code (adr-021 widening): ingest_pca.py aggregates a whole
state's real rows into a single geojson district feature and flags it estimated=1.
That is an exact aggregate, neither inherited nor projected. It does not survive
the current pipeline (reaggregate.py overwrites it, fill_new_districts.py:74
deletes the rest — all 1494 surviving district estimates carry a citation, which
only fill_new_districts writes), but it is a live writer and must state its kind.

BACKFILL IS DERIVED, NOT ASSUMED. Each row's kind is established by evidence:
  - a citation in district_estimate_source proves fill_new_districts wrote it
  - the two RBI metrics written with use_est=True prove ingest_rbi_fiscal wrote it
Any estimated=1 row matching neither is left NULL and fails the assert below,
rather than being guessed into a bucket. Guessing is the bug this file removes.

Idempotent: safe to re-run; re-derives every kind from the same evidence.

Run: pipeline/.venv/bin/python pipeline/migrate_estimate_kind.py
"""
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# MOB_DB lets this run against a snapshot copy first — the live file is never the
# place to find out a backfill was wrong.
DB = os.environ.get("MOB_DB") or os.path.join(ROOT, "data", "mapsofbharat.db")

# The two metrics ingest_rbi_fiscal.py writes with use_est=True — i.e. the only
# writers of a state-level estimate. econ_percapita_nsdp_rbi (NSO figures) and
# outstanding_debt_pct_gsdp (provisional but not BE/RE tagged) pass use_est=False
# and so never produce an estimated=1 row.
RBI_PROJECTED_METRICS = ("fiscal_deficit_pct_gsdp", "own_tax_pct_gsdp")


def main():
    con = sqlite3.connect(DB)

    cols = {r[1] for r in con.execute("PRAGMA table_info(metric_values)")}
    if "estimate_kind" not in cols:
        con.execute("ALTER TABLE metric_values ADD COLUMN estimate_kind TEXT")
        print("added column metric_values.estimate_kind")
    else:
        print("column metric_values.estimate_kind already present — re-deriving")

    # estimated=0 rows never carry a kind. Clear first so a re-run cannot leave a
    # stale kind on a row that has since become real.
    con.execute("UPDATE metric_values SET estimate_kind = NULL WHERE estimated = 0")

    # 1. inherited — proven by the presence of the donor citation that
    #    fill_new_districts.py wrote in the same loop as the value (adr-020).
    inherited = con.execute(
        """UPDATE metric_values SET estimate_kind = 'inherited'
           WHERE estimated = 1 AND region_level = 'district' AND EXISTS (
             SELECT 1 FROM district_estimate_source s
             WHERE s.region_code = metric_values.region_code
               AND s.metric_id = metric_values.metric_id
               AND s.year = metric_values.year)"""
    ).rowcount

    # 2. projected — the RBI BE/RE state rows.
    qs = ",".join("?" * len(RBI_PROJECTED_METRICS))
    projected = con.execute(
        f"""UPDATE metric_values SET estimate_kind = 'projected'
            WHERE estimated = 1 AND region_level = 'state'
              AND metric_id IN ({qs})""",
        RBI_PROJECTED_METRICS,
    ).rowcount

    con.commit()

    unclassified = con.execute(
        "SELECT region_level, metric_id, COUNT(*) FROM metric_values "
        "WHERE estimated = 1 AND estimate_kind IS NULL GROUP BY 1, 2"
    ).fetchall()
    leaked = con.execute(
        "SELECT COUNT(*) FROM metric_values WHERE estimated = 0 AND estimate_kind IS NOT NULL"
    ).fetchone()[0]
    by_kind = con.execute(
        "SELECT region_level, estimate_kind, COUNT(*) FROM metric_values "
        "WHERE estimated = 1 GROUP BY 1, 2 ORDER BY 1, 2"
    ).fetchall()
    con.close()

    print(f"backfilled: inherited={inherited} projected={projected}")
    for lvl, kind, n in by_kind:
        print(f"  {lvl:9s} {str(kind):11s} {n}")

    # Vacuous-pass guard: on an empty or unloaded metric_values every assert below
    # would pass while classifying nothing at all.
    assert inherited + projected > 0, (
        "no rows classified — metric_values empty or pipeline not run; "
        "the checks below would pass vacuously"
    )
    assert not unclassified, (
        f"{sum(n for *_, n in unclassified)} estimated rows could not be derived "
        f"from evidence and were NOT guessed: {unclassified}"
    )
    print("OK — every estimated row states which kind of estimate it is")
    assert leaked == 0, f"{leaked} real (estimated=0) rows carry an estimate_kind"
    print("OK — no real value claims to be an estimate")


if __name__ == "__main__":
    main()
