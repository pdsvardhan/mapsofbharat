"""Economic Census 2013 (6th EC) via SHRUG -> district non-farm economy vertical (2 metrics).

Source: Economic Census 2013 (6th EC), establishment- and employment-count table,
distributed by SHRUG (Socioeconomic High-resolution Rural-Urban Geographic dataset,
Devarajan / Data Development Lab), Harvard Dataverse doi:10.7910/DVN/DPESAK.
Input file `pipeline/raw-new/economy/shrug_ec13_pc11dist.tab` is keyed by the 2011
Census district (pc11_state_id + pc11_district_id); 640 rows = 640 census-2011 districts.
EC 2013 enumerates all NON-AGRICULTURAL establishments (and their employment); crop
production and plantation are out of scope by design.

Two district-level metrics, category 'economy', year 2013:
  estab_per_1000        establishments per 1,000 population (higher_is_better=1, unit 'per 1000', 1 dp)
  nonfarm_emp_per_1000  EC (non-farm) employment per 1,000 population (higher_is_better=1, 'per 1000', 0 dp)

THE REAGGREGATION (2011-census-district data -> current-day district boundaries)
--------------------------------------------------------------------------------
EC13 is keyed by 2011-Census district; the canonical store is keyed by CURRENT-DAY
rid ("<st>_<dt>"). We reaggregate with a MASS-CONSERVING, population-weighted areal
crosswalk built from the persisted `crosswalk` table (2011-census sub-district ->
current rid, produced geometrically by reaggregate.py):

  1. Partition current districts among their 2011 parents. Each current rid is assigned
     to the SINGLE 2011-census district ("cd" = state+district code) that contributes
     the most of its sub-districts (dominant-parent vote over the crosswalk). The current
     rid's whole 2011 population (pop_total, year 2011) then belongs to that parent, so
     summing current pop by parent reconstitutes each 2011 district's population EXACTLY
     (national sum = 1,210,854,977, the census total, with no double counting).

  2. For a 2011 district that SPLIT into several current districts (it is the dominant
     parent of >1 rid), assign its EC counts to each child rid by that child's share of
     the parent population (density-preserving). Every child ends up with the parent's
     per-1000 RATE -- a documented approximation: rates are stable under boundary splits,
     whereas raw counts cannot be split without sub-district EC detail (which SHRUG's
     district table does not carry).

  3. For a 2011 district that MERGED into an existing current district (it is dominant
     parent of NO rid -- e.g. Delhi's 9 census districts all fall inside the single
     current Delhi district 07_9000; likewise a handful of Mumbai / Chennai / Puducherry
     merges), add its full EC counts to the current rid its sub-districts predominantly
     map to. The absorbing rid therefore SUMS the EC of all 2011 districts inside it.

  4. Each current rid's rate = (sum of EC counts routed to it) / (its pop_total) x 1000.

This handles the AP/Telangana point automatically: EC 2013 predates Telangana (2014), so
old-AP (pc11_state_id 28) sub-districts already carry current st_code 36 (Telangana) or
37 (Andhra Pradesh) in the geometric crosswalk, and route to the correct current rid with
no special-casing. Post-2011 synthetic districts with no 2011 census parent (and the two
uninhabited-in-store PoK rids 01_991 / 01_992, which have no pop denominator) get NO value.

The population denominator is the current-day district `pop_total` (year 2011) already in
metric_values -- the same census population used everywhere else in the store.

Run: pipeline/.venv/bin/python pipeline/ingest_ec13.py
"""
import os, sqlite3
from collections import defaultdict
import pandas as pd
from region_match import upsert_metric, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
TAB = os.path.join(PIPE, "raw-new", "economy", "shrug_ec13_pc11dist.tab")

SOURCE = ("Economic Census 2013 (6th EC), via SHRUG (Devarajan/Data Development Lab), "
          "Harvard Dataverse doi:10.7910/DVN/DPESAK")
URL = "https://doi.org/10.7910/DVN/DPESAK"
LICENSE = "SHRUG open data (CC0 1.0); underlying Economic Census 2013 (c) MoSPI/CSO, GoI"
FETCHED = "2026-07-01T00:00:00Z"       # scout fetch date for the SHRUG EC13 district table

METRIC_IDS = ("estab_per_1000", "nonfarm_emp_per_1000")

METH_COMMON = (
    "Reaggregation from 2011-Census districts onto current-day district boundaries via a "
    "mass-conserving, population-weighted areal crosswalk (the geometric 2011-census "
    "sub-district -> current-district crosswalk persisted by reaggregate.py). Each current "
    "district is partitioned to its dominant 2011 parent so that summing current-day "
    "pop_total (2011) by parent exactly reconstitutes each 2011 district's population "
    "(national sum = the census total 1,210,854,977). Where a 2011 district SPLIT into "
    "several current districts, its EC counts are shared to the children in proportion to "
    "population, so every child inherits the parent's per-1000 rate -- a documented "
    "approximation (rates are stable under boundary splits; raw counts cannot be split "
    "without sub-district EC detail, which the SHRUG district table does not carry). Where "
    "several 2011 districts MERGED into one current district (e.g. Delhi's 9 census "
    "districts within the single current Delhi district), that current district SUMS the "
    "EC counts of all 2011 districts inside it. Old-Andhra-Pradesh districts (2011 state 28) "
    "route to current Andhra Pradesh (37) or Telangana (36) automatically via the geometric "
    "crosswalk (Telangana formed in 2014, after EC 2013). VINTAGE NOTE: EC 2013 establishment "
    "and employment counts are divided by 2011 Census population (a ~2-year vintage gap; the "
    "denominator is the standard census population used across the store). EC 2013 covers "
    "NON-AGRICULTURAL establishments only. Post-2011 synthetic districts with no 2011 parent, "
    "and the two uninhabited-in-store PoK rids, receive no value.")


def build_crosswalk(con):
    """Return (cd_children, cd_absorb_rid, parent_pop, popmap) for the reaggregation.

    cd_children[cd]   : current rids whose DOMINANT 2011 parent is census-district cd (splits)
    cd_absorb_rid[cd] : the current rid that census-district cd's sub-districts predominantly
                        map to (for merged-away cds that are nobody's dominant parent)
    parent_pop[cd]    : sum of current pop_total over cd_children[cd]
    popmap[rid]       : current-day district pop_total (year 2011)
    """
    cw = pd.read_sql("SELECT sd_code, rid FROM crosswalk", con)
    cw["cd"] = cw["sd_code"].str[:5]                      # 2011 state(2)+district(3)
    pop = pd.read_sql(
        "SELECT region_code rid, value pop FROM metric_values "
        "WHERE metric_id='pop_total' AND region_level='district' AND year=2011", con)
    popmap = dict(zip(pop["rid"], pop["pop"]))

    # dominant-parent vote: for each current rid, the cd contributing the most sub-districts
    rid_cd = cw.groupby(["rid", "cd"]).size().reset_index(name="n")
    dominant = (rid_cd.sort_values("n").groupby("rid").tail(1)
                .set_index("rid")["cd"].to_dict())
    cd_children = defaultdict(list)
    for rid, cd in dominant.items():
        cd_children[cd].append(rid)
    parent_pop = {cd: sum(popmap.get(r, 0.0) for r in rids)
                  for cd, rids in cd_children.items()}

    # for merged-away cds: the rid its sub-districts predominantly map to
    cd_absorb_rid = (cw.groupby(["cd", "rid"]).size().reset_index(name="n")
                     .sort_values("n").groupby("cd").tail(1)
                     .set_index("cd")["rid"].to_dict())
    return cd_children, cd_absorb_rid, parent_pop, popmap


def reaggregate(df, cd_children, cd_absorb_rid, parent_pop, popmap):
    """Route each EC13 census-district's counts to current rids.

    Returns (rid_est, rid_emp, stats) where rid_* are {rid: summed EC count} and
    stats records split/merge/dropped counts and coverage for the load-log + report.
    """
    rid_est, rid_emp = defaultdict(float), defaultdict(float)
    n_split = n_merge = n_direct = 0
    dropped = []                                        # (cd, est, emp) with no current home
    ec = df.set_index("cd")[["ec13_count_all", "ec13_emp_all"]].to_dict("index")
    for cd, rec in ec.items():
        est, emp = float(rec["ec13_count_all"]), float(rec["ec13_emp_all"])
        children = cd_children.get(cd)
        pp = parent_pop.get(cd, 0.0)
        if children and pp > 0:
            for r in children:
                w = popmap.get(r, 0.0) / pp
                rid_est[r] += est * w
                rid_emp[r] += emp * w
            if len(children) > 1:
                n_split += 1
            else:
                n_direct += 1
        else:
            r = cd_absorb_rid.get(cd)
            if r is None or popmap.get(r, 0.0) <= 0:
                dropped.append((cd, est, emp))
                continue
            rid_est[r] += est
            rid_emp[r] += emp
            n_merge += 1
    stats = dict(n_split=n_split, n_merge=n_merge, n_direct=n_direct, dropped=dropped)
    return rid_est, rid_emp, stats


def main():
    df = pd.read_csv(TAB, sep="\t",
                     dtype={"pc11_state_id": str, "pc11_district_id": str})
    # 5-digit 2011-census key = state(2) + district(3), zero-padded (assign at once
    # to avoid fragmenting this very wide (~130-col) frame).
    df = df.assign(cd=df["pc11_state_id"].str.zfill(2) + df["pc11_district_id"].str.zfill(3))
    n_ec = len(df)
    file_est = float(df["ec13_count_all"].sum())
    file_emp = float(df["ec13_emp_all"].sum())

    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode=DELETE;")

    cd_children, cd_absorb_rid, parent_pop, popmap = build_crosswalk(con)
    rid_est, rid_emp, stats = reaggregate(df, cd_children, cd_absorb_rid,
                                          parent_pop, popmap)

    # per-rid rates
    estab_rate, emp_rate = {}, {}
    for r in set(list(rid_est) + list(rid_emp)):
        p = popmap.get(r, 0.0)
        if p <= 0:
            continue
        estab_rate[r] = round(rid_est[r] / p * 1000.0, 1)
        emp_rate[r] = round(rid_emp[r] / p * 1000.0, 0)

    # national aggregate (sanity) over rids that received a value
    tot_est = sum(rid_est.values())
    tot_emp = sum(rid_emp.values())
    tot_pop = sum(popmap.get(r, 0.0) for r in rid_est)
    nat_estab = tot_est / tot_pop * 1000.0
    nat_emp = tot_emp / tot_pop * 1000.0

    # ---- idempotent DELETE + upsert metrics + insert values --------------
    qs = ",".join("?" * len(METRIC_IDS))
    con.execute(f"DELETE FROM metric_values WHERE metric_id IN ({qs})", METRIC_IDS)

    upsert_metric(
        con, "estab_per_1000", "Establishments per 1,000 people", "economy",
        "per 1000", 1, 1,
        "Number of non-agricultural establishments per 1,000 population, from the "
        "Economic Census 2013 (6th EC) via SHRUG, reaggregated onto current-day "
        "district boundaries. A density measure of local non-farm enterprise activity "
        "(count of establishments per 1,000 residents).",
        SOURCE, URL, LICENSE, 2013,
        methodology=("estab_per_1000 = EC 2013 total establishments (ec13_count_all) for the "
                     "district's 2011-census parent(s) / current-day population (pop_total, 2011) "
                     "x 1,000. " + METH_COMMON))

    upsert_metric(
        con, "nonfarm_emp_per_1000", "Non-farm employment per 1,000 people", "economy",
        "per 1000", 0, 1,
        "Persons employed in non-agricultural establishments per 1,000 population, from "
        "the Economic Census 2013 (6th EC) via SHRUG, reaggregated onto current-day "
        "district boundaries. A density measure of local non-farm jobs (EC establishment "
        "employment per 1,000 residents; excludes crop agriculture).",
        SOURCE, URL, LICENSE, 2013,
        methodology=("nonfarm_emp_per_1000 = EC 2013 total establishment employment (ec13_emp_all) "
                     "for the district's 2011-census parent(s) / current-day population (pop_total, "
                     "2011) x 1,000. " + METH_COMMON))

    def write(mid, rates):
        n = 0
        for rid, v in rates.items():
            con.execute("INSERT OR REPLACE INTO metric_values VALUES(?,?,?,?,?,?)",
                        (mid, rid, "district", 2013, float(v), 0))
            n += 1
        return n

    n_estab = write("estab_per_1000", estab_rate)
    n_emp = write("nonfarm_emp_per_1000", emp_rate)

    dropped_note = ("; ".join(f"{cd}(est={e:.0f},emp={m:.0f})" for cd, e, m in stats["dropped"])
                    or "none")
    notes = (f"EC 2013 (6th EC) via SHRUG, district non-farm economy (2 metrics, economy, "
             f"district-level, year 2013). EC13 census-2011 districts={n_ec}; routed to current "
             f"rids via mass-conserving pop-weighted crosswalk: splits(1->many)={stats['n_split']}, "
             f"direct(1->1)={stats['n_direct']}, merges(many->1 absorbed)={stats['n_merge']}, "
             f"dropped(no current home)={len(stats['dropped'])} [{dropped_note}]. "
             f"estab_per_1000 rids={n_estab}, nonfarm_emp_per_1000 rids={n_emp} (of 735). "
             f"EC establishments assigned={tot_est:,.0f}/{file_est:,.0f} file; "
             f"employment assigned={tot_emp:,.0f}/{file_emp:,.0f} file. "
             f"National estab_per_1000={nat_estab:.2f}, nonfarm_emp_per_1000={nat_emp:.2f}.")
    log_load(con, "ingest_ec13.py", SOURCE, 2013, LICENSE, FETCHED, n_estab + n_emp, notes)

    con.commit()
    con.close()

    print(f"WROTE estab_per_1000={n_estab} nonfarm_emp_per_1000={n_emp} district values (of 735)")
    print(f"EC13 census-2011 districts read: {n_ec}")
    print(f"  splits(1->many)={stats['n_split']} direct(1->1)={stats['n_direct']} "
          f"merges(many->1)={stats['n_merge']} dropped={len(stats['dropped'])}")
    if stats["dropped"]:
        print(f"  DROPPED cds (no current home): {stats['dropped']}")
    print(f"EC establishments assigned: {tot_est:,.0f} / {file_est:,.0f} in file "
          f"({tot_est/file_est*100:.2f}%)")
    print(f"EC employment assigned:     {tot_emp:,.0f} / {file_emp:,.0f} in file "
          f"({tot_emp/file_emp*100:.2f}%)")
    print(f"NATIONAL estab_per_1000 = {nat_estab:.2f}  (expect ~40-55; file gross "
          f"{file_est/tot_pop*1000:.1f})")
    print(f"NATIONAL nonfarm_emp_per_1000 = {nat_emp:.2f}  (expect ~80-130)")
    if estab_rate:
        print(f"estab_per_1000  range: min={min(estab_rate.values()):.1f} "
              f"max={max(estab_rate.values()):.1f} "
              f"mean={sum(estab_rate.values())/len(estab_rate):.1f}")
    if emp_rate:
        print(f"emp_per_1000    range: min={min(emp_rate.values()):.0f} "
              f"max={max(emp_rate.values()):.0f} "
              f"mean={sum(emp_rate.values())/len(emp_rate):.0f}")


if __name__ == "__main__":
    main()
