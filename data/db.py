"""Database helpers and one-shot admin commands.

  python data/db.py check      # connect, report PG and TimescaleDB versions, columnstore API
  python data/db.py schema     # apply schema.sql
  python data/db.py finalize   # policies.sql + compress backfilled chunks + print stats
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import psycopg

import common

common.load_env()


def connect(autocommit: bool = True) -> psycopg.Connection:
    # DATABASE_URL, or TIMESCALE_SERVICE_URL exactly as Tiger Cloud's credentials file names it.
    url = os.environ.get("DATABASE_URL") or os.environ.get("TIMESCALE_SERVICE_URL")
    if not url or "user:password@host" in url:
        sys.exit("No database URL. Put the Tiger Cloud line (TIMESCALE_SERVICE_URL=...) or "
                 "DATABASE_URL=... in .env at the repo root.")
    return psycopg.connect(url, autocommit=autocommit)


def split_sql(text: str) -> list[str]:
    """Strip `--` comments and split on ';'. Good enough for our files (no $$ blocks)."""
    no_comments = "\n".join(re.sub(r"--.*$", "", ln) for ln in text.splitlines())
    return [s.strip() for s in no_comments.split(";") if s.strip()]


def apply_sql(conn: psycopg.Connection, path: Path, *, tolerate: bool = False) -> list[str]:
    """Run each statement on an autocommit connection (continuous aggregates cannot run inside a
    transaction block). Returns the statements that failed when tolerate=True."""
    failed = []
    for stmt in split_sql(path.read_text()):
        try:
            conn.execute(stmt)
        except psycopg.Error as e:
            if not tolerate:
                raise
            failed.append(f"{' '.join(stmt.split())[:90]} -> {str(e).splitlines()[0]}")
    return failed


def cmd_check() -> None:
    with connect() as conn:
        pg = conn.execute("SHOW server_version").fetchone()[0]
        ext = conn.execute(
            "SELECT extversion FROM pg_extension WHERE extname='timescaledb'").fetchone()
        avail = conn.execute(
            "SELECT default_version FROM pg_available_extensions WHERE name='timescaledb'"
        ).fetchone()
        print(f"PostgreSQL {pg}")
        print(f"TimescaleDB installed: {ext[0] if ext else 'no'}; "
              f"available: {avail[0] if avail else 'no'}")
        has_cs = conn.execute(
            "SELECT count(*) FROM pg_proc WHERE proname='add_columnstore_policy'").fetchone()[0]
        has_old = conn.execute(
            "SELECT count(*) FROM pg_proc WHERE proname='add_compression_policy'").fetchone()[0]
        print(f"columnstore API (add_columnstore_policy): {'yes' if has_cs else 'NO'}; "
              f"old compression API: {'yes' if has_old else 'no'}")
        print("by_range() dimension builder:", "yes" if conn.execute(
            "SELECT count(*) FROM pg_proc WHERE proname='by_range'").fetchone()[0] else "NO")
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
                row = conn.execute(f"SELECT * FROM {fn}('gauge_readings')").fetchone()
                cols = [d.name for d in conn.execute(
                    f"SELECT * FROM {fn}('gauge_readings')").description]
                print(fn, dict(zip(cols, row)))
                break
            except psycopg.Error:
                continue


if __name__ == "__main__":
    cmds = {"check": cmd_check, "schema": cmd_schema, "finalize": cmd_finalize}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]]()
