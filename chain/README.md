# Atlas chain (Jesse)

Solana side of Atlas, aligned to build plan v3.1 (section 8): the `aUSD` test stablecoin,
Token-2022 policy tokens, the Squads vault, the **chain service** (the only process besides the
bot that signs) and the **storm payout bot**. TypeScript on `@solana/web3.js` 1.x.

Contract: [`docs/api.md`](../docs/api.md). Evidence format: [`docs/evidence.md`](../docs/evidence.md).

## What is tested (local validator with the devnet Squads program cloned, Oct 10)

The devnet faucet refused airdrops from the build machine, so the full flow ran on a local
validator with the real Squads program cloned from devnet.

| Area | Result |
| --- | --- |
| Policy token | NonTransferable + MetadataPointer + TokenMetadata + PermanentDelegate on one mint; create 985 bytes, purchase 670 bytes; name and status `ACTV` -> `PAID` -> `ACTV` round trip |
| Purchase Flow A | Server signs first, wallet signs and sends |
| Purchase Flow B | Wallet signs first, server checks message hash, co-signs, sends |
| Tamper check | Flow B transaction with the premium changed to 0: refused (409) |
| Abuse limits | Second reservation for the same wallet refused; non-allowlisted wallet refused; 6th buy in a minute rate-limited |
| Reset | Refused without the admin token and when proxied; with it, float refilled 750 -> 2,000, policies back to `ACTV` on-chain and in the DB |
| Storm payouts | `f_int` 0.6: interim 300 x 3; `f_fin` 1.0: true-up 200 x 3; storm marked `trued_up`; each policy paid 500 |
| Crash recovery | A `sent` intent that never landed was expired and rebuilt (attempt 2), paid exactly once |
| Evidence | Engine-style preimage written by Python accepted by the bot's re-hash |
| Reconciliation | Float opened at 2,000, ledger -1,500, chain 500; every ledger entry sums to 0 |
| Second run | After reset, the same policies were paid again in a new storm |
| Phone banner | "+$500 • PAID • Brays Bayou" appeared live when the payout confirmed |

**Devnet (Oct 10):** setup done (addresses in `state/devnet.json`) and G2 passed: reset refill,
engine-priced purchase, replay, payout with the evidence Memo, reconciliation, then a second run
([docs/handoff.md](../docs/handoff.md)).

Not yet tested: Phantom on a phone, Blinks.

## Setup (once)

```bash
cd chain
npm install
cp ../.env.example ../.env       # fill DATABASE_URL, SOLANA_RPC_URL, ADMIN_TOKEN, DEMO_WALLETS

npm run keygen                    # keypairs into ../secrets (git-ignored)
npm run airdrop                   # devnet SOL for the treasury; if refused, use faucet.solana.com
npm run setup:ausd                # aUSD mint + 1,000,000 to the treasury
npm run fund -- <phantom-address> # SOL + aUSD to every demo wallet (and your phone)
npm run setup:multisig -- 300     # 2-of-3 vault, seeded with a 300 aUSD reserve
npm run setup:bond                # bond mint
npm run test:token2022            # Hour-0 check: extensions, sizes, name/status round trip
npm run migrate                   # chain tables in Tiger (policy_pool, payout_intents)
npm run precreate -- <gaugeId>,<gaugeId> 10   # 10 unminted policies per demo gauge
npm run demo:bond -- 5000         # bond capital from the investor
npm run fund:bot -- 2000          # vault -> bot float through a 2-of-3 proposal (or let reset mint it)
```

Addresses are saved to `chain/state/devnet.json` (public; commit it).

## Run

```bash
npm run stack       # engine + chain service + bot + gateway, auto-restart (see deploy/README.md)
npm run server      # chain service alone on 127.0.0.1:8787
npm run bot         # storm payout bot alone
npm run engine      # the engine alone (FastAPI on 127.0.0.1:8000)
npm run gateway     # the gateway alone on :8080
npm run web:build   # dashboard for hosting (writes web/.env.production.local)
npm run tunnel      # quick Cloudflare tunnel to :8080
npm run status      # balances of every wallet and the vault
npm run demo:buy -- <gaugeId> holder1 a   # buy without a browser (flow a or b)
```

Keys the server needs: `issuer` (policy and bond mint authority, metadata authority) and
`treasury` (aUSD mint authority, for reset refills). The bot needs `bot` and `issuer`.

## How the money moves

- **Purchase:** only the offered payouts (`PAYOUT_OPTIONS`, default 250 and 500). One transaction
  creates the buyer's policy account, moves the premium to the vault, mints the policy, and
  removes the mint authority. A confirmer turns a confirmed mint into a `policies` row plus a
  premium ledger entry, booked to the run at the transaction's block time. An expired
  reservation is freed only once the chain shows the purchase never landed.
- **Payout:** per storm, interim `f_int * B` as each gauge's event appears, true-up
  `(f_fin - f_int) * B` after the engine closes the storm. Interim transactions also set the
  policy name and status to `PAID`. Every payout is signed, recorded as an intent, then sent.
- **Reset:** mints aUSD to refill vault and float to the snapshot, resets demo policies to
  `ACTV`, releases reservations whose purchase never landed, writes `seeded` ledger rows.
- **Ledger:** every entry balances and is written once per `entry_id` (retries write nothing).
  Money is booked to the latest run not reset, or `session` before the first Start after a reset.
- **Bond deposit:** refused (503) when the engine can't give a NAV. If confirmation times out,
  the confirmer loop books it later (in memory: a restart in that window needs a manual entry).

Ledger entries and reconciliation: see `docs/api.md`.

## Gotchas

- `@solana/web3.js` pinned to 1.98.4; never install `@solana/kit`.
- aUSD is classic SPL Token; policies are Token-2022. Derive token accounts with the right program.
- The vault is a PDA: its token account needs `allowOwnerOffCurve = true`.
- The Squads time lock applies to every proposal. Keep it short in demo mode.
- The bot pays only from its float. It warns once and waits if the float is short.
- Don't run `pkill -f` with a pattern that also appears in the same command line; it kills your own shell.

## Testing locally without devnet SOL

```bash
solana-test-validator --reset --url devnet \
  --clone-upgradeable-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf \
  --clone BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr
# Add --gossip-port 8011 if anything (e.g. the engine) already uses port 8000.
# SOLANA_RPC_URL=http://127.0.0.1:8899, then the setup above.
# Throwaway Postgres only: npm run migrate -- --dev-stub (creates v3 engine tables; never on Tiger).
```
