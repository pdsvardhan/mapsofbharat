import { test, expect, type APIRequestContext } from "@playwright/test";

// Public corrections page + private report route (iter-32 item 848).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE HAS A WRITE GUARD (to-do #481).
//
// The tests below POST REAL submissions. `BASE_URL` defaults to localhost:8610,
// which is the PRODUCTION container, so running this spec the ordinary way wrote
// seven live reader-report rows into `/data-rw/corrections.db` on 2026-08-10. They
// had to be removed with `docker exec`, because the file is owned by uid 1001 and
// the host user cannot touch it. Nothing here could have detected it: the test
// asked the server to store a report and the server stored it. Success and damage
// were the same observation.
//
// So a writing test now has to PROVE, from the server's own answer, that it is
// pointed at a scratch store. `GET /api/corrections` reports `db_path`; the runner
// must have been told the same path via CORRECTIONS_SCRATCH_DB; and the production
// path is refused outright even if someone names it in that variable, because a
// guard you can satisfy by restating the mistake is not a guard.
//
// It FAILS rather than skips. A skip reads as green, and this project has already
// been bitten by that — seven of these tests skipped silently for months whenever
// CORRECTIONS_ADMIN_TOKEN was unset, and the suite reported success while covering
// a fraction of what it claimed. A red test that says "point me at a scratch
// instance" is the honest outcome.
//
// Run it the supported way, which sets all three variables for you:
//
//     scripts/test-isolated.sh tests/corrections.spec.ts
//
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN = process.env.CORRECTIONS_ADMIN_TOKEN || "";
const SCRATCH = process.env.CORRECTIONS_SCRATCH_DB || "";

/** Paths that are never acceptable as a write target, whatever the runner claims.
 *  `/data-rw/corrections.db` is the production store as configured in
 *  docker-compose.yml. Listing it explicitly closes the obvious hole: without this,
 *  `CORRECTIONS_SCRATCH_DB=/data-rw/corrections.db` would satisfy the equality
 *  check and reproduce the original incident with the guard reporting success. */
const FORBIDDEN_STORES = ["/data-rw/corrections.db", "/data/corrections.db"];

const HOWTO =
  "Run the corrections write tests against an isolated instance:\n" +
  "    scripts/test-isolated.sh tests/corrections.spec.ts\n" +
  "  It starts a scratch server, points CORRECTIONS_DB_PATH at a throwaway file and\n" +
  "  exports CORRECTIONS_SCRATCH_DB + CORRECTIONS_ADMIN_TOKEN for the runner.";

let provenStore: string | null = null;

/** Fail-closed proof that this run is allowed to write. Every assertion below is a
 *  reason NOT to write; only passing all of them permits a POST. */
async function assertScratchStore(request: APIRequestContext): Promise<string> {
  if (provenStore) return provenStore;

  expect(
    TOKEN,
    `CORRECTIONS_ADMIN_TOKEN is not set, so this test cannot ask the server where it\n` +
      `  writes — and must therefore not write at all.\n${HOWTO}`
  ).not.toBe("");

  expect(
    SCRATCH,
    `CORRECTIONS_SCRATCH_DB is not set. The runner has to state which store it expects\n` +
      `  to write to, so the server's answer can be checked against it.\n${HOWTO}`
  ).not.toBe("");

  const res = await request.get("/api/corrections", {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(
    res.status(),
    `GET /api/corrections answered ${res.status()}; without a readable store this test\n` +
      `  cannot verify its write target.\n${HOWTO}`
  ).toBe(200);

  const json = (await res.json()) as { db_path?: string };
  const dbPath = json.db_path;

  expect(
    typeof dbPath === "string" && dbPath.length > 0,
    `The server did not report db_path. It is probably running a build from before\n` +
      `  to-do #481. Rebuild the instance under test.\n${HOWTO}`
  ).toBe(true);

  expect(
    FORBIDDEN_STORES.includes(dbPath!),
    `REFUSING TO WRITE: the server under test stores corrections at ${dbPath}, which is\n` +
      `  a PRODUCTION store. This is the exact situation that put seven live rows in the\n` +
      `  reader-report database on 2026-08-10.\n${HOWTO}`
  ).toBe(false);

  expect(
    dbPath,
    `REFUSING TO WRITE: the server stores corrections at ${dbPath}, but this run was told\n` +
      `  to expect ${SCRATCH}. One of the two is wrong, and guessing which would be how a\n` +
      `  real database gets written to.\n${HOWTO}`
  ).toBe(SCRATCH);

  provenStore = dbPath!;
  return provenStore;
}

async function readReports(request: APIRequestContext) {
  const res = await request.get("/api/corrections", {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { ok: boolean; reports: Array<Record<string, unknown>> };
  return json.reports;
}

test.describe("corrections — public log + private report (item 848)", () => {
  // These read only. They run anywhere, including against production, because
  // looking at a page changes nothing.

  test("the page renders the log, intro, form and a not-published notice", async ({ page }) => {
    await page.goto("/corrections");

    await expect(page.getByRole("heading", { name: "Corrections", exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="corrections-log"]')).toBeVisible();

    await expect(page.locator('[data-testid="corrections-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="corrections-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="corrections-submit"]')).toBeVisible();

    await expect(page.getByText(/not published/i).first()).toBeVisible();

    await expect(page.locator('a[href="/methodology"]').first()).toBeVisible();
    await expect(page.locator('a[href="/coverage"]').first()).toBeVisible();
  });

  test("the empty log shows a clean empty state", async ({ request }) => {
    const html = await (await request.get("/corrections")).text();
    if (html.includes("No corrections logged yet.")) {
      expect(html).toContain("No corrections logged yet.");
    } else {
      test.skip(true, "corrections log has curated entries");
    }
  });

  test("GET without a token is rejected (401) or unconfigured (503)", async ({ request }) => {
    const res = await request.get("/api/corrections");
    expect([401, 503]).toContain(res.status());
  });

  test("GET with a wrong token is 401 when the endpoint is configured", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN to prove the configured path");
    const res = await request.get("/api/corrections", {
      headers: { authorization: "Bearer definitely-not-the-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET with the right token returns the reports array", async ({ request }) => {
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN");
    const res = await request.get("/api/corrections", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.reports)).toBe(true);
  });

  test("the owner GET reports which store it writes to", async ({ request }) => {
    // The guard's own dependency. If this regresses, every write test below turns
    // red rather than quietly writing somewhere real — which is the intended
    // direction of failure.
    test.skip(!TOKEN, "needs CORRECTIONS_ADMIN_TOKEN");
    const res = await request.get("/api/corrections", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const json = await res.json();
    expect(typeof json.db_path, "db_path is what makes the write guard possible (#481)").toBe("string");
    expect(json.db_path.length).toBeGreaterThan(0);
  });
});

test.describe("corrections — writing tests (isolated store required, #481)", () => {
  test("submitting the form shows a private-report success state", async ({ page, request }) => {
    await assertScratchStore(request);
    await page.goto("/corrections");
    await page.locator('[data-testid="corrections-message"]').fill(`ui report ${Date.now()}`);
    await page.locator('[data-testid="corrections-submit"]').click();
    await expect(page.getByText(/sent privately/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a honeypot submission returns ok but stores nothing", async ({ request }) => {
    await assertScratchStore(request);
    const marker = `hp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.post("/api/corrections", {
      data: { message: marker, website: "http://spam.example" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).ok).toBe(true);

    const reports = await readReports(request);
    expect(reports.some((r) => r.message === marker)).toBe(false);
  });

  test("a valid POST stores a row the owner can read back, with a hashed IP", async ({ request }) => {
    await assertScratchStore(request);
    const marker = `ok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await request.post("/api/corrections", {
      data: { message: marker, location: "/metric/literacy_rate", email: "x@example.com" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).ok).toBe(true);

    const reports = await readReports(request);
    const row = reports.find((r) => r.message === marker);
    expect(row, "the stored row is readable via the owner GET").toBeTruthy();

    // never store a raw IP — only the first 16 hex of sha256(ip)
    expect(row).not.toHaveProperty("ip");
    expect(String(row!.ip_hash || "")).toMatch(/^[0-9a-f]{16}$/);
    expect(row!.location).toBe("/metric/literacy_rate");

    // newest-first ordering
    for (let i = 0; i + 1 < reports.length; i++) {
      expect(Number(reports[i].id)).toBeGreaterThan(Number(reports[i + 1].id));
    }
  });
});

test.describe("corrections — concurrent-resubmit dedup (item 923, to-do #412)", () => {
  // The defect the iter-32 feature verifier found (report 49): the UI disables the
  // submit button, so a human double-click already produced one row, but two
  // genuinely concurrent POSTs produced two. These assert the STORE, not the
  // response body — a route can answer ok and still have written twice.

  test("two concurrent identical POSTs leave exactly one row", async ({ request }) => {
    await assertScratchStore(request);
    const marker = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = { message: marker, location: "/metric/literacy_rate", email: "dup@example.com" };

    const [a, b] = await Promise.all([
      request.post("/api/corrections", { data: body }),
      request.post("/api/corrections", { data: body }),
    ]);
    expect(a.ok() && b.ok()).toBeTruthy();

    const rows = (await readReports(request)).filter((r) => r.message === marker);
    expect(rows, "the racing pair collapses onto one stored report").toHaveLength(1);

    // exactly one of the two answered as the duplicate
    const flags = [(await a.json()).duplicate, (await b.json()).duplicate];
    expect(flags.filter(Boolean)).toHaveLength(1);
  });

  test("a sequential identical resubmit also collapses", async ({ request }) => {
    await assertScratchStore(request);
    const marker = `seq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = { message: marker };

    await request.post("/api/corrections", { data: body });
    const second = await request.post("/api/corrections", { data: body });
    expect((await second.json()).duplicate).toBe(true);

    const rows = (await readReports(request)).filter((r) => r.message === marker);
    expect(rows).toHaveLength(1);
  });

  test("the same message with a corrected email is kept, not swallowed", async ({ request }) => {
    await assertScratchStore(request);
    // The over-dedup guard. Someone who submits, spots a typo in their own email
    // and resubmits is filing a SECOND, better report. Keying on message + IP
    // alone would silently discard it — so the key carries location and email too.
    const marker = `fix-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await request.post("/api/corrections", { data: { message: marker, email: "typo@exmaple.com" } });
    const corrected = await request.post("/api/corrections", {
      data: { message: marker, email: "right@example.com" },
    });
    expect((await corrected.json()).duplicate).toBe(false);

    const rows = (await readReports(request)).filter((r) => r.message === marker);
    expect(rows, "both the original and the corrected report survive").toHaveLength(2);
    expect(rows.map((r) => r.email).sort()).toEqual(["right@example.com", "typo@exmaple.com"]);
  });
});
