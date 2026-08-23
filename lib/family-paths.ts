import { readFileSync } from "node:fs";
import { join } from "node:path";

// Reader for the projected-path artefact (#547 phase B, iter-40 item 970).
//
// The artefact is written by scripts/build-family-paths.mjs in prebuild and
// committed to public/geo/district-paths.json. NOTHING HERE IMPORTS d3-geo, and
// that is the entire point of adr-d3geo: the projection is a build step, this is
// a file read, and the runtime dependency the plan would have created never
// exists. public/ is copied into the runner image (Dockerfile:33), and reading it
// through process.cwd() is the same pattern app/metric/[slug]/opengraph-image.tsx
// already uses for the brand mark.

export type PanelBox = { width: number; height: number };

export type FamilyPaths = {
  generated: string;
  panel: PanelBox;
  layers: Record<string, Record<string, string>>;
};

const ARTEFACT = "public/geo/district-paths.json";

let cached: FamilyPaths | null | undefined;

/**
 * The projected paths, or null when the artefact is unreadable.
 *
 * Null rather than a throw, and null rather than an empty object. The prebuild
 * guard (`build-family-paths.mjs --check`) is what fails the BUILD when this file
 * is missing or stale — that is the loud failure adr-d3geo specifies, and it
 * fires before an image is ever produced. If it somehow gets past that, the page
 * says the geometry is unavailable instead of rendering a grid of empty squares,
 * because a blank panel and a panel of no-data districts look identical and mean
 * completely different things.
 */
export function loadFamilyPaths(): FamilyPaths | null {
  if (cached !== undefined) return cached;
  try {
    const raw = readFileSync(join(process.cwd(), ARTEFACT), "utf-8");
    const parsed = JSON.parse(raw) as FamilyPaths;
    if (!parsed?.layers || !parsed.panel?.width || !parsed.panel?.height) {
      console.error(`[family-paths] ${ARTEFACT} is malformed — no layers or no panel box`);
      cached = null;
      return cached;
    }
    cached = parsed;
  } catch (err) {
    console.error(
      `[family-paths] cannot read ${ARTEFACT}:`,
      err instanceof Error ? err.message : String(err)
    );
    cached = null;
  }
  return cached;
}

/** The district layer, keyed by rid ("<st_code>_<dt_code>") — the same id the
 *  live map promotes and the same key metric_values.region_code carries. */
export function districtPaths(): { paths: Record<string, string>; panel: PanelBox } | null {
  const art = loadFamilyPaths();
  const paths = art?.layers?.district;
  if (!art || !paths || !Object.keys(paths).length) return null;
  return { paths, panel: art.panel };
}
