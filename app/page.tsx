import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          <MapPin className="h-5 w-5 text-accent-teal" />
          MapsOf<span className="text-accent-teal">Bharat</span>
        </div>
        <span className="hidden text-sm text-foreground-muted sm:block">Official India statistics, mapped</span>
      </nav>

      <section className="mx-auto max-w-3xl px-6 pt-24 pb-32 text-center">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground-muted">
          Census · Crime · Elections · Economy · Health — from official sources
        </span>
        <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-balance">
          India, mapped by the numbers.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-foreground-muted text-balance">
          Explore official statistics as interactive choropleths — drill from India to state to
          district, compare regions and years, and download every figure with its source.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-teal px-5 py-3 font-medium text-background transition hover:opacity-90"
          >
            Explore the map <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
