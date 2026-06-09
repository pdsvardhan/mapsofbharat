"""Generic data.gov.in (OGD) API puller.

Usage:
  datagov_pull.py <resource-id> [out.json] [field=value ...]

Reads the key from $DATA_GOV_IN_API_KEY or ../.env. Paginates the OGD
resource endpoint and returns all records. Reusable for every future
category that exposes a data.gov.in API.
"""
import sys, os, json, time, urllib.request, urllib.parse


def load_key():
    k = os.environ.get("DATA_GOV_IN_API_KEY")
    if k:
        return k
    envp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(envp):
        for line in open(envp):
            if line.startswith("DATA_GOV_IN_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None


def probe(key):
    """Hit a deliberately-bogus resource to learn whether the key is accepted."""
    url = "https://api.data.gov.in/resource/__probe__?" + urllib.parse.urlencode(
        {"api-key": key, "format": "json", "limit": 1}
    )
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.status, r.read().decode()[:300]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return "ERR", str(e)[:200]


def fetch(resource_id, key, limit=1000, max_records=200000, filters=None):
    out, offset = [], 0
    while len(out) < max_records:
        q = {"api-key": key, "format": "json", "limit": limit, "offset": offset}
        for k2, v in (filters or {}).items():
            q[f"filters[{k2}]"] = v
        url = f"https://api.data.gov.in/resource/{resource_id}?" + urllib.parse.urlencode(q)
        with urllib.request.urlopen(url, timeout=40) as r:
            d = json.loads(r.read().decode())
        recs = d.get("records", [])
        out += recs
        if len(recs) < limit:
            break
        offset += limit
        time.sleep(0.2)
    return out


if __name__ == "__main__":
    key = load_key()
    if not key:
        print("NO API KEY (set DATA_GOV_IN_API_KEY in .env)"); sys.exit(1)
    if len(sys.argv) < 2 or sys.argv[1] == "--probe":
        st, body = probe(key)
        print(f"PROBE status={st} body={body}")
        print("usage: datagov_pull.py <resource-id> [out.json] [field=value ...]")
        sys.exit(0)
    rid = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 and "=" not in sys.argv[2] else None
    filters = dict(a.split("=", 1) for a in sys.argv[2:] if "=" in a)
    recs = fetch(rid, key, filters=filters)
    print(f"fetched {len(recs)} records from {rid}")
    if recs:
        print("fields:", list(recs[0].keys()))
        print("sample:", json.dumps(recs[0])[:400])
    if out_path:
        json.dump(recs, open(out_path, "w"))
        print("saved ->", out_path)
