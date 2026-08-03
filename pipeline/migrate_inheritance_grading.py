"""Grade every inherited estimate and flag the shaky ones (item 812, adr-026).

WHY: adr-018 fills a post-2011 district from its largest-population 2011 sibling,
and adr-019/020/021 disclose every such inheritance identically ("est."). But an
inheritance is only as good as the child's resemblance to its donor, and the map
cannot say which are weak. Item 218's audit (research/218-inheritance-audit.md)
measured all 115 child/donor pairs and found the honest signal is
**risk = divergence x reach**, applied as a two-floor GATE, not a raw product:

    SHAKY  iff  divergence >= 1.0  AND  reach >= 1,000,000 people

  - divergence = robust-z MAX distance over urban_pct, female_literacy_rate and
    log(pop_density): each axis's child-vs-donor delta divided by that axis's
    NATIONAL IQR (so a delta reads as "IQR-multiples of the national spread"),
    then the MAX across the three axes.
  - reach = the child's pop_total (a real count, never inherited).

This backfill ADDS two columns to district_estimate_source — `divergence` (real)
and `shaky` (0/1) — and derives them from the real values already in the store.
It is DISCLOSURE-ONLY: it never touches a value, a rank or a statistic (inherited
estimates are already rank-less and stats-excluded, adr-022/023).

The gate reproduces the audit exactly on the shipped data: **12 shaky pairs**,
with NTR<-Krishna IN and Shi Yomi<-West Siang / Purba Bardhaman<-Paschim Bardhaman
OUT. The asserts below fail loudly if a future data change moves that set, rather
than shipping a miscalibrated flag.

Idempotent: re-run recomputes divergence/shaky from the same evidence. A fresh
`fill_new_districts.py` rebuild writes the same two columns in its CREATE TABLE, so
this migration is only needed to grade an ALREADY-BUILT store without re-ingesting.

Run: pipeline/.venv/bin/python pipeline/migrate_inheritance_grading.py
     MOB_DB=/tmp/copy.db pipeline/.venv/bin/python pipeline/migrate_inheritance_grading.py
"""
import math
import os
import sqlite3
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# MOB_DB lets this run against a snapshot copy first — the live file is never the
# place to find out a backfill was wrong (same convention as migrate_estimate_kind).
DB = os.environ.get("MOB_DB") or os.path.join(ROOT, "data", "mapsofbharat.db")

# The gate (adr-026), from item 218's calibration audit. Kept as named constants so
# fill_new_districts.py and this migration state the same rule in the same terms.
GATE_DIVERGENCE = 1.0
GATE_REACH = 1_000_000

# The three structural axes the divergence is measured over, and the anchor pairs
# the audit fixed the calibration against.
AXES = ("urban_pct", "female_literacy_rate", "pop_density")
NTR, KRISHNA = "37_749", "37_510"
SHI_YOMI, WEST_SIANG = "12_785", "12_250"
PURBA, PASCHIM = "19_335", "19_777"


def national_iqr(con, metric_id, logscale=False):
    """Robust-z denominator: IQR of a metric's REAL district values nationally."""
    vals = [v for (v,) in con.execute(
        "SELECT value FROM metric_values WHERE metric_id=? AND region_level='district' "
        "AND estimated=0 AND value IS NOT NULL", (metric_id,)) if v is not None]
    if logscale:
        vals = [math.log(v) for v in vals if v > 0]
    q1, _med, q3 = statistics.quantiles(vals, n=4)   # exclusive method — matches the audit
    return q3 - q1


def real_values(con, metric_id):
    return {rc: v for rc, v in con.execute(
        "SELECT region_code, value FROM metric_values WHERE metric_id=? "
        "AND region_level='district' AND estimated=0 AND value IS NOT NULL", (metric_id,))}


def main():
    con = sqlite3.connect(DB)

    # 1. add the two grading columns if absent (idempotent).
    cols = {r[1] for r in con.execute("PRAGMA table_info(district_estimate_source)")}
    if "divergence" not in cols:
        con.execute("ALTER TABLE district_estimate_source ADD COLUMN divergence REAL")
        print("added column district_estimate_source.divergence")
    if "shaky" not in cols:
        con.execute("ALTER TABLE district_estimate_source ADD COLUMN shaky INTEGER")
        print("added column district_estimate_source.shaky")

    # 2. national spreads (robust-z denominators) + per-district real axis values.
    iqr = {
        "urban_pct": national_iqr(con, "urban_pct"),
        "female_literacy_rate": national_iqr(con, "female_literacy_rate"),
        "pop_density": national_iqr(con, "pop_density", logscale=True),
    }
    urban = real_values(con, "urban_pct")
    flit = real_values(con, "female_literacy_rate")
    dens = real_values(con, "pop_density")
    pop = real_values(con, "pop_total")
    print(f"IQR urban={iqr['urban_pct']:.3f} flit={iqr['female_literacy_rate']:.3f} "
          f"log-density={iqr['pop_density']:.4f}")

    def divergence(child, donor):
        parts = []
        if child in urban and donor in urban:
            parts.append(abs(urban[child] - urban[donor]) / iqr["urban_pct"])
        if child in flit and donor in flit:
            parts.append(abs(flit[child] - flit[donor]) / iqr["female_literacy_rate"])
        if child in dens and donor in dens and dens[child] > 0 and dens[donor] > 0:
            parts.append(abs(math.log(dens[child]) - math.log(dens[donor])) / iqr["pop_density"])
        return max(parts) if parts else 0.0

    # 3. grade every distinct (child, donor) pair, then stamp all its rows.
    pairs = {(rc, sc) for rc, sc in con.execute(
        "SELECT DISTINCT region_code, source_code FROM district_estimate_source")}
    shaky_pairs = set()
    for child, donor in pairs:
        div = divergence(child, donor)
        shaky = 1 if (div >= GATE_DIVERGENCE and pop.get(child, 0.0) >= GATE_REACH) else 0
        if shaky:
            shaky_pairs.add((child, donor))
        con.execute("UPDATE district_estimate_source SET divergence=?, shaky=? "
                    "WHERE region_code=? AND source_code=?", (div, shaky, child, donor))
    con.commit()

    # 4. report + verify the gate reproduces the audit's 12 shaky pairs.
    name = dict(con.execute("SELECT code, name FROM region_keys WHERE level='district'"))
    shaky_rows = con.execute("SELECT COUNT(*) FROM district_estimate_source WHERE shaky=1").fetchone()[0]
    ntr = con.execute("SELECT shaky, divergence FROM district_estimate_source "
                      "WHERE region_code=? AND source_code=? LIMIT 1", (NTR, KRISHNA)).fetchone()
    shi = con.execute("SELECT shaky, divergence FROM district_estimate_source "
                      "WHERE region_code=? AND source_code=? LIMIT 1", (SHI_YOMI, WEST_SIANG)).fetchone()
    pur = con.execute("SELECT shaky, divergence FROM district_estimate_source "
                      "WHERE region_code=? AND source_code=? LIMIT 1", (PURBA, PASCHIM)).fetchone()

    print(f"pairs graded: {len(pairs)}; shaky pairs: {len(shaky_pairs)}; "
          f"shaky citation rows: {shaky_rows}")
    print("shaky set:")
    for child, donor in sorted(shaky_pairs, key=lambda p: name.get(p[0], p[0])):
        div = divergence(child, donor)
        print(f"  {name.get(child, child):<24} <- {name.get(donor, donor):<20} "
              f"div={div:.2f} reach={pop.get(child, 0.0):,.0f}")
    print(f"anchors: NTR<-Krishna shaky={ntr and ntr[0]} (div {ntr and round(ntr[1],2)}); "
          f"ShiYomi<-WestSiang shaky={shi and shi[0]} (div {shi and round(shi[1],2)}); "
          f"PurbaBardhaman<-Paschim shaky={pur and pur[0]} (div {pur and round(pur[1],2)})")
    con.close()

    # Vacuous-pass guard + the audit's exact expectations. Fail loudly rather than
    # ship a miscalibrated flag if the data ever moves the shaky set.
    assert len(pairs) > 0, "no citation pairs — pipeline not run; the checks below would pass vacuously"
    assert len(shaky_pairs) == 12, f"expected 12 shaky pairs (item 218 audit), got {len(shaky_pairs)}"
    assert ntr and ntr[0] == 1, "NTR<-Krishna must be shaky (div>=1.0 AND reach>=1M)"
    assert shi and shi[0] == 0, "Shi Yomi<-West Siang must NOT be shaky (reach 13k < 1M)"
    assert pur and pur[0] == 0, "Purba Bardhaman<-Paschim must NOT be shaky (div<1.0, similar donor)"
    print("OK — gate flags exactly the 12 shaky pairs; NTR in; Shi Yomi + Purba Bardhaman out")


if __name__ == "__main__":
    main()
