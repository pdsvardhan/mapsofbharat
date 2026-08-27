// Browse the catalogue by the FORM each metric can honestly take (#575, item 1081).
//
// The last step of the visualisation-first order: matrix, then toggle, then the forms
// themselves, then this. lib/metric-capabilities.ts was written in anticipation of it
// — "a browse-by-form page makes every one of these calls public, so they need one
// resolver and one test" — so this consults that resolver and derives nothing of its
// own. A second opinion about what a metric may be drawn as is exactly the drift that
// file exists to prevent.
//
// WHY THE VALUES MATTER AND WHY THIS IS STILL ONE QUERY. `symbolEligible` is not a
// unit test: forest_change_km2 carries a count unit (km²) but is SIGNED, and a circle
// sized by area cannot say which direction a change went. That is decided from the
// DATA, so the resolver needs values.
//
// It does not need all of them. The only questions asked of the values are "is there
// a real number here at all" and "is any of them negative", so the minimum and the
// maximum answer both, exactly — not approximately. One GROUP BY over metric_values
// replaces 125 per-metric queries, and the answer is identical to the one the full
// series would give.

import { db } from "@/lib/db";
import { capabilitiesFor, VISUALIZATIONS, type Capability, type VizId } from "@/lib/metric-capabilities";
import { getAllMetrics, type MetricListItem } from "@/lib/metric-page-data";

export type FormGroup = {
  viz: VizId;
  /** The form's name and what it suits, from the resolver's own table. */
  name: string;
  suits: string;
  /** Metrics this form is the PREFERRED instrument for, catalogue order. */
  metrics: { metric: MetricListItem; reason: string }[];
};

/** min/max per metric — everything the resolver asks of the values, in one query.
 *
 *  Exported so it can be tested on its own. It has to be: the grouping is blind to
 *  whether these numbers are real, because no metric in today's catalogue is a signed
 *  count — so a mutation that replaced every extreme with a constant survived a test
 *  that only looked at the groups. What the query returns is a separate claim from
 *  what the grouping does with it, and it needs its own assertion. */
export function valueExtremes(): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const d = db();
  if (!d) return out;
  const rows = d
    .prepare(
      `SELECT metric_id, MIN(value) AS mn, MAX(value) AS mx
         FROM metric_values
        WHERE value IS NOT NULL
        GROUP BY metric_id`,
    )
    .all() as Array<{ metric_id: string; mn: number; mx: number }>;
  for (const r of rows) {
    if (Number.isFinite(r.mn) && Number.isFinite(r.mx)) out.set(String(r.metric_id), [r.mn, r.mx]);
  }
  return out;
}

/**
 * Every metric grouped under the form it is the honest instrument for.
 *
 * A metric appears ONCE, under its preferred form — the one the map opens it in.
 * Listing it again under every form it is merely *allowed* would turn a page about
 * what suits the data into a page about what the renderer tolerates, and the standing
 * that matters to a reader choosing what to look at is the first one.
 *
 * A metric with no values at all is omitted rather than filed under a guess: the
 * resolver cannot answer for a series it has never seen, and inventing a group for it
 * would put a claim on the page that nothing backs.
 */
export function groupByForm(
  input?: { metrics: MetricListItem[]; extremes: Map<string, [number, number]> },
): { groups: FormGroup[]; omitted: number } {
  // The inputs are injectable, and that is not a convenience. Three of this
  // function's branches cannot be reached from today's store — every metric in it
  // has values, no metric is a signed count, and no form group is empty — so a
  // mutation test against the real catalogue could break all three and stay green.
  // It did: three of six mutations survived, which is the same thing as saying the
  // branches were untested. Reading the store stays the default; a caller may hand
  // it a catalogue instead, and the spec hands it the shapes reality does not
  // currently supply.
  const metrics = input?.metrics ?? getAllMetrics();
  const extremes = input?.extremes ?? valueExtremes();

  const byViz = new Map<VizId, FormGroup["metrics"]>();
  let omitted = 0;

  for (const m of metrics) {
    const ex = extremes.get(m.id);
    if (!ex) { omitted += 1; continue; }
    const caps: Capability[] = capabilitiesFor(m.id, m.unit, ex);
    const top = caps.find((c) => c.standing === "preferred") ?? caps[0];
    if (!top) { omitted += 1; continue; }
    if (!byViz.has(top.viz)) byViz.set(top.viz, []);
    byViz.get(top.viz)!.push({ metric: m, reason: top.reason });
  }

  // The resolver's own table sets the order and the wording, so a form added there
  // appears here without this file being touched.
  const groups: FormGroup[] = (Object.keys(VISUALIZATIONS) as VizId[])
    .map((viz) => ({
      viz,
      name: VISUALIZATIONS[viz].name,
      suits: VISUALIZATIONS[viz].suits,
      metrics: byViz.get(viz) ?? [],
    }))
    .filter((g) => g.metrics.length > 0);

  return { groups, omitted };
}
