"""Regenerate pipeline/expectations.json from the current canonical store.

Run after an intentional data change (new vertical, coverage-gate change) in
the same commit — the standing drift guard then watches the new baseline.
"""
import json, os, sqlite3

PIPE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(PIPE, "..", "data", "mapsofbharat.db")
EXP = os.path.join(PIPE, "expectations.json")

con = sqlite3.connect(DB)
metric_count = con.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]
coverage = con.execute(
    "SELECT COUNT(DISTINCT region_code) FROM metric_values WHERE region_level='district'"
).fetchone()[0]
per_metric = dict(con.execute(
    "SELECT metric_id, COUNT(DISTINCT region_code) FROM metric_values "
    "WHERE region_level='district' GROUP BY metric_id"))

exp = {"metric_count": metric_count, "district_coverage": coverage,
       "per_metric_district_count": per_metric}
json.dump(exp, open(EXP, "w"), indent=2, sort_keys=True)
print(f"expectations regenerated: {metric_count} metrics, {coverage} districts, "
      f"{len(per_metric)} per-metric entries")
