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
| `#/` | Map of gauges coloured normal / near / triggered, Start and Reset replay, trigger list |
| `#/gauge/:id` | Stage chart with the trigger line, quote with band, Buy button (wallet) |
| `#/pool` | On-chain panel, simulated-book panel, payouts with Explorer links, bond deposit |
| `#/verify` | Paste a payout signature: Memo hash vs recorded event vs recomputed hash |
| `#/phone?owner=<address>` | Large-type wallet view for mirroring on stage; flashes "+500 aUSD paid" |

## Mocks

With `VITE_USE_MOCKS=true`, engine calls go to `src/mockEngine.ts`, which animates a fake
90-second flood from `mocks/*.json`. Chain calls (buy, bond, policies) always hit the chain
server. Gauge IDs and levels in the mocks are placeholders, not real USGS sites.

Switch to Ezekiel's engine with `VITE_USE_MOCKS=false` and `VITE_ENGINE_URL`.
