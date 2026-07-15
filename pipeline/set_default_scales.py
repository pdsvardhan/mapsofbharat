"""Assign a data-driven class-break method to every metric's default_scale (#154).

Background: metrics.default_scale is the per-metric class-break override consumed
by the choropleth (india-map.tsx). Valid values are the four break METHODS
{continuous, quantile, equal, jenks}. Historically the ingest helpers hardcoded
PALETTE names ("sequential" / "viridis") into this column; the UI silently
ignores anything not in the valid set, so every map fell back to the app default
"continuous" and the per-metric override (iter-53 item 404) was inert.

This script is the authority for default_scale. It inspects each metric's actual
value distribution (at the finest level that has data — district preferred, else
state) and picks a method:

  * fewer than 5 usable values, or a degenerate (zero-variance) distribution
        -> "continuous"   (cannot form 5 stable classes; smooth ramp is honest)
  * |skewness g1| >= SKEW_THRESHOLD  (right- or left-skewed: counts, densities,
        currency, per-capita rates)
        -> "quantile"     (equal-count classes keep every bin populated and
                           reveal spatial pattern that equal-interval hides)
  * otherwise (roughly symmetric bounded percentages / ratios)
        -> "equal"        (equal-interval is intuitive and comparable)

Skewness is the Fisher-Pearson standardised moment g1 = m3 / m2**1.5. The chosen
method is printed per metric with n and g1 so the decision is auditable.

Run (final step of a canonical-store rebuild, AFTER all ingest_*.py):
    pipeline/.venv/bin/python pipeline/set_default_scales.py
"""
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "mapsofbharat.db")

VALID = {"continuous", "quantile", "equal", "jenks"}
SKEW_THRESHOLD = 0.5   # |g1| at/above which a metric is treated as skewed
MIN_VALUES = 5         # need >= this many usable values to form 5 classes


def _skewness(xs):
    """Fisher-Pearson g1; returns 0.0 for a zero-variance sample."""
    n = len(xs)
    mean = sum(xs) / n
    m2 = sum((x - mean) ** 2 for x in xs) / n
    if m2 == 0:
        return 0.0
    m3 = sum((x - mean) ** 3 for x in xs) / n
    return m3 / (m2 ** 1.5)


def _values_for(con, mid):
    """Values at the finest level that actually has >=MIN_VALUES rows for this
    metric (district first, then state), so the classing matches what the map
    renders. Returns (level, [values])."""
    for level in ("district", "state"):
        rows = con.execute(
            "SELECT value FROM metric_values "
            "WHERE metric_id=? AND region_level=? AND value IS NOT NULL",
            (mid, level),
        ).fetchall()
        vals = [r[0] for r in rows]
        if len(vals) >= MIN_VALUES:
            return level, vals
    # fall back to whatever exists (may be < MIN_VALUES)
    rows = con.execute(
        "SELECT value FROM metric_values WHERE metric_id=? AND value IS NOT NULL",
        (mid,),
    ).fetchall()
    return "any", [r[0] for r in rows]


def choose_method(vals):
    if len(vals) < MIN_VALUES or len(set(vals)) < MIN_VALUES:
        return "continuous"
    g1 = _skewness(vals)
    if abs(g1) >= SKEW_THRESHOLD:
        return "quantile"
    return "equal"


def main():
    con = sqlite3.connect(DB)
    metrics = con.execute("SELECT id, category FROM metrics ORDER BY category, id").fetchall()
    changed = 0
    tally = {"continuous": 0, "quantile": 0, "equal": 0, "jenks": 0}
    print(f"{'metric':<32} {'lvl':<9} {'n':>4} {'g1':>7}  method")
    for mid, cat in metrics:
        level, vals = _values_for(con, mid)
        method = choose_method(vals)
        g1 = _skewness(vals) if len(vals) >= 2 else 0.0
        prev = con.execute("SELECT default_scale FROM metrics WHERE id=?", (mid,)).fetchone()[0]
        con.execute("UPDATE metrics SET default_scale=? WHERE id=?", (method, mid))
        tally[method] += 1
        if prev != method:
            changed += 1
        flag = "" if prev in VALID else f"  (was {prev!r})"
        print(f"{mid:<32} {level:<9} {len(vals):>4} {g1:>7.2f}  {method}{flag}")
    con.commit()

    # invariant: no invalid values remain
    bad = con.execute(
        f"SELECT COUNT(*) FROM metrics WHERE default_scale NOT IN ({','.join('?'*len(VALID))})",
        tuple(VALID),
    ).fetchone()[0]
    con.close()
    print(f"\n{len(metrics)} metrics; {changed} changed; "
          f"continuous={tally['continuous']} quantile={tally['quantile']} "
          f"equal={tally['equal']} jenks={tally['jenks']}")
    assert bad == 0, f"{bad} metrics still hold an invalid default_scale"
    print("OK — every metric holds a valid break method")


if __name__ == "__main__":
    main()
