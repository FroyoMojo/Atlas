# Atlas web (Jesse)

Dashboard for the demo: Vite + React + TypeScript, Leaflet map, Solana wallet adapter.

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
| `#/protect[/:id]` | Get protected: ZIP or neighborhood lookup (green covered, red not), $250/$500, price, readiness note, one-tap buy (Flow A or B) |
| `#/me` | My protection: "You're protected" with the river level, or "We've sent you $500" with safety steps |
| `#/phone?owner=<address>` | The same screen without the nav, for mirroring one wallet on the projector |
| `#/readiness` | Markets: pool readiness, funding sources, live and simulated markets with grades, Fund readiness (donation) |
| `#/invest` | The catastrophe bond: terms, risk and deposit |
| `#/proof` | Money set aside, reconciliation, payouts with in-browser Verify (`?sig=` links), Harvey stress test |
| `#/how` | How it works |
| `#/gauge/:id`, `#/pool`, `#/verify` | Old links: redirect to `#/protect/:id` and `#/proof` |
| `#/admin` | Store the admin token in this browser (demo laptop only) |

## Mocks

With `VITE_USE_MOCKS=true`, engine calls go to `src/mockEngine.ts`, which animates a fake
90-second flood from `mocks/*.json`. Chain calls (buy, bond, policies) always hit the chain
server. Gauge IDs and levels in the mocks are placeholders, not real USGS sites.

Switch to Ezekiel's engine with `VITE_USE_MOCKS=false` and `VITE_ENGINE_URL`. Set `VITE_PURCHASE_FLOW` to the result of the Hour-0 Phantom test.
