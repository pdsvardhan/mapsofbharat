import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Writable store for private correction reports (iter-32 item 848).
//
// The canonical atlas DB (lib/db.ts) is opened READ-ONLY / query_only, so report
// submissions must NOT touch it. This is a SEPARATE writable SQLite file, by
// default alongside the canonical DB on the same /data volume (persisted, already
// writable for logs). It fails soft: if the volume isn't writable we return null
// and the route answers 503 rather than crashing.
const DB_PATH = process.env.CORRECTIONS_DB_PATH || "/data/corrections.db";

let _db: Database.Database | null | undefined;

export function correctionsDb(): Database.Database | null {
  if (_db !== undefined) return _db;
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    const d = new Database(DB_PATH);
    d.pragma("journal_mode = WAL");
    d.exec(
      `CREATE TABLE IF NOT EXISTS corrections_reports(
        id INTEGER PRIMARY KEY,
        created_at TEXT,
        message TEXT,
        location TEXT,
        email TEXT,
        ip_hash TEXT,
        user_agent TEXT
      )`
    );
    _db = d;
  } catch (e) {
    console.error("[corrections-db] store unavailable:", (e as Error).message);
    _db = null;
  }
  return _db;
}
