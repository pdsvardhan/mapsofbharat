import type Database from "better-sqlite3";

// The region palette index behind search / fly-to (#563).
//
// WHY THIS IS NOT AN INLINE QUERY IN THE ROUTE. `region_keys` holds more than the
// current vintage. `pipeline/build_vintage_2011.py:229-234` writes `district2011`
// and `state2011` rows for the as-reported 2011 census, and every one of them is a
// legitimate row — the vintage data path needs them. What must never happen is
// them reaching the palette.
//
// `components/india-map.tsx:216` states the contract from the other side: vintage
// codes "the /api/regions palette index does not and should not carry", because
// (line 1221) the same code can mean a DIFFERENT region across vintages. The client
// builds `nameIdx` as Map<code, …> at line 440, so a vintage row does not merely add
// a duplicate "Kerala" to the list — it collides on the key. Today the ORDER BY
// happens to let the current row land last and win, which is luck, not a design.
//
// So the filter is the load-bearing part of this query, and a filter that lives as a
// substring of a template literal cannot be tested — only asserted about. Pulling it
// into a function lets tests/region-search.spec.ts build a store that HAS vintage
// rows and prove they are excluded. Deleting the filter then turns that spec red,
// which is the whole point: the guard is verified, not just present.

/** Levels the palette may offer. Current vintage only: these are the levels whose
 *  codes match the geometry the map is drawing, so a search hit can actually be
 *  resolved and drilled into. */
export const SEARCHABLE_LEVELS = ["state", "district"] as const;

export type SearchableRegion = {
  level: string;
  code: string;
  name: string;
  st_code: string | null;
  state: string | null;
};

/**
 * Every region the palette may offer, current vintage only.
 *
 * Ordered state-before-district (level DESC puts 's' above 'd') and then by name,
 * so states head the list rather than being buried among 735 districts.
 */
export function searchableRegions(d: Database.Database): SearchableRegion[] {
  const placeholders = SEARCHABLE_LEVELS.map(() => "?").join(",");
  return d
    .prepare(
      `SELECT rk.level, rk.code, rk.name, rk.st_code,
              (SELECT s.name FROM region_keys s WHERE s.level='state' AND s.code = rk.st_code) AS state
       FROM region_keys rk
       WHERE rk.level IN (${placeholders})
       ORDER BY rk.level DESC, rk.name`
    )
    .all(...SEARCHABLE_LEVELS) as SearchableRegion[];
}
