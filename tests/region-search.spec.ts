import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";

import { searchableRegions, SEARCHABLE_LEVELS } from "@/lib/region-search";

// #563 — the palette must never offer a vintage region.
//
// The bug is LATENT, which is exactly why it needs a test rather than a look at
// production. `region_keys` on the live box holds only `state` and `district`
// today, so /api/regions is clean and nothing looks wrong. Run the documented
// pipeline order and `pipeline/build_vintage_2011.py:229-234` inserts
// `district2011` + `state2011` rows, and from that moment the unfiltered query
// returns two Kerala rows, the search stops resolving and drill_in never fires.
//
// A test that only reads the live store would pass today and keep passing right up
// until the day it mattered. So these build a store that HAS the vintage rows —
// the post-pipeline state — and assert against that.

/** A store in the state the DB is in AFTER build_vintage_2011.py has run.
 *
 *  `order` decides which vintage is physically inserted first. That is not a
 *  detail: a scalar subquery returns the FIRST row it matches, so with the level
 *  guard removed the answer depends entirely on row order. The first version of
 *  this fixture only inserted current-first, which handed the correct state name
 *  back by luck and let a mutation that deletes the guard survive. Row order in a
 *  real store is not a guarantee anyone controls, so the guard has to hold under
 *  both. */
function storeAfterVintageBuild(order: "current-first" | "vintage-first" = "current-first") {
  const d = new Database(":memory:");
  d.exec(`CREATE TABLE region_keys (
    level TEXT, code TEXT, name TEXT, st_code TEXT,
    census2011_dt_code TEXT, iso_3166_2 TEXT, lgd_code TEXT
  )`);
  const ins = d.prepare(
    `INSERT INTO region_keys(level,code,name,st_code,census2011_dt_code,iso_3166_2,lgd_code)
     VALUES(?,?,?,?,NULL,NULL,NULL)`
  );

  // current vintage — what the map is actually drawing
  const current = () => {
    ins.run("state", "32", "Kerala", null);
    ins.run("state", "28", "Andhra Pradesh", null);
    ins.run("state", "36", "Telangana", null);
    ins.run("district", "32_07", "Ernakulam", "32");
    // sits under the split state, so the state-name subquery has a vintage row
    // it could wrongly resolve against
    ins.run("district", "28_02", "Visakhapatnam", "28");
  };

  // 2011 vintage — legitimate rows the vintage data path needs, which must not
  // reach the palette. Code 28 is the real hazard and not a contrived one: in
  // 2011 it meant undivided Andhra Pradesh, and after the 2014 split it means
  // the reduced state, with Telangana now 36. Same code, different region.
  const vintage = () => {
    ins.run("state2011", "32", "Kerala", null);
    ins.run("state2011", "28", "Andhra Pradesh (undivided)", null);
    ins.run("district2011", "32_07", "Ernakulam", "32");
  };

  if (order === "current-first") {
    current();
    vintage();
  } else {
    vintage();
    current();
  }
  return d;
}

test.describe("#563 region palette excludes vintage rows", () => {
  test("only current-vintage levels are offered", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const levels = [...new Set(rows.map((r) => r.level))].sort();
    expect(levels).toEqual(["district", "state"]);
    // stated the other way round too, so a future third current level cannot
    // quietly let the vintage ones back in alongside it
    for (const r of rows) {
      expect(r.level, `${r.name} leaked at level ${r.level}`).not.toMatch(/2011$/);
    }
  });

  test("Kerala resolves to exactly one row, not two", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const kerala = rows.filter((r) => r.name === "Kerala");
    // Two hits is the reported symptom: the search stops resolving because the
    // second one carries a code the current geometry cannot drill into.
    expect(kerala).toHaveLength(1);
    expect(kerala[0].level).toBe("state");
  });

  test("a code that means different regions across vintages keeps the current meaning", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const byCode = rows.filter((r) => r.level === "state" && r.code === "28");
    expect(byCode).toHaveLength(1);
    // india-map.tsx:440 builds Map<code, …>, so a surviving vintage row would not
    // merely add a list entry — it would overwrite this one and mislabel the state.
    expect(byCode[0].name).toBe("Andhra Pradesh");
  });

  test("districts are offered too, and carry their state name", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const ekm = rows.filter((r) => r.name === "Ernakulam");
    expect(ekm).toHaveLength(1);
    expect(ekm[0].level).toBe("district");
    expect(ekm[0].state).toBe("Kerala");
  });

  test("the state name on a district comes from the current vintage", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const vskp = rows.filter((r) => r.name === "Visakhapatnam");
    expect(vskp).toHaveLength(1);
    // The subquery that resolves st_code -> state name carries its own
    // level='state' guard. Without it, st_code 28 matches both the current
    // Andhra Pradesh and the undivided 2011 one, and the district would be
    // labelled with a state that has not existed since 2014.
    expect(vskp[0].state).toBe("Andhra Pradesh");
  });

  test("the state-name guard holds even when the vintage row is stored first", () => {
    // Same assertion, opposite row order. This is the one that actually proves
    // the guard: with current-first the subquery returns the right name whether
    // or not the guard is there, so only this direction can fail when it is
    // removed. Verified by mutation - deleting the guard turns this red and
    // leaves its sibling above green.
    const rows = searchableRegions(storeAfterVintageBuild("vintage-first"));
    const vskp = rows.filter((r) => r.name === "Visakhapatnam");
    expect(vskp).toHaveLength(1);
    expect(vskp[0].state).toBe("Andhra Pradesh");
  });

  test("vintage rows are excluded regardless of storage order", () => {
    for (const order of ["current-first", "vintage-first"] as const) {
      const rows = searchableRegions(storeAfterVintageBuild(order));
      expect(rows.filter((r) => r.name === "Kerala"), order).toHaveLength(1);
      for (const r of rows) expect(r.level, `${order}: ${r.name}`).not.toMatch(/2011$/);
    }
  });

  test("states are listed before districts", () => {
    const rows = searchableRegions(storeAfterVintageBuild());
    const firstDistrict = rows.findIndex((r) => r.level === "district");
    const lastState = rows.map((r) => r.level).lastIndexOf("state");
    expect(lastState).toBeLessThan(firstDistrict);
  });

  test("SEARCHABLE_LEVELS is the current vintage and nothing else", () => {
    expect([...SEARCHABLE_LEVELS]).toEqual(["state", "district"]);
  });
});

test.describe("#563 the live palette holds the same invariant", () => {
  // A canary on the deployed store. It cannot catch the bug today — the live DB
  // has no vintage rows — but it fails the moment someone runs the pipeline
  // against production and redeploys without the filter.
  test("/api/regions serves no vintage level", async ({ request }) => {
    const res = await request.get("/api/regions");
    expect(res.ok()).toBeTruthy();
    const { regions } = await res.json();
    expect(Array.isArray(regions)).toBeTruthy();
    expect(regions.length).toBeGreaterThan(0);
    const bad = regions.filter((r: { level: string }) => /2011$/.test(r.level));
    expect(bad, `vintage rows in the live palette: ${JSON.stringify(bad.slice(0, 3))}`)
      .toHaveLength(0);
  });
});
