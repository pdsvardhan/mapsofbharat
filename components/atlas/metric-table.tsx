"use client";

// Thin client wrapper so the server-rendered /metric/{id} page can reuse the atlas
// DataTable (iter-131 item 829). The page is a Server Component and cannot hand a
// function across the RSC boundary, so `fmtVal` is built HERE from the serializable
// `decimals` prop — matching india-map's fmtVal (en-IN, metric decimals) so a cell
// on the canonical page reads identically to the same region in the atlas table.
//
// It is a client component, but its rows still SSR: React renders this subtree to
// HTML on the initial request, so all ranked rows are in the crawlable markup; the
// sortable headers hydrate afterwards.

import { DataTable } from "@/components/atlas/data-table";
import type { Entry } from "@/components/atlas/right-rail";

export function MetricTable({
  metricLabel,
  unit,
  year,
  scopeNoun,
  decimals,
  entries,
  rankOf,
}: {
  metricLabel: string;
  unit: string;
  year?: number;
  scopeNoun: string;
  decimals: number;
  entries: Entry[];
  rankOf: Record<string, number>;
}) {
  const fmtVal = (v: number) =>
    v.toLocaleString("en-IN", { maximumFractionDigits: decimals });
  return (
    <DataTable
      metricLabel={metricLabel}
      unit={unit}
      year={year}
      scopeNoun={scopeNoun}
      entries={entries}
      rankOf={rankOf}
      fmtVal={fmtVal}
    />
  );
}
