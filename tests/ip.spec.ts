import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

import { hashIp } from "@/lib/ip";

// Unit tests for the shared IP hash (iter-33 item 851). The stored-row assertion
// (an ip_hash present, no raw `ip` column) lives in corrections.spec.ts; this file
// pins the pure function's contract so a future change can't silently alter the
// hash shape or start leaking a raw address.
test.describe("hashIp (item 851)", () => {
  test("is deterministic", () => {
    expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
  });

  test("is exactly 16 lowercase hex chars", () => {
    for (const ip of ["203.0.113.7", "2001:db8::1", "unknown", ""]) {
      expect(hashIp(ip)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test("matches the first 16 hex of sha256(ip) — the corrections route's format", () => {
    const ip = "198.51.100.42";
    const expected = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    expect(hashIp(ip)).toBe(expected);
  });

  test("an empty IP collapses to the same hash as the literal \"unknown\"", () => {
    // preserves the route's `x-forwarded-for || x-real-ip || "unknown"` fallback,
    // so historical hashes stay consistent
    expect(hashIp("")).toBe(hashIp("unknown"));
  });

  test("distinct IPs produce distinct hashes", () => {
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  });

  test("does not return the raw address", () => {
    const ip = "203.0.113.7";
    expect(hashIp(ip)).not.toContain(ip);
  });
});
