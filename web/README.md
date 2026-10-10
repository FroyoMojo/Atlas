# Atlas web (Jesse)

Dashboard for the demo: Vite + React + TypeScript, Leaflet map, Recharts, Solana wallet adapter.

```bash
cd web
npm install          # .npmrc turns off peer auto-install (keeps react-native out)
cp .env.example .env.local
npm run dev          # http://localhost:5173
npm run build        # type-checks, then builds to dist/
```

## Pages

| Route | Shows |
| --- | --- |
| `#/` | Map coloured normal / near / triggered, demo gauges, storm status; Start/Reset only with the admin token |
| `#/gauge/:id` | Stage over event time, trigger line, event markers, rejected count; quote with band, k, freeze; Buy (Flow A or B) |
| `#/pool` | On-chain panel (seeded capital labelled, float, NAV, reconciliation badge); simulated book with f_int / f_fin; payouts by kind; bond deposit |
| `#/verify` | Paste a payout signature: preimage, sha256(preimage), Memo hash, match |
| `#/phone?owner=<address>` | The money moment: balance from chain, "+$500 • PAID • Brays Bayou" banner with the transaction link |
| `#/admin` | Store the admin token in this browser (demo laptop only) |

## Mocks

With `VITE_USE_MOCKS=true`, engine calls go to `src/mockEngine.ts`, which animates a fake
90-second flood from `mocks/*.json`. Chain calls (buy, bond, policies) always hit the chain
server. Gauge IDs and levels in the mocks are placeholders, not real USGS sites.

Switch to Ezekiel's engine with `VITE_USE_MOCKS=false` and `VITE_ENGINE_URL`. Set `VITE_PURCHASE_FLOW` to the result of the Hour-0 Phantom test.
