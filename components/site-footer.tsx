import Link from "next/link";

// Shared content-page footer (iter-32 item 848; Terms/Privacy added iter-33 item
// 849). Links only to pages that EXIST: Methodology, Coverage, Corrections, Terms,
// Privacy. Rendered INSIDE each content page's <main> (so it is a generic footer,
// not a second contentinfo landmark) — never on the full-bleed map explorer `/`
// or `/embed`.
export function SiteFooter() {
  // Both ends of this failed on --background: text-dim 3.26:1 at rest and
  // text-accent 4.47:1 on hover, either side of the 4.5:1 AA floor for text
  // (items 431/473). --muted is 7.10:1 and --accent-text 5.39:1.
  const link = "text-muted hover:text-accent-text";
  return (
    <footer className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-soft pt-6 text-[12px]">
      <span className="flex items-center gap-2 font-semibold text-faint">
        <span
          className="flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-bright text-[9px] font-extrabold"
          style={{ color: "#14120d" }}
          aria-hidden="true"
        >
          MB
        </span>
        Maps of Bharat
      </span>
      <Link href="/methodology" className={link}>Methodology</Link>
      <Link href="/coverage" className={link}>Coverage</Link>
      <Link href="/corrections" className={link}>Corrections</Link>
      <Link href="/terms" className={link}>Terms</Link>
      <Link href="/privacy" className={link}>Privacy</Link>
    </footer>
  );
}
