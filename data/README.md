# data/: USGS ingestion (Ezekiel)

`usgs.py` loads gauges, annual peaks and instantaneous values into Tiger. Every write is an
upsert, so it is safe to re-run. Raw responses go to `data/cache/` (git-ignored) before parsing.

```bash
pip install "psycopg[binary]" python-dotenv
python3 data/usgs.py gauges 08075000:42 08073600:66 08076000:60 08075500:24 --demo 08075000,08073600,08076000,08075500
python3 data/usgs.py peaks                                   # every gauge in the table
python3 data/usgs.py iv --start 2017-08-23 --end 2017-09-04  # the Harvey replay window
```

The triggers above are **placeholders** picked to sit below the Harvey peaks. Replace them with
NWS flood stages and set `record_start` / `record_note` per gauge (datum check, F11).

Still to build: the live poller (same `iv` call for the last few hours, on a timer) and the
instantaneous-data event rate for pricing.

`iv` also refreshes the `gauge_hourly` continuous aggregate for the loaded window; without that
the live history charts stay empty, because the aggregate's policy only covers the last 3 days.
