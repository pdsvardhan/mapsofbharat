import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /explore permalinks predate the Atlas revamp (iter-51 item 386): the
// explorer now lives at /. Redirect and keep every query param intact so
// old shared links restore the exact same view.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const s = qs.toString();
  redirect(s ? `/?${s}` : "/");
}
