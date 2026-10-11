# Demo laptop setup on Windows, step by step

> **Fallback only.** The live site runs on the Vultr server ([vultr/README.md](vultr/README.md)).
> Use this page to run the demo from Zeke's laptop if the server fails, with the trycloudflare URL
> from step 8. Don't change the domain's DNS.

For Zeke's Windows laptop. Every command is for **PowerShell** (Start menu -> type
"PowerShell" -> open it; not "Command Prompt"). Copy one block at a time. About 30 minutes,
most of it installs. You need: the laptop kit zip (`atlas-laptop-kit.zip`) and the Tiger
connection string.

## 1. Install the tools (once)

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
winget install --id Cloudflare.cloudflared -e
```

Accept the prompts. Then **close PowerShell and open a new one** (so it sees the new
programs), and allow npm to run in PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y`. Check everything is there; each line should print a version:

```powershell
git --version; node --version; py --version; cloudflared --version
```

(If `winget` is missing, install the same four from git-scm.com, nodejs.org (LTS),
python.org (tick "Add python.exe to PATH") and Cloudflare's cloudflared releases page.)

## 2. Get the code

```powershell
cd ~
git clone https://github.com/FroyoMojo/Atlas.git
cd Atlas
```

You are now in `C:\Users\<name>\Atlas`: the **repo folder**. Every later step starts here.

## 3. Unpack the kit (keys and `.env`)

Assuming the zip is in Downloads:

```powershell
Expand-Archive ~\Downloads\atlas-laptop-kit.zip -DestinationPath $env:TEMP\kit -Force
Copy-Item $env:TEMP\kit\atlas-laptop-kit\env.laptop .env
New-Item -ItemType Directory -Force secrets | Out-Null
Copy-Item $env:TEMP\kit\atlas-laptop-kit\secrets\*.json secrets\
Get-ChildItem -Force secrets | Measure-Object | Select-Object Count    # should say 10
```

Now open `.env` and paste the Tiger connection string:

```powershell
notepad .env
```

Replace `PASTE_TIGER_CONNECTION_STRING_HERE` (on the `DATABASE_URL=` line) with the string from
Tiger, starting `postgres://`. Save and close. Leave `PUBLIC_BASE_URL` for step 8.

## 4. Install the project's packages (once)

```powershell
cd chain; npm install; cd ..
cd web; npm install; cd ..
py -m pip install -r engine\requirements.txt
```

Warnings are fine; red `ERR!` lines are not.

## 5. Create the database tables (once; safe to repeat)

```powershell
cd chain
npm run migrate
```

Expect `applied engine/sql/schema.sql` and `applied chain/sql/001_chain_tables.sql`.

## 6. Gauges and history

Nothing to do: Tiger already holds the gauges, triggers, history and simulated book
([data/README.md](../data/README.md)). Don't re-run the loaders on the demo laptop.

## 7. Pre-create the policies (once)

```powershell
cd ~\Atlas\chain
npm run precreate -- 08075000,08073700,08069000,08068500 8
```

(The four demo gauges: Brays, Buffalo at Piney Point, Cypress Creek, Spring Creek. Each policy
costs the issuer about 0.005 devnet SOL. Skip this if the server already pre-created policies
and `npm run preflight` shows free mints.)

## 8. Public URL (keep this window open)

Open a **second** PowerShell window:

```powershell
cd ~\Atlas\chain
npm run tunnel
```

After a few seconds it prints a line with `https://<random-words>.trycloudflare.com`. Copy that
URL. Back in the **first** window:

```powershell
notepad ..\.env
```

Set `PUBLIC_BASE_URL=https://<random-words>.trycloudflare.com` (no slash at the end). Save.
If you restart the tunnel, the URL changes: update this line and restart step 9.

## 9. Build the dashboard and start everything

In the first window (in `~\Atlas\chain`):

```powershell
npm run web:build
npm run stack
```

`stack` runs four things with colored labels: `engine`, `chain`, `bot`, `gateway`. Leave this
window open; `Ctrl+C` stops everything.

## 10. Check it (third window)

```powershell
cd ~\Atlas\chain
npm run preflight
```

It ends with `READY` or `NOT READY` and says what to fix for each FAIL. Run it again after any
change, and before every judging round.

## 11. Open the dashboard and press Reset

In the browser, open the tunnel URL. Go to `<tunnel URL>/#/admin`, paste the `ADMIN_TOKEN` value
from `.env`, and save. The Map page now shows **Start replay** and **Reset**. Press **Reset**
once: it fills the vault and the payout float on devnet (about 10 seconds).

## 12. Before judging

- Laptop plugged in. Settings -> System -> Power -> Screen and sleep -> **Never** (both).
- The `stack` and `tunnel` windows open; phone hotspot ready if the Wi-Fi drops.
- `npm run preflight` shows READY.
- Reset, buy one backup policy from a demo wallet, Start, and watch a full run.

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| `npm : ... running scripts is disabled` | Step 1: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `'py' is not recognized` | Reinstall Python from python.org with "Add python.exe to PATH" ticked, open a new PowerShell |
| `engine` line says "No Python with the engine's packages" | `py -m pip install -r engine\requirements.txt` from the repo folder |
| `DATABASE_URL is not set` | `.env` is not in the repo folder, or is named `.env.txt`: `Get-ChildItem -Force` in `~\Atlas` must list `.env` |
| `Missing keypair ...` | The 10 `.json` files are not in `~\Atlas\secrets` |
| Tunnel URL shows an error page | The `stack` window is not running, or was started before the tunnel URL changed; restart `npm run stack` |
| preflight: `0 free policy mints` | Step 7 for that gauge |
| Reconciliation not green | Press Reset |
