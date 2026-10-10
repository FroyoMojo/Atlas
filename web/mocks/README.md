# Mocks

Fake engine data with the exact shapes in `docs/api.md`, so the dashboard works before the
engine exists. Turn them off with `VITE_USE_MOCKS=false` in `web/.env.local`.

Gauge IDs, levels and coordinates here are placeholders, not real USGS sites. Ezekiel's engine
supplies the real ones. `src/mockEngine.ts` animates a fake 90-second replay from these numbers
so the map, charts and pool page can be built and rehearsed early.
