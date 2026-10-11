"""Run docs/numbers.sql against Tiger and print each named result.

  python data/run_numbers.py
"""
import re

import common
import db

text = (common.ROOT / "docs" / "numbers.sql").read_text(encoding="utf-8")
chunks = re.split(r"^-- name: ", text, flags=re.M)
conn = db.connect()
for stmt in db.split_sql(chunks[0]):          # temp views, built once per session
    conn.execute(stmt)
for chunk in chunks[1:]:
    title, _, body = chunk.partition("\n")
    sql = db.split_sql(body)[0]
    cur = conn.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"\n== {title.strip()}")
    print("  " + " | ".join(cols))
    for r in rows:
        print("  " + " | ".join("" if v is None else str(v)[:44] for v in r))
