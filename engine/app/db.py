"""Tiger Data (TimescaleDB) access: one small connection pool, dict rows, autocommit."""
from decimal import Decimal

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import settings

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not settings.DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set (repo-root .env)")
        _pool = ConnectionPool(
            settings.DATABASE_URL, min_size=1, max_size=8, open=True,
            kwargs={"row_factory": dict_row, "autocommit": True},
            # Tiger or a NAT can drop an idle connection; check it before handing it out, so the
            # first request after a quiet spell doesn't 500.
            check=ConnectionPool.check_connection,
        )
    return _pool


def close() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def rows(sql: str, params: dict | tuple = ()) -> list[dict]:
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchall()


def one(sql: str, params: dict | tuple = ()) -> dict | None:
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql: str, params: dict | tuple = ()) -> None:
    with pool().connection() as conn:
        conn.execute(sql, params)


def table_exists(name: str) -> bool:
    return one("SELECT to_regclass(%s) IS NOT NULL AS ok", (name,))["ok"]


def num(x) -> float | None:
    """NUMERIC comes back as Decimal; the API returns plain JSON numbers."""
    if x is None:
        return None
    return float(x) if isinstance(x, Decimal) else x
