import { NextResponse } from "next/server";
import { appendLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-side error reports POST here (see components/client-error-reporter.tsx).
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // tolerate malformed / beacon bodies
  }
  await appendLog({
    level: typeof body.level === "string" ? (body.level as string) : "error",
    message: String(body.message ?? "").slice(0, 2000),
    stack: typeof body.stack === "string" ? (body.stack as string).slice(0, 4000) : undefined,
    url: typeof body.url === "string" ? (body.url as string).slice(0, 500) : undefined,
    source: "client",
  });
  return NextResponse.json({ ok: true });
}
