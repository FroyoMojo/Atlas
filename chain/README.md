# Atlas chain (Jesse)

Solana side of Atlas: the `aUSD` test stablecoin, Token-2022 policy tokens, the Squads vault,
the buy server (Solana Actions) and the payout bot. TypeScript on `@solana/web3.js` 1.x.

Plan references: build plan section 8, `docs/api.md`.

## What is tested

The full flow below was run end to end on a local validator, with the Squads program cloned
from devnet, because the devnet faucet refused airdrops from the build machine:

- aUSD mint, wallet funding, 2-of-3 Squads multisig with a 5-second time lock
- Policy mint with NonTransferable + MetadataPointer + TokenMetadata + PermanentDelegate:
  **985 / 1,232 bytes** to create, **670 bytes** for the atomic purchase
- Buying 3 policies through the server; the confirmer writing them to `policies`
- Bond deposit at NAV through the server
- Vault to bot float through a full proposal (create, 2 approvals, time lock, execute)
- Payout bot: warns once when the float is short, pays when funded, writes the
  `atlas:v1:<hash>` Memo, sets metadata `status` to `paid`
- Demo reset, then a second run paying the same policies again (one payout per run)

Not yet tested: the same scripts on real devnet (needs faucet SOL), and Blinks on a phone.

## Setup (once, about 10 minutes)

```bash
cd chain
npm install
cp ../.env.example ../.env       # then fill in DATABASE_URL, SOLANA_RPC_URL, INTERNAL_TOKEN

npm run keygen                    # keypairs into ../secrets (git-ignored)
npm run airdrop                   # devnet SOL for the treasury; if refused, use faucet.solana.com
npm run setup:ausd                # aUSD mint + 1,000,000 to the treasury
npm run fund -- <your-phantom-address>   # SOL + aUSD to every demo wallet (and your phone)
npm run setup:multisig -- 300     # 2-of-3 vault, seeded with a 300 aUSD reserve
npm run setup:bond                # bond mint
npm run test:token2022            # Hour-0 check: extensions, sizes, status round trip
npm run migrate                   # chain tables in Tiger (policy_pool, bot_waves)
npm run precreate -- <gaugeId>,<gaugeId> 10   # 10 unminted policies per demo gauge
npm run fund:bot -- 2000          # vault -> bot float through a 2-of-3 proposal
```

Addresses are saved to `chain/state/devnet.json` (public, safe to commit). Copy `ausdMint`
into `VITE_AUSD_MINT` for the web app.

## Run

```bash
npm run server      # :8787  buy Action, bond deposit, policies, terms JSON, demo reset
npm run bot         # polls trigger_events and pays waves
npm run status      # balances of every wallet and the vault
npm run demo:buy -- <gaugeId> holder1     # buy as a demo holder without a browser
npm run demo:bond -- 5000                 # deposit into the bond as the investor
```

## Server routes

| Route | Purpose |
| --- | --- |
| `GET /actions.json` | Actions rules; serve at the domain root |
| `GET /api/actions/buy?gauge=&payout=` | Action metadata with the live quote |
| `POST /api/actions/buy?gauge=&payout=` | `{account}` -> partially signed purchase transaction |
| `POST /api/bond/deposit` | `{account, amount}` -> partially signed deposit transaction |
| `GET /policies?owner=` | Policies for a wallet (from `policies`) |
| `GET /policies/:mint/onchain` | On-chain metadata, supply and holder |
| `GET /terms/:policyId.json` | Terms JSON the policy metadata `uri` points at |
| `POST /internal/demo/reset-policies` | Header `x-internal-token`; sets demo policies back to `active` |
| `GET /icon.svg`, `GET /health` | Action icon, health check |

## How the pieces fit

- **Purchase** (`src/lib/policy.ts`): one transaction creates the buyer's token account,
  moves the premium to the vault, mints the policy and removes the mint authority. The server
  partially signs as issuer; the wallet signs as fee payer. A buyer can never pay without
  getting a policy.
- **Confirmer** (in the server): every 4 s, checks reserved mints; supply 1 on-chain means sold,
  so it writes the `policies` row.
- **Payout** (`src/bot/payout-bot.ts`): per wave, pay factor `min(1, available / needed)` over
  vault + bot float; cross-checks on-chain holder, status and gauge; one transaction per policy
  with transfer + Memo + `status: paid`; records the payout so a restart never pays twice.
- **Evidence hash** (`src/lib/memo.ts`): recipe in `docs/api.md`, identical in the web app's
  verify page.

## Gotchas we already hit

- `@solana/web3.js` is pinned to 1.98.4. Do not install `@solana/kit` (v2).
- aUSD is classic SPL Token; policies are Token-2022. Derive token accounts with the right program.
- The vault is a PDA: its token account needs `allowOwnerOffCurve = true`.
- The Squads time lock applies to every proposal. Keep it short in demo mode.
- The bot can only pay from its float. Fund it before the demo with `npm run fund:bot`.

## Testing locally without devnet SOL

```bash
solana-test-validator --reset --url devnet \
  --clone-upgradeable-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf \
  --clone BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr
# then SOLANA_RPC_URL=http://127.0.0.1:8899 and run the setup above
# for a throwaway Postgres: npm run migrate -- --dev-stub   (never against the shared Tiger DB)
```
