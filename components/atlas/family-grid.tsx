import { METHOD_LABEL, PALETTES, colorFor, fmtBin, methodAnchor } from "@/lib/breaks";
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

/** Number formatting that follows the member's own declared precision. */
function fmt(v: number, decimals: number, unit: string): string {
  return v.toLocaleString("en-IN", { maximumFractionDigits: decimals }) + (unit === "%" ? "%" : "");
}

/**
 * The scale, said out loud (iter-40 item 971).
 *
 * A small multiple is only readable if you know whether the panels share an axis,
 * and lib/metric-families.ts records both the choice AND the reason for it. That
 * reason is not developer commentary — it is the caveat a reader needs in order
 * not to misread the grid, so it is rendered rather than left in the source.
 *
 * A shared axis gets a real legend, because one legend is TRUE for every panel.
 * A free axis deliberately gets none: a single strip of swatches under panels
 * that each mean something different by the same colour is precisely the lie the
 * free axis exists to avoid. Each panel states its own range in its caption.
 */
function ScaleNote({ family }: { family: FamilyDetail }) {
  const ramp = PALETTES[family.palette].fn;
  const shared = family.shared;
  const decimals = family.members[0]?.decimals ?? 0;

  const bins = shared
    ? fmtBin(shared.breaks, shared.min, shared.max, decimals, shared.method)
    : [];

  return (
    <div className="mb-6 border-y-[3px] border-border py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-[.12em] text-faint">
          {shared ? "One shared scale" : "Each map has its own scale"}
        </span>
        {shared ? (
          <a
            href={`/methodology#${methodAnchor(shared.method)}`}
            className="font-mono text-[10px] font-bold tracking-[.08em] text-accent-text hover:underline"
          >
            {METHOD_LABEL[shared.method]}
          </a>
        ) : null}
      </div>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-muted">{family.axisWhy}</p>

      {shared ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {bins.map((label, i) => (
            <span key={label + i} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-5 flex-none border border-border-soft"
                style={{ background: ramp(bins.length <= 1 ? 0 : i / (bins.length - 1)) }}
              />
              <span className="font-mono text-[11px] text-muted">{label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Whether the panels add up, stated with the number actually measured (iter-40
 * item 972).
 *
 * Only two of the nine families genuinely decompose a quantity, and both were
 * proven by test rather than assumed — R1 originally claimed three more and none
 * of them survived. So this caption is driven entirely by `partToWhole`, which is
 * `false` unless lib/metric-families.ts measured the members summing.
 *
 * It prints the REAL figure. Religion averages 97.6, not 100, and a caption that
 * rounded that to "these sum to 100%" would be claiming a completeness the
 * catalogue does not have. The count of districts inside the 97-103 band is
 * printed for the same reason: an average of 97.6 says nothing about how many
 * districts are near it.
 *
 * The other seven families get the opposite sentence rather than silence. Grids
 * of related indicators look exactly like decompositions, and a reader who
 * assumes these add up will misread every one of them.
 */
function SumNote({ family }: { family: FamilyDetail }) {
  const ptw = family.partToWhole;
  const n = family.resolvedMembers;

  if (!ptw) {
    return (
      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        These are {n} related indicators from one source, not parts of one whole. They
        do not add up to anything.
      </p>
    );
  }

  const avg = ptw.sumsTo.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return (
    <p className="mt-6 text-[12px] leading-relaxed text-muted">
      These {n} shares are parts of one whole. Across the districts drawn here they sum
      to <span className="font-mono text-foreground">{avg}%</span> on average, and{" "}
      <span className="font-mono text-foreground">
        {ptw.within.toLocaleString("en-IN")} of {ptw.of.toLocaleString("en-IN")}
      </span>{" "}
      districts sum to within 97–103%.
    </p>
  );
}

export function FamilyGrid({ family, paths, panel }: Props) {
  const codes = drawOrder(paths);
  const ramp = PALETTES[family.palette].fn;

  return (
    <div>
      <ScaleNote family={family} />
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
              {/* On a free axis the panel's own range IS the scale, so it belongs
                  in the caption. On a shared axis the legend above already states
                  it once for every panel, and repeating it here would imply the
                  panels were scaled separately. */}
              {!family.shared && member.statsCount ? (
                <span className="mt-0.5 block font-mono text-[11px] font-normal text-faint">
                  {fmt(member.min, member.decimals, member.unit)}–
                  {fmt(member.max, member.decimals, member.unit)}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>

      <SumNote family={family} />
    </div>
  );
}
