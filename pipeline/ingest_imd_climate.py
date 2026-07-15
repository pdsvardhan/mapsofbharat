"""IMD gridded rainfall + temperature -> district climate metrics (item 589).

Source: IMD Pune open gridded data, fetched via imdlib (no login):
  raw-new/climate/rain/2024.grd   0.25 x 0.25 deg daily rainfall (mm)
  raw-new/climate/tmax/2024.GRD   1 x 1 deg daily maximum temperature (deg C)

Aggregation: every grid point is assigned to the district polygon containing it
(public/geo/districts.geojson, shapely STRtree); a district's value is the mean
over its member grid points. Districts too small to contain any grid point take
the value of the NEAREST grid point (count logged, disclosed in methodology —
at 1 deg the temperature grid is coarse and neighbouring districts legitimately
share values). State values are computed the same way against states.geojson.

Metrics (category: environment, year 2024):
  rain_annual_mm     total rainfall in calendar 2024 (mm)
  rain_monsoon_mm    June-September (JJAS) 2024 rainfall (mm)
  tmax_mean_c        mean daily maximum temperature 2024 (deg C)
  heatwave_days_40c  days in 2024 with Tmax >= 40 deg C

heatwave_days_40c uses a fixed 40 deg C threshold — an objective, reproducible
proxy, NOT IMD's operational heatwave definition (which is departure-based and
station-relative); stated plainly in the methodology.

Run: pipeline/.venv/bin/python pipeline/ingest_imd_climate.py
"""
import json
import os
import sqlite3

import numpy as np

from region_match import upsert_metric, write_values, log_load, DB

PIPE = os.path.dirname(os.path.abspath(__file__))
CLIM = os.path.join(PIPE, "raw-new", "climate")
GEO = os.path.join(os.path.dirname(PIPE), "public", "geo")
SOURCE = "India Meteorological Department (IMD Pune) gridded daily data, 2024 (via imdlib)"
URL = "https://www.imdpune.gov.in/cmpg/Griddata/Open_Data.html"
LICENSE = "IMD open gridded data"
YEAR = 2024
FETCHED = "2026-07-15T23:53:00Z"

METHOD_COMMON = (
    "IMD Pune open gridded daily data for calendar 2024, aggregated onto current "
    "district boundaries: each grid point is assigned to the district containing "
    "it and the district takes the mean over its points; districts containing no "
    "grid point take the nearest point's value (coarse-grid effect, so small "
    "neighbouring districts can share values). Rainfall grid 0.25 deg; "
    "temperature grid 1 deg. State values computed identically. ")


def load_var(var, subdir):
    import imdlib
    data = imdlib.open_data(var, YEAR, YEAR, "yearwise", os.path.join(CLIM, subdir))
    ds = data.get_xarray()
    name = [v for v in ds.data_vars][0]
    arr = ds[name]                      # (time, lat, lon)
    lats = ds["lat"].values
    lons = ds["lon"].values
    vals = arr.values.astype("float64")
    # IMD fill values are large negatives (-999); mask everything implausible
    vals[vals < -90] = np.nan
    return vals, lats, lons


def grid_to_region(lats, lons, geojson_path, key_fn):
    """Map every (lat, lon) grid point -> region id via point-in-polygon with
    nearest-centroid fallback. Returns {(li, lo): region_id} and fallback count."""
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree

    feats = json.load(open(geojson_path))["features"]
    geoms, ids = [], []
    for f in feats:
        rid = key_fn(f["properties"])
        if not rid:
            continue
        geoms.append(shape(f["geometry"]))
        ids.append(rid)
    tree = STRtree(geoms)
    centroids = [g.centroid for g in geoms]

    mapping = {}
    misses = []
    for li, la in enumerate(lats):
        for lo, ln in enumerate(lons):
            p = Point(float(ln), float(la))
            hit = None
            for gi in tree.query(p):
                if geoms[gi].contains(p):
                    hit = ids[gi]
                    break
            if hit:
                mapping[(li, lo)] = hit
            else:
                misses.append((li, lo, p))
    return mapping, ids, geoms, centroids, misses


def aggregate(daily, lats, lons, geojson, key_fn, reducer):
    """reducer(time_series) -> scalar per grid point; mean over region points."""
    from shapely.strtree import STRtree

    mapping, ids, geoms, centroids, _ = grid_to_region(lats, lons, geojson, key_fn)
    # per-point scalar
    point_val = {}
    for (li, lo), rid in mapping.items():
        series = daily[:, li, lo]
        if np.all(np.isnan(series)):
            continue
        point_val[(li, lo)] = (rid, reducer(series))
    by_region = {}
    for (li, lo), (rid, v) in point_val.items():
        by_region.setdefault(rid, []).append(v)
    out = {rid: float(np.mean(vs)) for rid, vs in by_region.items()}

    # nearest-point fallback for regions with no grid point (only meaningful for
    # the coarse grids; ocean-fill NaN points are already excluded)
    valid_pts = list(point_val.keys())
    if not valid_pts:
        return out, 0
    pt_arr = np.array([(float(lons[lo]), float(lats[li])) for (li, lo) in valid_pts])
    fallback = 0
    for rid, c in zip(ids, centroids):
        if rid in out:
            continue
        d2 = (pt_arr[:, 0] - c.x) ** 2 + (pt_arr[:, 1] - c.y) ** 2
        (li, lo) = valid_pts[int(np.argmin(d2))]
        out[rid] = float(point_val[(li, lo)][1])
        fallback += 1
    return out, fallback


def main():
    con = sqlite3.connect(DB)

    dist_key = lambda p: p.get("rid")
    state_key = lambda p: str(p.get("st_code")) if p.get("st_code") is not None else None

    jjas = lambda s: np.nansum(s[152:274])          # 1 Jun (doy 153) .. 30 Sep, 2024 leap year
    total = 0
    specs = [
        ("rain", "rain", "rain_annual_mm", "Annual rainfall", "mm", 0,
         lambda s: np.nansum(s),
         "Total 2024 calendar-year rainfall (mm)."),
        ("rain", "rain", "rain_monsoon_mm", "Monsoon (JJAS) rainfall", "mm", 0,
         jjas,
         "June-September (JJAS) 2024 rainfall (mm) — the southwest monsoon season."),
        ("tmax", "tmax", "tmax_mean_c", "Mean daily maximum temperature", "°C", 1,
         lambda s: np.nanmean(s),
         "Mean of daily maximum temperature over 2024 (deg C)."),
        ("tmax", "tmax", "heatwave_days_40c", "Days at or above 40°C", "days", 0,
         lambda s: np.nansum(s >= 40.0),
         "Number of days in 2024 with gridded daily maximum temperature >= 40 deg C. "
         "A fixed-threshold proxy, not IMD's operational (departure-based) heatwave "
         "definition."),
    ]

    cache = {}
    for var, subdir, mid, name, unit, dec, reducer, desc in specs:
        if var not in cache:
            cache[var] = load_var(var, subdir)
        daily, lats, lons = cache[var]
        dvals, dfall = aggregate(daily, lats, lons,
                                 os.path.join(GEO, "districts.geojson"), dist_key, reducer)
        svals, sfall = aggregate(daily, lats, lons,
                                 os.path.join(GEO, "states.geojson"), state_key, reducer)
        dvals = {k: round(v, dec if dec else 0) for k, v in dvals.items()}
        svals = {k: round(v, dec if dec else 0) for k, v in svals.items()}
        hib = 0 if mid == "heatwave_days_40c" else None
        upsert_metric(con, mid, name, "environment", unit, dec, hib, desc,
                      SOURCE, URL, LICENSE, YEAR,
                      methodology=METHOD_COMMON + desc +
                      f" Nearest-grid-point fallback used for {dfall} districts.")
        n = write_values(con, mid, "district", YEAR, dvals)
        n += write_values(con, mid, "state", YEAR, svals)
        total += n
        print(f"  {mid}: {len(dvals)} districts (fallback {dfall}), {len(svals)} states, {n} values")

    log_load(con, "ingest_imd_climate.py", SOURCE, YEAR, LICENSE, FETCHED, total,
             "4 climate metrics from IMD 2024 grids (rain 0.25deg, tmax 1deg); "
             "point-in-polygon district aggregation, nearest-point fallback for "
             "gridless districts (coarse-grid effect disclosed)")
    con.commit(); con.close()
    print(f"WROTE {total} values across 4 metrics.")


if __name__ == "__main__":
    main()
