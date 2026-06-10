import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Lightweight, self-hosted error sink (risk no-error-tracking / #53).
// Primary sink is stdout (captured by `docker logs` / journald) — always works.
// Secondary best-effort sink is a JSON-lines file under LOG_PATH; if the
// mounted /data volume isn't writable by the container user we degrade quietly.
const LOG_PATH = process.env.LOG_PATH || "/data/logs/app.log";
let fileSinkWarned = false;

export type LogEntry = {
  level: string;
  message: string;
  stack?: string;
  url?: string;
  source?: string;
};

export async function appendLog(entry: LogEntry): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "error" || entry.level === "fatal") console.error("[applog]", line);
  else console.warn("[applog]", line);

  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, line + "\n", "utf8");
  } catch (e) {
    if (!fileSinkWarned) {
      fileSinkWarned = true;
      console.error("[applog] file sink unavailable, stdout only:", (e as Error).message);
    }
  }
}
