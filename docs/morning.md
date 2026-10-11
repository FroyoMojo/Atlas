# Morning runbook (Oct 11): wake up → submitted by 1:00 pm CDT

Read top to bottom. Every step says who does it. Commands are copy-paste.

## What changed overnight (all pushed to `main`, tests green)

- **Audit fixes** (four parallel reviews of the whole repo, every finding checked):
  - Phone no longer says "We've sent you $0" after Reset.
  - Nobody can lock a demo wallet out of buying.
  - A slow devnet no longer shows "failed" on money that actually moved.
  - Reset can't double-mint or overlap.
  - The Start-replay HTTP 500 causes are fixed (missing DB columns, dropped idle connections).
  - Error page instead of a blank screen; phone-width layout fixed.
  - Docs cleaned (no TODOs in Devpost, new server IP, consistent numbers).
- **No buying once a storm is coming:**
  - 7-day waiting period outside demo mode (`WAITING_DAYS`).
  - Live sales freeze on NWS flood/hurricane watches and warnings (`LIVE_FREEZE`).
  - One policy per wallet.
- **Money safety:**
  - A vault scan books any donation or bond deposit the server missed (restart, or a wallet that sent it itself).
  - No double interim across two storms.
  - Failed payouts stop retrying after 5 tries.
- **Markets page:** clean names for simulated rivers; grade C rivers say "not offered" instead of showing a price.
- **Tests:** engine 35 (was 22, adds readiness and freeze), data 8. Chain and web typecheck and build clean.
- **Pitch:**
  - Layered-money story everywhere: community fund first, a pooled catastrophe bond only for Harvey-size storms, public backstop.
  - Deck slide 8 redone.
  - Q&A for "can't I buy right before a storm?", "mild flood", "many policies".

## 1. Deploy once (Zeke, about 5 min)

Not while a replay is running (the script now refuses).

```bash
ssh root@45.76.239.177 "bash /opt/atlas/deploy/vultr/deploy.sh"
```

Then check `https://atlasflood.us/engine/health` says ok and the Markets page loads.

## 2. Server settings check (Zeke, 2 min)

```bash
ssh root@45.76.239.177 "grep -E '^(DEMO_MODE|DEMO_WALLETS|WAITING_DAYS|LIVE_FREEZE|READINESS_PRICING|SNAPSHOT_VAULT|SEED_RESERVE|MAX_DONATION)=' /opt/atlas/.env"
```

| Setting | Should be | Why |
| --- | --- | --- |
| `DEMO_MODE` | `true` | Waiting period 0 so the replay can pay |
| `DEMO_WALLETS` | every demo wallet, comma-separated | **Empty now refuses everyone** (it used to accept everyone) |
| `WAITING_DAYS` | empty | Empty = 0 in demo mode |
| `LIVE_FREEZE` | `true` | **Set `false` for judging if the NWS puts a flood watch on Houston today**: buying happens before Start, when the live freeze applies |
| `READINESS_PRICING`, `SNAPSHOT_VAULT`, `SEED_RESERVE` | per `docs/readiness.md` | The live quote moves with readiness (it was $20.16 at 5 am, not $22.50) |

Check for a live NWS alert at Brays (should print `[]`):

```bash
curl -s -A "atlas" "https://api.weather.gov/alerts/active?point=29.6972,-95.4122" | python3 -c "import json,sys;print([f['properties']['event'] for f in json.load(sys.stdin)['features']])"
```

## 3. Baseline replay on the live site (Jesse + Zeke, 15 min). Nothing counts until this works

1. Laptop: `https://atlasflood.us/#/admin`, paste the admin token, then go to the map.
2. Phone: Phantom (Devnet), a demo wallet with a Meyerland policy, open `https://atlasflood.us/#/phone?owner=<address>`. It should say **You're protected**.
3. Press **Start replay**: dots turn orange then red, and the phone flips to **We've sent you $…**
4. **Proof** tab: press **Verify** on the payout and check it turns green. The money card should say *Matches the blockchain*.
5. Press **Reset** and check the phone shows **You're protected** again.

If anything fails, send the screen plus `ssh root@45.76.239.177 "journalctl -u atlas-stack -n 150 --no-pager"`.

## 4. Readiness demo (Zeke's runbook, `docs/readiness.md`, Production runbook)

Two changes from last night:
- **After Reset, don't buy again.** The four policies come back active, and one policy per wallet now refuses a second buy. The runbook is updated.
- **Reset only tops money up.** After a donation rehearsal the vault stays high, so re-run `npm run shrink:vault -- 600` before the next donation demo.

## 5. Fallback video (Jesse, 30 min), then Devpost (both, by 10:30 am)

- **Script:** `docs/talking-points.md`, "Demo video script". Say the price you see on screen.
- **Devpost:** follow `docs/checklist.md` step 4. Paste "About the project" from `docs/devpost.md`, add both teammates, the video link, the site and the repo.
- **Deck:** https://claude.ai/artifact/DzQ6cy2Cd33tyeN7LTMmKM. Share it with Zeke from its Share menu.

## 6. Freeze (after the last rehearsal)

No more deploys: a deploy briefly blanks open tabs. Rehearse the 30-second version and the full walkthrough twice each.

## Judging kit

- **Hardware:** laptop and phone charged, hotspot ready.
- **Browser state:**
  - admin token saved in the demo browser;
  - phone on `#/phone?owner=…` showing **You're protected**;
  - fallback video open.
- **Between judges:** press Reset (and shrink the vault if you showed a donation).

## Known, not fixed (fine for the demo; mention only if asked)

- **Unlocked RPC key:** if anyone sets `WEB_RPC_URL` to a keyed Helius URL that isn't locked to the domain, the key ships in the page.
- **Hard-coded investor numbers:** the Invest page's risk figures are written into the page, not read from the engine. Check they match the "Harvey-size storms only" story.
- **Basis risk:** the payout follows the gauge, not your street. Say it before a judge does.
