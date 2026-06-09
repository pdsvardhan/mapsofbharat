import sys
import pandas as pd

path = sys.argv[1]
print("FILE:", path)
xl = pd.ExcelFile(path)
print("SHEETS:", xl.sheet_names)

sh = xl.sheet_names[0]
print(f"\n=== RAW (header=None) first 14 rows of sheet '{sh}' ===")
raw = xl.parse(sh, header=None, nrows=14, dtype=str)
with pd.option_context("display.max_columns", None, "display.width", 240):
    print(raw.to_string())

full = xl.parse(sh, header=None, dtype=str)
print(f"\n=== total rows in '{sh}': {len(full)} ; total cols: {full.shape[1]} ===")
