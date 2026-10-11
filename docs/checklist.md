# Submission checklist (deadline Oct 11, 1:00 pm CDT)

Status as of about 2:30 am CDT. Tick items as you go; push this file so we share one copy.

## Done

- [x] Hosted at https://atlasflood.us on Vultr (Caddy + systemd), HTTPS valid; `/health` and `/engine/health` ok; `POST /chain/reset` is 403 from outside.
- [x] New frontend deployed: map, Get protected, My protection, Proof, How it works (checked live: 77096 is covered, $22.50 for $500, "Why" shows 2 floods in 19 years).
- [x] Domain atlasflood.us through the GoDaddy Registry offer.
- [x] Devpost text: blanks filled from the live engine (`docs/devpost.md`): E[L] about $168k, K about $669k, Harvey $837k paid in full, bond takes $637k.
- [x] Talking points and video script (`docs/talking-points.md`); pitch deck drafted.
- [x] Engine tests 22/22, web typecheck and build clean.

## Must do (in this order)

1. [ ] **Run one full replay on the live site** (Zeke or Jesse). The live server has never run one (`/engine/replay/status` shows no run).
   Laptop: `https://atlasflood.us/#/admin`, paste the admin token, go to the map, press **Start replay**.
   Check: dots turn red, "households paid" goes up, the phone with a policy flips to "We've sent you $500",
   Proof shows the payout and **Verify** turns green. Then press **Reset** and check the phone shows "You're protected" again.
   If anything fails, send Jesse the screen and `journalctl -u atlas-stack -n 100` from the server.
2. [ ] **Preflight on the server** if not done since the redeploy:
   `cd /opt/atlas/chain && sudo -u atlas npm run preflight` (every FAIL must clear). Precreated policies for the 4 demo gauges must exist.
3. [ ] **Record the fallback video** (2 to 2.5 minutes) following `docs/talking-points.md`. Upload it (YouTube unlisted) for Devpost.
4. [ ] **Submit a Devpost draft by about 10:30 am**, then keep editing:
   - Title: Atlas. Tagline: the elevator pitch from `docs/devpost.md`.
   - About: paste the "About the project" section.
   - Built with: Solana, Token-2022, Squads, TimescaleDB / Tiger Data, Python, FastAPI, TypeScript, React, Vite, Leaflet, Vultr, Caddy.
   - Links: https://atlasflood.us and the GitHub repo. Video link.
   - Tracks: Best Overall, Best Pitch/Demo, Best Environment Hack, Solana, Tiger Data, GoDaddy Registry domain, Vultr.
   - Both teammates added to the submission.
5. [ ] **Confirm one number** (Zeke): readings count. Devpost says "more than 5.8 million"; if it is 6.5 million, change it.
6. [x] **Repo is public** (FroyoMojo/Atlas) and the README opens with what Atlas is and the live link.
7. [ ] **Rehearse the 30-second and full walkthrough** twice each, swapping who talks.

## At judging

- [ ] Laptop charged, phone charged, hotspot ready (venue Wi-Fi can fail).
- [ ] Admin token saved in the demo browser; phone on `#/phone?owner=<address>` showing "You're protected".
- [ ] Fallback video open in a tab.
- [ ] Reset after every judge.

## If something breaks

| Symptom | Fix |
| --- | --- |
| Site down | `ssh root@45.76.239.177 "systemctl restart atlas-stack"`; then `bash /opt/atlas/deploy/vultr/deploy.sh` |
| Replay starts but nobody gets paid | Phone policy must be on a demo gauge (Meyerland) and bought before Start; check the bot in `journalctl -u atlas-stack` |
| Phone balance stuck | Devnet RPC rate limit: wait 10 seconds or reload |
| Everything broken | Laptop fallback (`deploy/WINDOWS.md`) or play the video |
