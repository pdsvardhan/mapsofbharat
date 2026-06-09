import pandas as pd, os
P = os.path.dirname(os.path.abspath(__file__)); SH = os.path.join(P, "shrug")

print("=== shrid2_spatial_stats: columns + sample ===")
df = next(pd.read_stata(os.path.join(SH, "shrid2_spatial_stats.dta"), chunksize=4))
print("cols:", df.columns.tolist())
print(df.head(4).to_string())

print("\n=== pc11_subdist_pca.tab: header ===")
with open(os.path.join(SH, "pc11_subdist_pca.tab")) as f:
    print(f.readline().strip().split("\t"))

print("\n=== user sub-district file: cols + Level values ===")
u = pd.read_excel(os.path.join(P, "raw", "2011-IndiaStateDistSbDist.xlsx"), sheet_name="Data", dtype=str, nrows=3000)
print("cols:", list(u.columns)[:12], "...", list(u.columns)[-4:])
print("Level:", u["Level"].value_counts().to_dict() if "Level" in u.columns else "NO Level col")
