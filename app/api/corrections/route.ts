import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { correctionsDb } from "@/lib/corrections-db";
import { hashIp } from "@/lib/ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Private corrections intake (iter-32 item 848).
// POST  — public: store a report (honeypot-guarded, no raw IP). /api/* is already
//         per-IP rate-limited by middleware.ts.
// GET   — owner-only: token-gated read of the stored reports, fail-closed.
//
// No user-generated content is ever published from this store; the public
// corrections LOG is a separately curated data/corrections.json.

const MAX_MESSAGE = 4000;

// Two concurrent POSTs of the same report used to write two rows: the UI disables
// the submit button, so a human double-click already yielded one, but nothing on
// the server stopped a genuine race (iter-32 feature-verification report 49,
// to-do #412). Within this window an identical submission from the same hashed IP
// collapses onto the row already stored.
//
// The key includes location and email, not just message + ip_hash as the report
// worded it: someone who submits, spots a typo in their own email and resubmits
// the same correction is making a SECOND, better report, and keying on the
// message alone would silently discard it. Identical-everything is the only
// combination that is certainly a duplicate.
const DEDUP_WINDOW_MS = 60_000;

/** The client IP, using the same header precedence as middleware.ts:
 *  x-forwarded-for (first hop) → x-real-ip → the literal "unknown". This raw value
 *  is used ONLY to derive a hash below; it is never persisted (DPDP / project
 *  stance — see /privacy and lib/ip.ts). */
function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Constant-time token compare; length mismatch short-circuits to false. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // tolerate malformed / empty bodies
  }

  // Honeypot: a hidden field real users never fill. If it's set, silently accept
  // and store NOTHING (don't tip off the bot with an error).
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  if (honeypot) return NextResponse.json({ ok: true });

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  }

  const location =
    typeof body.location === "string" && body.location.trim()
      ? body.location.trim().slice(0, 500)
      : null;
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().slice(0, 320)
      : null;

  const d = correctionsDb();
  if (!d) {
    return NextResponse.json({ ok: false, error: "store unavailable" }, { status: 503 });
  }

  const stored = message.slice(0, MAX_MESSAGE);
  const ipHash = hashIp(clientIp(req));

  // BEGIN IMMEDIATE takes the write lock before the SELECT, so the check and the
  // insert cannot interleave with another writer. A deferred transaction would
  // let two readers both miss, then have one fail on lock upgrade — turning a
  // duplicate row into a 500 rather than preventing it.
  const submit = d.transaction(() => {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const prior = d
      .prepare(
        `SELECT id FROM corrections_reports
          WHERE message = ? AND ip_hash = ? AND created_at >= ?
            AND location IS ? AND email IS ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(stored, ipHash, since, location, email) as { id: number } | undefined;

    if (prior) return { id: prior.id, duplicate: true };

    const info = d
      .prepare(
        `INSERT INTO corrections_reports (created_at, message, location, email, ip_hash, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        new Date().toISOString(),
        stored,
        location,
        email,
        ipHash,
        (req.headers.get("user-agent") || "").slice(0, 500)
      );
    return { id: Number(info.lastInsertRowid), duplicate: false };
  });

  const { duplicate } = submit.immediate();

  // The sender learns nothing new from `duplicate` — it is their own resend — and
  // it makes the collapse observable instead of silent.
  return NextResponse.json({ ok: true, duplicate });
}

export async function GET(req: Request) {
  // Fail closed: with no token configured the endpoint never exposes reports.
  const expected = process.env.CORRECTIONS_ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!tokenMatches(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const d = correctionsDb();
  if (!d) {
    return NextResponse.json({ error: "store unavailable" }, { status: 503 });
  }

  const reports = d
    .prepare(
      `SELECT id, created_at, message, location, email, ip_hash, user_agent
       FROM corrections_reports ORDER BY id DESC`
    )
    .all();

  return NextResponse.json({ ok: true, reports });
}
