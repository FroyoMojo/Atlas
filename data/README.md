# /data: Person A pipeline (Hour 0 to 1.5 and the Hour 1.5 to 4 backfill)

**Status:** written and unit-tested on fixtures only (`pytest data/tests`). It has never run against USGS, NWS or Tiger, because the build sandbox blocks those hosts. Treat the first live run of each step as the test, and fix what breaks.

## Run order (from a laptop that can reach USGS, NWS and Tiger Cloud)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r data/requirements.txt
cp .env.example .env        # replace DATABASE_URL, or append the TIMESCALE_SERVICE_URL line from Tiger's credentials file

python data/db.py check     # decisions.md check 8, and the F19 columnstore API answer
python data/db.py schema

python data/preflight.py discover        # find real gauges; edit data/gauges.json
python data/preflight.py check           # decisions.md checks 1, 2, 3 and the F11 screen

python data/backfill.py gauges --sites <6 to 10 site numbers>
python data/backfill.py iv --harvey-only # Harvey window first, so check 4 can be answered
python data/harvey.py                    # which gauges cross trigger_ft; add --demo ... --apply
python data/backfill.py peaks
python data/backfill.py iv               # decades of history, resumable from the cache
python data/db.py finalize               # continuous aggregate refresh + columnstore + stats
```

## Notes

- Every raw response is cached in `data/cache/` (git-ignored) before parsing. Re-runs are free.
- `finalize` runs after the backfill on purpose: the aggregate policy only refreshes 3 days, so history needs the full manual refresh, and the columnstore policy compresses the decades.
- `record_note` is machine-written from the stage-discharge screen. It is not the datum-history check in plan 6.1. Read each gauge's datum history on its USGS page and overwrite `record_note` when you have.
- USGS and NWPS endpoint paths are from memory and flagged `[VERIFY]` in the plan. If one 404s, `preflight.py` prints it as a problem rather than crashing.
