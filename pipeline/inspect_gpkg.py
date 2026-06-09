import glob, os
P = os.path.dirname(os.path.abspath(__file__))
gpkgs = glob.glob(os.path.join(P, "raw", "**", "*.gpkg"), recursive=True)
print("gpkg files found:", gpkgs)
import geopandas as gpd
g = gpd.read_file(gpkgs[0])
print("rows:", len(g), "| crs:", g.crs)
print("cols:", [c for c in g.columns if c != g.geometry.name])
print(g.drop(columns=g.geometry.name).head(3).to_string())
print("total_bounds (minx,miny,maxx,maxy):", [round(float(v), 2) for v in g.total_bounds])
print("geom types:", g.geometry.geom_type.value_counts().to_dict())
