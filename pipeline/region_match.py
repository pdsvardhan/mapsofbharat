"""Shared helpers for dataset adapters: region-name -> rid matching + canonical-store writes.

Matching strategy (in order): exact normalized (state, district) -> word-sorted
normalized (handles "Kameng East" vs "East Kameng") -> alias map (known renames)
-> difflib fuzzy within the same state (cutoff 0.82, logged). Sources that use
police districts (NCRB) should pre-aggregate City/Rural/Commissionerate splits
into the base name before calling match().
"""
import datetime, difflib, os, re, sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "mapsofbharat.db")

# source-name -> canonical geojson name (normalized forms both sides).
# Mostly pre-2014 names that NFHS/NCRB still print vs the current official names
# carried by districts.geojson / region_keys.
ALIASES = {
    # states (incl. source typos)
    "maharastra": "maharashtra", "chattisgarh": "chhattisgarh",
    "orissa": "odisha", "uttrakhand": "uttarakhand", "telengana": "telangana",
    "nct of delhi": "delhi", "pondicherry": "puducherry",
    # Andhra Pradesh
    "anantapur": "anantapuramu", "y s r": "ysr", "ysr kadapa": "ysr",
    "sri potti sriramulu nello": "sri potti sriramulu nellore",
    "nellore": "sri potti sriramulu nellore",
    "dr br ambedkar konaseema": "konaseema",
    # Karnataka renames (2014) — bijapur/raigarh-style collisions live in STATE_ALIASES
    "belgaum": "belagavi", "bellary": "ballari",
    "bangalore": "bengaluru urban", "bangalore urban": "bengaluru urban",
    "bangalore rural": "bengaluru rural", "mysore": "mysuru",
    "gulbarga": "kalaburagi", "shimoga": "shivamogga", "tumkur": "tumakuru",
    "chikmagalur": "chikkamagaluru", "chamarajanagar": "chamarajanagara",
    "bagalkot": "bagalkote", "davangere": "davanagere",
    "chikballapur": "chikkaballapura",
    # Odisha old transliterations
    "debagarh": "deogarh", "baleshwar": "balasore", "baudh": "boudh",
    # Gujarat
    "kachchh": "kutch", "mahesana": "mehsana", "dohad": "dahod", "the dangs": "dang",
    # Haryana
    "gurgaon": "gurugram", "mewat": "nuh",
    # Bihar
    "pashchim champaran": "west champaran", "purba champaran": "east champaran",
    # Jharkhand
    "purbi singhbhum": "east singhbhum", "pashchimi singhbhum": "west singhbhum",
    # Madhya Pradesh
    "narsimhapur": "narsinghpur",
    # Arunachal (NFHS lists Lower Dibang Valley separately, so bare = Upper)
    "dibang valley": "upper dibang valley",
    # Assam
    "south salmara mancachar": "south salmara mankachar",
}

# (state_norm, district_norm) -> canonical norm; takes precedence over ALIASES.
# Needed where the same old name maps differently per state (Bijapur exists in
# Chhattisgarh but is Vijayapura's old name in Karnataka; Raigarh is real in CG
# but Maharashtra's "Raigarh" spelling means Raigad).
STATE_ALIASES = {
    ("karnataka", "bijapur"): "vijayapura",
    ("maharashtra", "raigarh"): "raigad",
    ("maharashtra", "bid"): "beed",
    ("chhattisgarh", "dantewada"): "dakshin bastar dantewada",
    # NCRB prints the full official name "Kumaram Bheem Asifabad" (with the
    # K/u spelling); region_keys carries the short form "Komaram Bheem" — too
    # far apart for the 0.82 fuzzy cutoff, so the district had no crime rows.
    ("telangana", "kumaram bheem asifabad"): "komaram bheem",
    # Sikkim's 2021 district reorganisation: East->Gangtok, North->Mangan,
    # South->Namchi, West->Gyalshing, plus Pakyong (carved out of East) and
    # Soreng (carved out of West). Post-2021 sources (NCRB CII 2022+) print the
    # new names — usually as "Gangtok (East)", whose parenthetical hint norm()
    # strips — while region_keys carries the pre-2021 four-district geometry,
    # so every new name maps to its parent district. Count-based adapters
    # aggregate the two carve-outs into their parents (Pakyong->East,
    # Soreng->West); a percentage source that reports the new six units would
    # need per-adapter weighting instead of this map.
    ("sikkim", "gangtok"): "east sikkim",
    ("sikkim", "pakyong"): "east sikkim",
    ("sikkim", "mangan"): "north sikkim",
    ("sikkim", "namchi"): "south sikkim",
    ("sikkim", "soreng"): "west sikkim",
    ("sikkim", "gyalshing"): "west sikkim",
}


def norm(s) -> str:
    s = str(s).lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^a-z ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def norm_sorted(s) -> str:
    return " ".join(sorted(norm(s).split()))


class RegionMatcher:
    def __init__(self, con: sqlite3.Connection):
        self.state_by_name = {}
        self.exact = {}
        self.sorted_idx = {}
        self.by_state: dict[str, dict[str, str]] = {}
        for code, name in con.execute("SELECT code, name FROM region_keys WHERE level='state'"):
            self.state_by_name[norm(name)] = code
        for code, name, st in con.execute(
            "SELECT code, name, st_code FROM region_keys WHERE level='district'"
        ):
            n = norm(name)
            self.exact[(st, n)] = code
            self.sorted_idx[(st, norm_sorted(name))] = code
            self.by_state.setdefault(st, {})[n] = code
        self.fuzzy_log: list[tuple[str, str, str]] = []

    def state_code(self, state_name) -> str | None:
        n = norm(state_name)
        return self.state_by_name.get(ALIASES.get(n, n) if ALIASES.get(n) else n) or self.state_by_name.get(n)

    def match(self, state_name, district_name, extra_aliases=None) -> str | None:
        st = self.state_code(state_name)
        if not st:
            return None
        n = norm(district_name)
        sn = norm(state_name)
        sn = ALIASES.get(sn, sn)
        n = STATE_ALIASES.get((sn, n)) or (extra_aliases or {}).get(n) or ALIASES.get(n, n)
        rid = self.exact.get((st, n))
        if rid:
            return rid
        rid = self.sorted_idx.get((st, norm_sorted(n)))
        if rid:
            return rid
        cands = self.by_state.get(st, {})
        close = difflib.get_close_matches(n, cands.keys(), n=1, cutoff=0.82)
        if close:
            self.fuzzy_log.append((state_name, district_name, close[0]))
            return cands[close[0]]
        return None


# Valid class-break METHODS for metrics.default_scale — consumed by the
# choropleth (india-map.tsx). NOT palette names. (#154 root-cause fix.)
VALID_BREAK_METHODS = {"continuous", "quantile", "equal", "jenks"}


def upsert_metric(con, mid, name, category, unit, decimals, higher_is_better,
                  description, source, source_url, license_, year, methodology=None,
                  default_scale=None):
    # idempotent migration: trust-layer columns (iter-15 item 161)
    mcols = {r[1] for r in con.execute("PRAGMA table_info(metrics)")}
    for c in ("methodology", "last_updated"):
        if c not in mcols:
            con.execute(f"ALTER TABLE metrics ADD COLUMN {c} TEXT")
    # default_scale is a class-break METHOD, never a palette name (#154): the old
    # hardcoded "sequential"/"viridis" were silently ignored by the UI, leaving
    # the per-metric override (iter-53 item 404) inert. Preserve an existing valid
    # override across re-ingests; else use the caller's method if valid; else the
    # app-wide default 'continuous'. set_default_scales.py recomputes data-driven
    # methods as the final rebuild step.
    prev = con.execute("SELECT default_scale FROM metrics WHERE id=?", (mid,)).fetchone()
    ds = default_scale if default_scale in VALID_BREAK_METHODS else None
    if ds is None and prev and prev[0] in VALID_BREAK_METHODS:
        ds = prev[0]
    if ds is None:
        ds = "continuous"
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute(
        """INSERT OR REPLACE INTO metrics
           (id, name, category, unit, decimals, higher_is_better, default_scale,
            description, source, source_url, license, year, methodology, last_updated)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (mid, name, category, unit, decimals, higher_is_better, ds,
         description, source, source_url, license_, year, methodology, now))


def write_values(con, mid, level, year, values: dict):
    con.execute(
        "DELETE FROM metric_values WHERE metric_id=? AND region_level=? AND year=?",
        (mid, level, year))
    n = 0
    for code, v in values.items():
        if v is None:
            continue
        con.execute("INSERT OR REPLACE INTO metric_values(metric_id,region_code,region_level,year,value,estimated) VALUES(?,?,?,?,?,?)",
                    (mid, code, level, year, float(v), 0))
        n += 1
    return n


def log_load(con, adapter, source, year, license_, fetched_at, rows, notes):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute(
        "INSERT INTO load_log (adapter, source, year, license, fetched_at, loaded_at, rows_written, notes) VALUES (?,?,?,?,?,?,?,?)",
        (adapter, source, year, license_, fetched_at, now, rows, notes))
