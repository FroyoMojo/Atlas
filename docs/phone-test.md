# Phone test (G1 item #11, plan v3.1 8.3)

Decides Flow A or Flow B. Takes 10 minutes once the site is deployed.

1. Phantom on the phone: Settings -> Developer Settings -> **Testnet Mode on**, network **Solana Devnet**.
2. Copy the phone wallet address. On your laptop: `cd chain && npm run fund -- <phone-address>`
   (sends devnet SOL and 1,000 aUSD). Add the address to `DEMO_WALLETS` on the server and redeploy.
3. In Phantom's built-in browser, open `https://your-domain.com/#/gauge/<demo-gauge-id>`.
4. Connect the wallet, press **Buy**.
5. Record what happens:

| Result | Decision |
| --- | --- |
| Phantom shows the transaction, you approve, it confirms, the success line appears | **Flow A passes.** Keep `PURCHASE_FLOW=a` |
| Phantom warns about another signer, refuses, or the transaction fails signature checks | **Use Flow B.** Set `PURCHASE_FLOW=b` in `/opt/atlas/.env`, redeploy, buy again |

6. Open `https://your-domain.com/#/phone?owner=<phone-address>`: the policy shows **ACTIVE**.
7. Check Phantom's token list: does the policy show as "Atlas Policy ACTV"? Note yes or no (decision #10).
8. Write both results into `docs/decisions.md` (#10, #11). `deploy.sh` sets the web app's
   `VITE_PURCHASE_FLOW` from `PURCHASE_FLOW`, so there is nothing else to change.
9. Add the phone view to the home screen (Share -> Add to Home Screen) for the demo.
