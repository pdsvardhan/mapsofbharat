// CSV export of the current view (iter-15 item 163): one row per region with
// name, code, value, rank — plus a citation header so downloads stay sourced.

type Row = { code: string; name: string; state?: string; value: number | null; rank: number | null };

export function buildCsv(
  metricName: string, unit: string, year: number, source: string, license: string,
  level: "district" | "state", rows: Row[]
): string {
  const esc = (s: string | number | null | undefined) => {
    const t = s == null ? "" : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [
    `# ${metricName} (${unit}), ${year}`,
    `# Source: ${source} · ${license} · via MapsOfBharat`,
    level === "district" ? "code,district,state,value,rank" : "code,state,value,rank",
  ];
  for (const r of rows) {
    lines.push(
      level === "district"
        ? [r.code, esc(r.name), esc(r.state ?? ""), r.value ?? "", r.rank ?? ""].join(",")
        : [r.code, esc(r.name), r.value ?? "", r.rank ?? ""].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export function downloadCsv(filename: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
