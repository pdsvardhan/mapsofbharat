import { PALETTES, colorFor } from "@/lib/breaks";
import type { FamilyDetail, FamilyMemberValues } from "@/lib/family-data";
import type { PanelBox } from "@/lib/family-paths";

// The small-multiple grid (#547 phase B, iter-40 item 970).
//
// GEOMETRY ONCE, REFERENCED N TIMES. adr-d3geo's addendum measured the naive
// rendering — one <path> per district per panel — at 4,587 KiB of HTML for eight
// district panels. Unshippable. Every district's outline is therefore defined a
// single time in a hidden <defs> sprite and each panel references it with <use>,
// overriding only `fill`. That turns an 8x multiplication of path data into 8x a
// short reference: 837 KiB raw, 36 KiB gzipped, and the <use> elements are so
// near-identical that they compress to almost nothing.
//
// The paths in <defs> deliberately carry NO fill attribute. A <use> clone
// inherits fill from the referencing element, so a fill on the <path> would win
// and every panel would render in the same colour — the fill has to be absent
// there for it to be settable here.
//
// This is a server component. The grid is static: there is no interaction, no
// state and no hydration, so none of this reaches the client as JavaScript.

type Props = {
  family: FamilyDetail;
  paths: Record<string, string>;
  panel: PanelBox;
};

/** Districts drawn on every panel, in a stable order so the HTML is diffable. */
function drawOrder(paths: Record<string, string>): string[] {
  return Object.keys(paths).sort();
}

/**
 * The fill for one district on one panel.
 *
 * Both branches call the atlas's own colorFor with the atlas's own edges — a
 * shared axis paints from the family's pooled domain, a free axis from the
 * member's own. Which one applies is read from the family (adr-033: one
 * definition per visual fact), never guessed from the data here.
 */
function fillOf(
  value: number,
  member: FamilyMemberValues,
  family: FamilyDetail,
  ramp: (t: number) => string
): string {
  const scale = family.shared;
  return scale
    ? colorFor(value, scale.min, scale.max, scale.breaks, ramp)
    : colorFor(value, member.min, member.max, member.breaks, ramp);
}

export function FamilyGrid({ family, paths, panel }: Props) {
  const codes = drawOrder(paths);
  const ramp = PALETTES[family.palette].fn;

  return (
    <div>
      {/*
        The sprite. Hidden from layout and from assistive technology: it is the
        geometry library for the panels below, not content. `overflow-hidden` with
        zero size keeps it out of the flow without `display:none`, which in some
        engines stops <use> resolving against it.
      */}
      <svg
        aria-hidden="true"
        focusable="false"
        width={0}
        height={0}
        className="absolute h-0 w-0 overflow-hidden"
      >
        <defs>
          {codes.map((code) => (
            <path key={code} id={`fp-${code}`} d={paths[code]} />
          ))}
        </defs>
      </svg>

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {family.members.map((member) => (
          <figure key={member.id} className="m-0">
            <svg
              viewBox={`0 0 ${panel.width} ${panel.height}`}
              className="block h-auto w-full"
              role="img"
              aria-label={member.name}
              // The no-data tone is set ONCE per panel and inherited by every
              // <use> that does not override it. Districts outside the family's
              // shared set therefore cost a bare reference and still get drawn:
              // dropping them would silently redraw the outline of the country.
              style={{ fill: "var(--map-nodata)" }}
            >
              {codes.map((code) => {
                const v = member.values[code];
                return v == null ? (
                  <use key={code} href={`#fp-${code}`} />
                ) : (
                  <use key={code} href={`#fp-${code}`} fill={fillOf(v, member, family, ramp)} />
                );
              })}
            </svg>
            <figcaption className="mt-2 text-[12px] font-semibold leading-snug text-foreground">
              {member.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
