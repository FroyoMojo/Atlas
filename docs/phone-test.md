# Phone test (G1 item #11, plan v3.1 8.3)

Decides Flow A or Flow B. Takes 10 minutes once the site is reachable on its public URL (tunnel or domain).

1. Phantom on the phone: Settings -> Developer Settings -> **Testnet Mode on**, network **Solana Devnet**.
2. Copy the phone wallet address. On your laptop: `cd chain && npm run fund -- <phone-address>`
   (sends devnet SOL and 1,000 aUSD). Add the address to `DEMO_WALLETS` in `.env` and restart `npm run stack`.
3. In Phantom's built-in browser, open `https://your-domain.com/#/protect`, type `77096` (Meyerland).
4. Press **Connect wallet to continue**, connect, then press **Get protected**.
5. Record what happens:

| Result | Decision |
| --- | --- |
| Phantom shows the transaction, you approve, it confirms, the page switches to "You're protected" | **Flow A passes.** Keep `PURCHASE_FLOW=a` |
| Phantom warns about another signer, refuses, or the transaction fails signature checks | **Use Flow B.** Set `PURCHASE_FLOW=b` in `.env`, run `npm run web:build`, restart `npm run stack`, buy again |

6. Open `https://your-domain.com/#/phone?owner=<phone-address>` (or **My protection**): it shows **You're protected**.
7. Check Phantom's token list: does the policy show as "Atlas Policy ACTV"? Note yes or no (decision #10).
8. Write both results into `docs/decisions.md` (#10, #11). `npm run web:build` copies
   `PURCHASE_FLOW` into the dashboard, so there is nothing else to change.
9. Add the phone view to the home screen (Share -> Add to Home Screen) for the demo.
