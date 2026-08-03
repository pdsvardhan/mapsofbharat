// C7 research: measure single-colour-dominance across every district metric.
// For each metric compute distribution shape + how equal-interval / quantile /
// log-equal 5-class breaks distribute regions. Shows how widespread "one colour
// dominates" is and whether it's the data (skew) or the method (equal-interval).
import Database from "better-sqlite3";
const db = new Database("/mnt/storage/websites/mapsofbharat/data/mapsofbharat.db", { readonly: true });
const rows = db.prepare(
  "SELECT mv.metric_id id, m.unit, m.category, m.default_scale, mv.value v FROM metric_values mv JOIN metrics m ON m.id=mv.metric_id WHERE mv.region_level='district' AND mv.value IS NOT NULL"
).all();
db.close();

const byMetric = {};
for (const r of rows) (byMetric[r.id] ??= { unit: r.unit, category: r.category, def: r.default_scale, vals: [] }).vals.push(r.v);

const counts = (v, edges) => {
  const c = new Array(edges.length + 1).fill(0);
  for (const x of v) { let i = 0; while (i < edges.length && x > edges[i]) i++; c[i]++; }
  return c;
};
const equal = (v, k) => { const mn = Math.min(...v), mx = Math.max(...v), s = (mx - mn) / k; return Array.from({ length: k - 1 }, (_, i) => mn + s * (i + 1)); };
const quantile = (v, k) => { const s = [...v].sort((a, b) => a - b); return Array.from({ length: k - 1 }, (_, i) => s[Math.floor((i + 1) / k * s.length)]); };
const logEqual = (v, k) => { // equal-interval in log space (only if all > 0)
  if (v.some((x) => x <= 0)) return null;
  const l = v.map(Math.log), mn = Math.min(...l), mx = Math.max(...l), s = (mx - mn) / k;
  return Array.from({ length: k - 1 }, (_, i) => Math.exp(mn + s * (i + 1)));
};

const res = [];
for (const [id, d] of Object.entries(byMetric)) {
  const v = d.vals; if (v.length < 20) continue;
  const s = [...v].sort((a, b) => a - b);
  const median = s[Math.floor(s.length / 2)] || 1;
  const p95 = s[Math.floor(s.length * 0.95)];
  const eqc = counts(v, equal(v, 5));
  const le = logEqual(v, 5);
  res.push({
    id, unit: d.unit, cat: d.category, def: d.def, n: v.length,
    skew: +(s[s.length - 1] / median).toFixed(1),
    eqDom: +(Math.max(...eqc) / v.length * 100).toFixed(0),
    eq: eqc.join(","),
    q: counts(v, quantile(v, 5)).join(","),
    log: le ? counts(v, le).join(",") : "n/a(<=0)",
  });
}
res.sort((a, b) => b.eqDom - a.eqDom);
console.log("=== district metrics, worst equal-interval dominance first ===");
console.log("dom%  skew  metric  (unit)  eq=[classes] q=[classes] log=[classes]");
for (const r of res) console.log(`${String(r.eqDom).padStart(3)}%  ${String(r.skew).padStart(6)}x  ${r.id} (${r.unit}) eq=[${r.eq}] q=[${r.q}] log=[${r.log}]`);
const bad = res.filter((r) => r.eqDom >= 60);
console.log(`\nSUMMARY: ${bad.length}/${res.length} district metrics put >=60% of regions in ONE equal-interval class.`);
console.log(`         ${res.filter((r) => r.eqDom >= 80).length}/${res.length} are >=80% (near-monochrome).`);
console.log(`default_scale values in use: ${[...new Set(res.map((r) => r.def))].join(", ")}`);
