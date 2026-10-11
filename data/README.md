# /data: Person A pipeline (Hour 0 to 1.5 and the Hour 1.5 to 4 backfill)

**Status:** run end to end against USGS, NWS and Tiger Cloud (Oct 10): 10 gauges, 2007 to 2026 history (6.5M readings), annual peaks, F11 record starts, moderate triggers, event counts and the simulated book are all in Tiger. Unit tests: `cd data && python -m pytest` (only `tests/`; see `pytest.ini`).

**Tiger is already loaded. Re-running these steps is only for a rebuild**, and most of them are safe to repeat (upserts). `backfill.py gauges` refreshes name, location and NWS stage only; it never overwrites `trigger_ft`, `record_start` or `record_note`.

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

python data/backfill.py f11              # datum-change record starts (data/f11_decisions.json)
python data/set_triggers.py moderate     # triggers = NWS moderate flood stage
python data/event_rate.py --store        # instantaneous event counts at those triggers (gauge_rates)
python data/build_sim_book.py --write    # the simulated 2,000-policy book (sim_policies)
python data/migrate_v31.py               # v3.1 columns and chain tables, then: cd chain && npm run migrate
python data/run_numbers.py               # every slide number (docs/numbers.sql), same as the engine
```

Order matters at the end: `event_rate.py --store` after any trigger change (the engine ignores
counts made at an old trigger), and `build_sim_book.py --write` after that.

## Notes

- Every raw response is cached in `data/cache/` (git-ignored) before parsing. Re-runs are free.
- `finalize` runs after the backfill on purpose: the aggregate policy only refreshes 3 days, so history needs the full manual refresh, and the columnstore policy compresses the decades.
- `record_note` is machine-written from the stage-discharge screen. It is not the datum-history check in plan 6.1. Read each gauge's datum history on its USGS page and overwrite `record_note` when you have.
- USGS and NWPS endpoint paths are from memory and flagged `[VERIFY]` in the plan. If one 404s, `preflight.py` prints it as a problem rather than crashing.

## Also in this folder

- `replay_check.py`: one throwaway replay against Tiger (`python data/replay_check.py [seconds]`); it deletes its own rows. Not a pytest file.
- `verify.py`: what is in Tiger and whether it is usable for pricing.
- `f11_decisions.json`: the datum-change record starts per gauge, applied with `py data\backfill.py f11`.

## Analyses (read-only, one-off)

Each prints its result and writes nothing to Tiger. They back the numbers in `docs/decisions.md`,
`docs/readiness.md` and `docs/devpost.md`.

| Script | Question |
| --- | --- |
| `bond_audit.py` | What would bond holders have lost each year? (the "lost money in 5 of 10 years" finding) |
| `cat_bond_design.py` | Can the investor layer be a real catastrophe bond? |
| `cat_bond_pooled.py` | Does pooling markets make it one? |
| `diversification.py` | Does backing several regions cut the capital a pool needs? |
| `chest_sim.py` | A self-funded community pool in the 2015 to 2017 flood cluster |
| `demo_sizing.py` | What the readiness demo looks like at a given pool size |
| `lead_time.py` | How much warning does a gauge give (anticipatory payouts)? |
| `idea_probe.py` | Facts for the product brainstorm (time above trigger, alerts) |
| `premium_scan.py` | Premium at each trigger level and term length |
| `peak_vs_iv.py` | Annual peak vs instantaneous maximum, per gauge |
| `gaps.py` | Reading gaps over 2 h in the Harvey window |
