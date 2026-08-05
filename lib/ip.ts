import { createHash } from "node:crypto";

// Shared IP hashing (iter-33 item 851). Extracted verbatim from the inline hash
// the corrections route has used since iter-32 item 848, so previously stored
// hashes stay byte-identical.
//
// The project stance (DPDP-aligned; see /privacy) is that a raw IP address is
// never persisted anywhere. Where an IP fingerprint is needed — currently only to
// limit abuse of the corrections form — it is reduced to the first 16 hexadecimal
// characters of sha256(ip). This is deterministic (the same IP always maps to the
// same fingerprint) and non-reversible (the address cannot be recovered from it).

/**
 * First 16 hex of sha256(ip) — never the raw IP.
 *
 * An empty / falsy IP collapses to the literal "unknown" before hashing, exactly
 * as the corrections route's `x-forwarded-for || x-real-ip || "unknown"` chain has
 * always done, so historical `ip_hash` values remain consistent.
 */
export function hashIp(ip: string): string {
  const value = ip || "unknown";
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
