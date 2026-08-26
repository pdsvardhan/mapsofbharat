import { test, expect } from "@playwright/test";
import { get } from "node:http";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

// #405-F — the geometry is served pre-compressed, and every rung is checked (iter-45).
//
// WHY RAW http AND NOT request/fetch. Both Playwright's APIRequestContext and Node's
// fetch transparently decode a compressed response and hide the transfer size, so a
// test written with either can watch a 4.6x regression go past and call it green —
// which is the exact failure this file exists to prevent. node:http hands over the
// bytes that crossed the wire, which is the only thing worth asserting here.
//
// WHAT WENT WRONG WITHOUT THIS. The route was introduced serving brotli only, on the
// reasoning that Next's `compress: true` would handle everyone else. It does not
// compress a route handler's response: a client offering gzip but not brotli received
// 825,354 B where the old static path gave it 179,820 B. Both variants are pre-built
// now, and the gzip rung below is the assertion that keeps them that way.

const FILE = "districts.geojson";
const RAW_BYTES = 825_354;

function fetchRaw(url: string, acceptEncoding: string) {
  return new Promise<{ status: number; encoding: string | undefined; body: Buffer; headers: Record<string, string | string[] | undefined> }>(
    (resolve, reject) => {
      const req = get(url, { headers: { "accept-encoding": acceptEncoding } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            encoding: res.headers["content-encoding"],
            body: Buffer.concat(chunks),
            headers: res.headers,
          }),
        );
      });
      req.on("error", reject);
    },
  );
}

const base = () => process.env.BASE_URL ?? "http://localhost:8610";
const url = (path: string) => `${base()}${path}`;

test.describe("#405-F geometry is served pre-compressed", () => {
  test("brotli is served when the client accepts it, and it is genuinely smaller", async () => {
    const r = await fetchRaw(url(`/geodata/${FILE}`), "br, gzip, deflate");
    expect(r.status).toBe(200);
    expect(r.encoding, "a client offering br must get br — that is the whole point of the route").toBe("br");

    // The measured figures at the time of writing: 179,820 B gzip on the wire from the
    // static path, 118,735 B brotli from here. The ceiling is deliberately loose enough
    // to survive a boundary rebuild and tight enough that a silent fallback to gzip or
    // identity fails: gzip is ~179 KB and the raw file is 825 KB.
    expect(r.body.byteLength, `brotli response was ${r.body.byteLength} B`).toBeLessThan(140_000);

    const decoded = brotliDecompressSync(r.body);
    expect(decoded.byteLength, "the brotli body must decode to the whole file, not a truncated one").toBe(RAW_BYTES);
    expect(JSON.parse(decoded.toString("utf-8")).type).toBe("FeatureCollection");
  });

  test("gzip is served when brotli is not accepted — no 4.6x regression", async () => {
    const r = await fetchRaw(url(`/geodata/${FILE}`), "gzip, deflate");
    expect(r.status).toBe(200);
    expect(
      r.encoding,
      "a gzip-only client got identity once; Next does not compress a route handler's response, so the .gz has to be served explicitly",
    ).toBe("gzip");
    expect(r.body.byteLength, `gzip response was ${r.body.byteLength} B — the static path served 179,820 B`).toBeLessThan(200_000);

    const decoded = gunzipSync(r.body);
    expect(decoded.byteLength).toBe(RAW_BYTES);
  });

  test("a client that accepts nothing gets the whole file, uncompressed and intact", async () => {
    const r = await fetchRaw(url(`/geodata/${FILE}`), "identity");
    expect(r.status).toBe(200);
    expect(r.encoding, "identity means identity — never hand compressed bytes to a client that did not ask").toBeUndefined();
    expect(r.body.byteLength).toBe(RAW_BYTES);
  });

  test("Vary names Accept-Encoding, or a shared cache will poison one client with another's bytes", async () => {
    const r = await fetchRaw(url(`/geodata/${FILE}`), "br");
    const vary = ([] as string[]).concat(r.headers["vary"] as string | string[]).join(", ").toLowerCase();
    expect(vary).toContain("accept-encoding");
    expect(String(r.headers["cache-control"])).toContain("max-age=86400");
  });

  test("the route refuses traversal, unknown files and non-geometry extensions", async () => {
    for (const bad of ["..%2f..%2fpackage.json", "nope.geojson", "mapsofbharat.db", "..%2F..%2F.env"]) {
      const r = await fetchRaw(url(`/geodata/${bad}`), "br, gzip");
      expect(r.status, `/geodata/${bad} must not be served`).toBe(404);
    }
  });

  test("the original static path still serves the raw file", async () => {
    // /geo/* is unchanged on purpose: the raw sources stay linkable, and every
    // server-side reader (the boundary fingerprint, the centroid guard, the
    // family-paths artefact) keeps the path it already had.
    const r = await fetchRaw(url(`/geo/${FILE}`), "identity");
    expect(r.status).toBe(200);
    expect(r.body.byteLength).toBe(RAW_BYTES);
  });

  test("every geometry file a page can fetch has both pre-compressed variants", async () => {
    // FIXTURE POWER. The tests above pin one file; this one pins the SET, so adding a
    // layer to public/geo without regenerating cannot leave it silently uncompressed.
    const files = [
      "districts.geojson",
      "states.geojson",
      "districts-2011.geojson",
      "states-2011.geojson",
      "centroids-districts.geojson",
      "centroids-states.geojson",
      "centroids-districts-2011.geojson",
      "centroids-states-2011.geojson",
    ];

    const missing: string[] = [];
    for (const f of files) {
      const br = await fetchRaw(url(`/geodata/${f}`), "br");
      const gz = await fetchRaw(url(`/geodata/${f}`), "gzip");
      if (br.encoding !== "br") missing.push(`${f}: no brotli (${br.encoding ?? "identity"})`);
      if (gz.encoding !== "gzip") missing.push(`${f}: no gzip (${gz.encoding ?? "identity"})`);
    }

    expect(files.length, "the file list emptied out — this test would then assert nothing").toBeGreaterThan(5);
    expect(missing, `geometry served without a pre-compressed variant:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
