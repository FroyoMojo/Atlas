"""Database helpers and one-shot admin commands.

  python data/db.py check      # connect, report PG and TimescaleDB versions, columnstore API
  python data/db.py schema     # apply schema.sql
  python data/db.py finalize   # policies.sql + compress backfilled chunks + print stats
  python data/db.py tables     # list public tables and row counts
  python data/db.py gauges     # gauges table: trigger, NWS stage, record_start, record_note

Driver: psycopg 3 if it imports, otherwise pure-Python pg8000. The fallback exists because
locked-down Windows machines block psycopg's native libpq DLL (Application Control). All SQL in
this repo uses positional %s parameters so either driver runs it unchanged.
"""
from __future__ import annotations

import os
import re
import ssl
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import common

try:
    import psycopg

    DRIVER = "psycopg"
    DB_ERRORS: tuple = (psycopg.Error,)
except ImportError:  # includes "no pq wrapper available" when the DLL is blocked
    psycopg = None
    DRIVER = "pg8000"
    import pg8000.dbapi

    DB_ERRORS = (pg8000.dbapi.Error,)

common.load_env()


class Conn:
    """Autocommit connection with .execute(sql, params) -> cursor, for either driver."""

    def __init__(self, raw):
        self.raw = raw

    def execute(self, sql: str, params=None):
        cur = self.raw.cursor()
        cur.execute(sql, params) if params is not None else cur.execute(sql)
        return cur

    def cursor(self):
        return self.raw.cursor()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.raw.close()


def _url() -> str:
    """DATABASE_URL, or TIMESCALE_SERVICE_URL as Tiger's credentials file names it, or the PG*
    variables from the same file (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)."""
    url = os.environ.get("DATABASE_URL") or os.environ.get("TIMESCALE_SERVICE_URL")
    if url and "user:password@host" not in url:
        return url
    if os.environ.get("PGHOST"):
        from urllib.parse import quote
        return (f"postgres://{quote(os.environ.get('PGUSER', 'tsdbadmin'))}:"
                f"{quote(os.environ.get('PGPASSWORD', ''))}@{os.environ['PGHOST']}:"
                f"{os.environ.get('PGPORT', '5432')}/{os.environ.get('PGDATABASE', 'tsdb')}"
                f"?sslmode={os.environ.get('PGSSLMODE', 'require')}")
    sys.exit("No database URL. " + common.env_diagnosis())


def connect() -> Conn:
    url = _url()
    u = urlparse(url)
    password = unquote(u.password) if u.password else os.environ.get("PGPASSWORD", "")
    if not password:
        sys.exit("The database URL has no password. It must look like "
                 "postgres://tsdbadmin:PASSWORD@host:port/tsdb?sslmode=require. Copy the whole "
                 "TIMESCALE_SERVICE_URL line from Tiger's credentials file (the password sits "
                 "between 'tsdbadmin:' and '@'), or add the PGPASSWORD line from that file.")
    try:
        if psycopg is not None:
            return Conn(psycopg.connect(url if u.password else
                                        url.replace("@", f":{password}@", 1), autocommit=True))
        sslmode = parse_qs(u.query).get("sslmode", ["require"])[0]
        raw = pg8000.dbapi.connect(
            user=unquote(u.username or ""), password=password, host=u.hostname,
            port=u.port or 5432, database=(u.path or "/postgres").lstrip("/"),
            ssl_context=ssl.create_default_context() if sslmode != "disable" else None,
            timeout=600)
    except Exception as e:  # never echo the URL: it carries the password
        sys.exit(f"Could not connect to {u.hostname}:{u.port} as {u.username} "
                 f"({type(e).__name__}): {str(e)[:300]}")
    raw.autocommit = True
    return Conn(raw)


def split_sql(text: str) -> list[str]:
    """Strip `--` comments and split on ';'. Good enough for our files (no $$ blocks)."""
    no_comments = "\n".join(re.sub(r"--.*$", "", ln) for ln in text.splitlines())
    return [s.strip() for s in no_comments.split(";") if s.strip()]


def apply_sql(conn: Conn, path: Path, *, tolerate: bool = False) -> list[str]:
    """Run each statement on an autocommit connection (continuous aggregates cannot run inside a
    transaction block). Returns the statements that failed when tolerate=True."""
    failed = []
    for stmt in split_sql(path.read_text(encoding="utf-8")):
        try:
            conn.execute(stmt)
        except DB_ERRORS as e:
            if not tolerate:
                raise
            failed.append(f"{' '.join(stmt.split())[:90]} -> {str(e).splitlines()[0]}")
    return failed


def cmd_check() -> None:
    with connect() as conn:
        one = lambda q: conn.execute(q).fetchone()
        print(f"driver: {DRIVER}")
        print(f"PostgreSQL {one('SHOW server_version')[0]}")
        ext = one("SELECT extversion FROM pg_extension WHERE extname='timescaledb'")
        avail = one("SELECT default_version FROM pg_available_extensions "
                    "WHERE name='timescaledb'")
        print(f"TimescaleDB installed: {ext[0] if ext else 'no'}; "
              f"available: {avail[0] if avail else 'no'}")
        has_cs = one("SELECT count(*) FROM pg_proc WHERE proname='add_columnstore_policy'")[0]
        has_old = one("SELECT count(*) FROM pg_proc WHERE proname='add_compression_policy'")[0]
        print(f"columnstore API (add_columnstore_policy): {'yes' if has_cs else 'NO'}; "
              f"old compression API: {'yes' if has_old else 'no'}")
        print("by_range() dimension builder:",
              "yes" if one("SELECT count(*) FROM pg_proc WHERE proname='by_range'")[0] else "NO")
        print("Record these in docs/decisions.md check 8 (and F19 for the columnstore API).")


def cmd_schema() -> None:
    with connect() as conn:
        apply_sql(conn, common.DATA_DIR / "schema.sql")
        n = conn.execute(
            "SELECT count(*) FROM timescaledb_information.hypertables").fetchone()[0]
        print(f"schema applied; hypertables: {n}")


def cmd_finalize() -> None:
    with connect() as conn:
        failed = apply_sql(conn, common.DATA_DIR / "policies.sql", tolerate=True)
        columnstore_failed = [f for f in failed if "columnstore" in f.lower()]
        if columnstore_failed:
            print("columnstore API failed, falling back to the old compression API (F19):")
            for f in columnstore_failed:
                print("  ", f)
            for stmt in (
                "ALTER TABLE gauge_readings SET (timescaledb.compress, "
                "timescaledb.compress_segmentby = 'gauge_id, source', "
                "timescaledb.compress_orderby = 'event_time DESC')",
                "SELECT add_compression_policy('gauge_readings', INTERVAL '7 days', "
                "if_not_exists => true)",
            ):
                conn.execute(stmt)
            failed = [f for f in failed if f not in columnstore_failed]
        for f in failed:
            print("FAILED:", f)
        rows = conn.execute(
            "SELECT compress_chunk(c, if_not_compressed => true) "
            "FROM show_chunks('gauge_readings', older_than => INTERVAL '7 days') c").fetchall()
        print(f"compressed {len(rows)} chunk(s)")
        for fn in ("hypertable_columnstore_stats", "hypertable_compression_stats"):
            try:
                cur = conn.execute(f"SELECT * FROM {fn}('gauge_readings')")
                row = cur.fetchone()
                print(fn, dict(zip([d[0] for d in cur.description], row)))
                break
            except DB_ERRORS:
                continue


def cmd_tables() -> None:
    with connect() as conn:
        names = sorted(r[0] for r in conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall())
        for n in names:
            cnt = conn.execute(f'SELECT count(*) FROM "{n}"').fetchone()[0]
            print(f"{n:<16} {cnt:>10}")
        print(f"{len(names)} tables")


def cmd_gauges() -> None:
    with connect() as conn:
        rows = conn.execute(
            "SELECT gauge_id, trigger_ft, nws_flood_ft, record_start, demo_ready, name, "
            "record_note FROM gauges ORDER BY gauge_id").fetchall()
        print(f"{'gauge':<10} {'trigger':>8} {'NWS stage':>10} {'rec_start':>9} {'demo':>5}  name")
        for g, trig, nws_ft, rs, demo, name, note in rows:
            src = "NWS" if nws_ft is not None else "pctile"
            print(f"{g:<10} {trig:>8} {nws_ft if nws_ft is not None else '-':>10} {rs:>9} "
                  f"{'yes' if demo else '':>5}  {name}  [trigger: {src}]")
        print()
        for g, *_rest, note in rows:
            print(f"{g}: {note}")


if __name__ == "__main__":
    cmds = {"check": cmd_check, "schema": cmd_schema, "finalize": cmd_finalize,
            "tables": cmd_tables, "gauges": cmd_gauges}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]]()
