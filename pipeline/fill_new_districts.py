"""Fill post-2011 districts that lack survey-vintage data, by sibling inheritance
(item 599).

Many districts were created after 2011 (Andhra Pradesh 13->26, Telangana 10->33,
plus new districts in Arunachal/Manipur/Mizoram/TN/MP). Census metrics already
reach them (reaggregated from sub-districts), but SURVEY-based metrics (NFHS, NITI
MPI poverty, ASER, ...) have no row for a district that did not exist when the
survey was taken. Those districts render grey.

This pass fills them with an ESTIMATE inherited from the district's 2011 lineage
"sibling": the current districts a single 2011 district split into are siblings;
a child that lacks a metric inherits the value of the largest-population sibling
that has it (the retained parent district, which the survey actually covered).
The inherited value is written with estimated=1 and its donor is recorded in
district_estimate_source, keyed (region_code, metric_id, year) — the same key the
fill uses. The donor is per-metric, not per-district: surveys cover different
district sets, so which siblings hold a real value differs by metric. Mancherial
inherits crime from Nirmal and ASER from Adilabad; Nirmal inherits back from
Mancherial for others. Deriving the citation by any single per-district rule
misstates where the number came from (adr-020). This is applied ONLY to INTENSIVE metrics
(percentages, rates, per-capita, densities, indices) — absolute COUNTS
(population, livestock head, crop tonnes, area, GST crore, tourist visits) are
NOT inherited, because a new district does not carry its parent's total.

Idempotent: deletes its own prior district estimated=1 rows first. Run LAST,
after all ingest_*.py and reaggregate.py.

Run: pipeline/.venv/bin/python pipeline/fill_new_districts.py
"""
import collections
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "mapsofbharat.db")

# extensive (absolute-count) units — never inherited
COUNT_UNITS = {"people", "km²", "visits", "tonnes", "hectares", "head", "birds", "₹ crore"}


def main():
    con = sqlite3.connect(DB)

    # 1. lineage: current rid -> dominant 2011-parent district (state2+district3),
    #    voted by number of constituent 2011 sub-districts.
    votes = collections.defaultdict(collections.Counter)
    for sd_code, rid in con.execute("SELECT sd_code, rid FROM crosswalk"):
        votes[rid][sd_code[:5]] += 1
    lineage = {rid: v.most_common(1)[0][0] for rid, v in votes.items()}
    siblings = collections.defaultdict(list)
    for rid, parent in lineage.items():
        siblings[parent].append(rid)
    groups = {p: rs for p, rs in siblings.items() if len(rs) > 1}

    # 2. district populations (for choosing the representative parent sibling)
    pop = dict(con.execute("SELECT region_code, value FROM metric_values "
                           "WHERE metric_id='pop_total' AND region_level='district'"))
    name = dict(con.execute("SELECT code, name FROM region_keys WHERE level='district'"))

    # 3. intensive district-level metrics
    units = dict(con.execute("SELECT id, COALESCE(unit,'') FROM metrics"))
    intensive = {mid for mid, u in units.items() if u not in COUNT_UNITS}

    # 4. real (non-estimated) district values, keyed by (metric, year)
    real = collections.defaultdict(dict)   # (mid, year) -> {rid: value}
    for mid, rc, yr, val in con.execute(
            "SELECT metric_id, region_code, year, value FROM metric_values "
            "WHERE region_level='district' AND estimated=0"):
        if mid in intensive:
            real[(mid, yr)][rc] = val

    # 5. clear our own prior district estimates (state estimates untouched)
    con.execute("DELETE FROM metric_values WHERE region_level='district' AND estimated=1")

    # 6. per sibling group, per (metric, year): fill children from the parent.
    #    source_of is recorded HERE, from the same `src` the fill used, so the
    #    citation cannot drift from the value it explains (adr-020).
    fills = 0
    filled_metrics = collections.Counter()
    source_of = {}   # (child rid, metric, year) -> donor rid that supplied the value
    for (mid, yr), vals in real.items():
        for parent_code, rs in groups.items():
            holders = [r for r in rs if r in vals]
            if not holders:
                continue
            src = max(holders, key=lambda r: pop.get(r, 0.0))   # representative holder
            for r in rs:
                if r not in vals:      # this sibling has no real value for (mid, yr)
                    con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)",
                                (mid, r, "district", yr, vals[src], 1))
                    source_of[(r, mid, yr)] = src
                    fills += 1
                    filled_metrics[mid] += 1

    # 7. persist the donor of every estimate, keyed exactly as the fill was.
    #    Keyed (region, metric, year) — NOT one row per district — because a
    #    district legitimately inherits different metrics from different siblings:
    #    surveys cover different district sets, so the pool of siblings holding a
    #    real value differs per metric. Mancherial takes crime from Nirmal and ASER
    #    from Adilabad, and Nirmal inherits back from Mancherial for other metrics.
    #    A region_code PRIMARY KEY cannot hold that, whatever donor rule is chosen.
    con.execute("DROP TABLE IF EXISTS district_estimate_source")
    con.execute("""CREATE TABLE district_estimate_source (
        region_code TEXT, metric_id TEXT, year INTEGER,
        source_code TEXT, source_name TEXT,
        PRIMARY KEY (region_code, metric_id, year))""")
    for (r, mid, yr), src in source_of.items():
        con.execute("INSERT OR REPLACE INTO district_estimate_source VALUES(?,?,?,?,?)",
                    (r, mid, yr, src, name.get(src, "")))

    con.commit()
    filled_dists = len({r for (r, _mid, _yr) in source_of})
    multi = {r for (r, _m, _y) in source_of
             if len({s for (rr, _mm, _yy), s in source_of.items() if rr == r}) > 1}
    print(f"sibling groups (2011 districts that split): {len(groups)}")
    print(f"estimated fills written: {fills} across {filled_dists} child districts")
    print(f"citations written: {len(source_of)} (one per filled value, keyed region+metric+year)")
    print(f"districts inheriting from >1 donor: {len(multi)} — unrepresentable before adr-020")
    print(f"metrics filled: {len(filled_metrics)}")
    top = filled_metrics.most_common(6)
    print("most-filled metrics:", [(m, n) for m, n in top])
    # sanity invariant: no estimate where a real value already exists
    dup = con.execute("""SELECT COUNT(*) FROM metric_values a
        WHERE a.estimated=1 AND a.region_level='district' AND EXISTS (
          SELECT 1 FROM metric_values b WHERE b.metric_id=a.metric_id
          AND b.region_code=a.region_code AND b.region_level='district'
          AND b.year=a.year AND b.estimated=0)""").fetchone()[0]

    # sanity invariant: every estimate cites the donor that supplied it, and every
    # citation explains a real estimate. These two are the defect adr-020 fixes —
    # the old metric-blind rule left 16 estimates uncited (the panel rendered
    # "estimated from ____") and invented 17 citations for districts that inherit
    # nothing. Nothing detected it because nothing checked.
    uncited = con.execute("""SELECT COUNT(*) FROM metric_values v
        WHERE v.estimated=1 AND v.region_level='district' AND NOT EXISTS (
          SELECT 1 FROM district_estimate_source s WHERE s.region_code=v.region_code
          AND s.metric_id=v.metric_id AND s.year=v.year)""").fetchone()[0]
    orphan = con.execute("""SELECT COUNT(*) FROM district_estimate_source s
        WHERE NOT EXISTS (
          SELECT 1 FROM metric_values v WHERE v.region_code=s.region_code
          AND v.metric_id=s.metric_id AND v.year=s.year
          AND v.region_level='district' AND v.estimated=1)""").fetchone()[0]
    self_cite = con.execute(
        "SELECT COUNT(*) FROM district_estimate_source WHERE region_code = source_code"
    ).fetchone()[0]
    con.close()

    assert dup == 0, f"{dup} estimates collide with a real value"
    print("OK — no estimate overwrites a real value")
    assert uncited == 0, f"{uncited} estimates have no citation (the adr-020 defect)"
    print("OK — every estimate cites the donor that supplied it")
    assert orphan == 0, f"{orphan} citations explain no estimate"
    print("OK — no citation without a matching estimate")
    assert self_cite == 0, f"{self_cite} districts cite themselves"
    print("OK — no district cites itself")


if __name__ == "__main__":
    main()
