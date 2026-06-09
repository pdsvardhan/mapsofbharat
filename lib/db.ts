import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/data/mapsofbharat.db";

let _db: Database.Database | null | undefined;

/** Read-only handle to the canonical store. Returns null if the DB isn't built yet. */
export function db(): Database.Database | null {
  if (_db !== undefined) return _db;
  try {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    _db.pragma("query_only = true");
  } catch {
    _db = null;
  }
  return _db;
}
