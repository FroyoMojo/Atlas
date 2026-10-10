# Handoff

Read this first when you pick up the repo. Update the **Status** and **Next steps** sections whenever you stop working.

## Status (Oct 10, about Hour 4.5)

- Build plan **v3.1** is current: [docs/plan/Atlas_Build_Plan_v3.1.pdf](plan/Atlas_Build_Plan_v3.1.pdf). Code and docs follow it; its fixes (V1 to V17) are logged in [decisions.md](decisions.md).
- **Built and tested on a local validator (Jesse):**
  - [`chain/`](../chain/README.md): chain service (purchase Flow A and B, bond, reset with refill, balances), storm payout bot (interim and true-up, intents, crash recovery), ledger writes.
  - [`web/`](../web/README.md): map, gauge, pool, verify and phone view with the payout banner; Start/Reset behind the admin token; mock engine in v3.1 shapes.
  - [`deploy/`](../deploy/README.md): laptop hosting with a gateway and Cloudflare Tunnel (no Vultr); routing tested locally.
  - [`tools/g2_storm.py`](../tools/g2_storm.py): opens a storm for G2; tested with interim 0.6 and true-up 1.0.
- **Not done:** devnet setup, public URL and domain, phone test, and Ezekiel's engine (`data/`, `engine/`).
- Commits go straight to `main` (no pull requests).

## Key times

| When | What |
| --- | --- |
| Oct 10, 1:00 pm CDT | Hacking started (Hour 0) |
| Now (overdue) | Gate G1: every check in `decisions.md` answered, including the phone test |
| Hour 6.5 (7:30 pm) | Gate G2: a storm pays a real devnet policy; ledger and chain agree |
| Hour 16 (5:00 am) | Gate G3: feature freeze; start, run, reset, run again on the hosted URL |
| Hour 19.5 (8:30 am) | Target submission |
| Oct 11, 1:00 pm CDT | Devpost deadline (Hour 24) |

## Who owns what

| Person | Owns |
| --- | --- |
| Ezekiel (data and risk) | Tiger schema, ingestion and cache, event and storm logic, `f_int` and `f_fin`, replay and run clock, pricing, scenarios, simulated book, ledger reads and reconciliation, FastAPI (read-only), NWS freeze. Every number on stage. |
| Jesse (chain, product, hosting) | Chain service and all signing, aUSD and policy mints, Squads vault, payout bot, Memo evidence, ledger writes, dashboard and phone view, laptop hosting, Cloudflare Tunnel, domain. The live demo flow. |
| Both | Gates, pitch, Q&A, fallback video, Devpost write-up |

## Rules we agreed

- Blocked for 45 minutes: say so and switch to the fallback (plan section 12).
- Upgrades: at most one after G2 (Solana Pay QR, only with Flow A). Switchboard, spending limit and Blink are cut.
- Nothing on stage calls USGS live. Everything reads from Tiger or `/data/cache/`.
- Python never builds or signs a Solana transaction.
- Never commit secrets. Keys live in `secrets/` and `.env`, both git-ignored.
- Press **Reset** before every judge group and check the reconciliation badge is green.

## Next steps

- [ ] Jesse: fund the treasury at faucet.solana.com; the devnet setup then runs and `chain/state/devnet.json` is committed.
- [ ] Jesse: laptop hosting, tunnel URL, then the domain on Cloudflare ([deploy/README.md](../deploy/README.md)).
- [ ] Jesse: phone test, Flow A or B ([phone-test.md](phone-test.md)); record #10 and #11 in [decisions.md](decisions.md).
- [ ] Ezekiel: share the Tiger connection string, the four `demo_ready` gauge IDs and one `ADMIN_TOKEN`.
- [ ] Jesse: on the demo laptop, `npm run migrate` and `npm run precreate -- G1,G2,G3,G4 10` with those gauge IDs.
- [ ] Ezekiel: schema from plan v3.1 section 6.2 (including `runs.opening_vault`, `runs.opening_float`); preimage per [evidence.md](evidence.md), checked against the test vector.
- [ ] Ezekiel: set `storms.f_int` at storm open and `f_fin` + `closed` at close; the bot pays from those.
- [ ] Ezekiel: `GET /replay/status`; `/replay/start` records opening balances from `GET /chain/balances`; `/replay/reset` calls `POST /chain/reset` with `X-Admin-Token`.
- [ ] Both: G2 with [`tools/g2_storm.py`](../tools/g2_storm.py) on devnet.

## Accounts and addresses

Fill these in as they are created. Public addresses only; never paste private keys here.

| Item | Value |
| --- | --- |
| Hosted URL | |
| Domain | |
| Tunnel URL (trycloudflare) | |
| Tiger Cloud service | (connection string in `.env` only) |
| `aUSD` mint | |
| Squads multisig | |
| Squads vault | |
| Bot public key | |
| Bond token mint | |
| Demo policyholder wallets | Jesse phone (Phantom): `72t74q3nTQDM6t9CqNMDhSiL9ykzxPnoQKudDs3Bu5co` |
| Investor wallet | |
