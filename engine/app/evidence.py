"""Evidence preimage and hash, byte for byte as docs/evidence.md (the bot and verify page agree)."""
import datetime as dt
import hashlib


def preimage(gauge_id, value, opened_at, run_id, storm_id, event_id, feed=None, slot=None) -> str:
    t = opened_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return "|".join(["atlas", "v3", gauge_id, f"{value:.2f}", t, run_id, storm_id, event_id,
                     feed or "-", str(slot) if slot is not None else "-"])


def evidence_hash(p: str) -> str:
    return hashlib.sha256(p.encode("utf-8")).hexdigest()


def self_test() -> None:
    p = preimage("08074500", 31.456, dt.datetime(2026, 10, 11, 3, 15, 0, 250000, tzinfo=dt.timezone.utc),
                 "run-7", "run-7-s1", "run-7-e3")
    assert p == "atlas|v3|08074500|31.46|2026-10-11T03:15:00Z|run-7|run-7-s1|run-7-e3|-|-", p
    assert evidence_hash(p) == "a3bf1d54bf92482a546d48927da5801cc8452da55dee080956c8ce7222bf3642"
