# Talking points: live judging and demo video

Live judging is science-fair style: judges walk up, give us 3 to 5 minutes, and ask questions.
Lead with the problem and the phone, not the tech. Say each step in one or two sentences, then
show it. Numbers below come from the live site (atlasflood.us) on Oct 11.

## Before judges arrive (set-up, 2 minutes)

- Laptop: `https://atlasflood.us/#/` (map), admin token saved (`#/admin`), so **Start replay** and **Reset** show.
- Phone: Phantom on devnet with a policy already bought on Meyerland, open at
  `https://atlasflood.us/#/phone?owner=<phone address>`. It should say **You're protected**.
- Second tab on the laptop: `#/proof`. Third tab: the fallback video.
- After every judge: press **Reset** on the map, wait for it to finish, confirm the phone shows **You're protected** again.

## The 30-second version (if a judge only has a moment)

"When Hurricane Harvey flooded Houston, renters waited weeks for help, and the first nights are
when you need a hotel and food. Atlas is emergency money when your neighborhood floods. You
protect your address for 90 days, about $22 for $500. When the river gauge next to you hits the
official flood level, $500 lands in your phone in seconds. No claim, no adjuster. Watch: this is
Harvey's real river data, replayed."

## The full walkthrough, step by step

**1. The problem (15 s).**
"In Harvey, the water came into people's homes in a single night. Most renters' insurance
doesn't cover flood, and flood claims and disaster aid take weeks. The first 72 hours, when you
need a room, food, or you've missed a shift, are exactly when nothing pays."

**2. What Atlas is (10 s).**
"Atlas is a fixed emergency payment for the first days of a flood. Not property insurance, not a
bet: residents only, one per household, and it pays because a public measurement crossed a line,
not because someone inspected your home."

**3. Get protected (30 s). Phone or laptop on `#/protect`.**
"You type where you live. 77096, Meyerland: green, you're covered. It tells you exactly what pays
you: Brays Bayou reaching 42 feet, the National Weather Service's moderate flood level. Pick
$500: $22.50 for 90 days. Why $22.50? Brays has hit that level twice in 19 years of USGS records.
One tap in your wallet and you're protected."
- Show an uncovered ZIP (77339, Kingwood) turning red: "We only cover areas next to a gauge we trust."

**4. The phone before the storm (10 s).**
"This is the phone of someone who's protected: the river is at 17 feet, flood level is 42. Nothing to do."

**5. Start the replay (10 s). Map, press Start replay.**
"Now we replay Hurricane Harvey: five days of real 15-minute river readings from 2017, squeezed
into 90 seconds. The card shows the real date and time in 2017."

**6. Watch the flood arrive (30 s).**
"Each dot is a USGS gauge. Grey is normal, orange is rising, red is flooding. The live feed says
it in plain words. Brays Bayou has just crossed 42 feet for two readings in a row: that's the trigger."

**7. The money moment (15 s). Point at the phone.**
"And here's the phone: Flood detected in Meyerland, we've sent you $500. It's already in the
wallet. Then it tells you what to do right now: call 911 if you're in danger, find a shelter,
use the money for a room or food."

**8. Proof (30 s). Laptop, Proof tab.**
"Why should anyone trust this? Every payout is on Solana with a fingerprint of the exact river
reading that triggered it. Press Verify: your browser fetches the transaction, recomputes the
fingerprint from the USGS reading, and they match. And the money set aside matches the blockchain."

**9. Can it survive another Harvey? (20 s).**
"We stress-tested a 2,000-policy book with Harvey's real flood levels. An $837k loss, paid in
full: the premium reserve covers the first $200k, and catastrophe-bond investors cover the rest.
They earn the premiums in normal years for taking that risk."

**10. How it's built (20 s, only if they're technical).**
- Tiger Data: more than 5.8 million river readings since 2007, compressed 6.5x in columnstore,
  continuous aggregates for the charts; prices come straight from that history.
- Solana: policies are non-transferable tokens; buying is one atomic transaction; payouts go out
  in seconds with the evidence hash in a Memo; capital sits in a 2-of-3 multisig.
- Vultr hosts the whole stack at atlasflood.us (GoDaddy Registry domain).

**11. Close (10 s).**
"Fixed, fast, provable emergency money. Next: a licensed partner (a city programme, nonprofit or
insurer) to offer it, and an on-chain program so no server decides to pay."

## Likely questions, short answers

- **Why blockchain?** "Speed and proof. The payout settles in seconds at near-zero cost, and
  anyone can check that it followed the rule. A bank transfer can't carry its own evidence."
- **What if the gauge is near me but my street didn't flood (or the reverse)?** "That's basis
  risk, the honest trade-off of paying on a measurement. We picked moderate flood stage and only
  cover areas next to a reliable gauge. Next step: rainfall and multi-gauge triggers."
- **What if a gauge breaks mid-storm?** "It happens: in Harvey some gauges went dark for up to 99
  hours. We excluded gauges with big gaps, and we reject spikes that jump and come straight back."
- **How did you price it?** "How often each gauge reached flood level in comparable USGS records
  (we cut the record where USGS flags a datum change), turned into a 90-day probability, plus a
  load and the cost of the capital needed for a Harvey year."
- **Who pays for this in real life?** "Renters directly at about $22 to $58 a quarter, or a city,
  employer or nonprofit buying it for residents. The product is the same either way."
- **Is it legal?** "This is a devnet prototype with test money. In production it's sold through a
  licensed partner; parametric policies like this already exist for cities and farmers."
- **Could it double-pay?** "No. Every payout is recorded before it's sent, and after a crash the
  bot settles every recorded transaction before building a new one."
- **What happens if money runs short?** "Everyone in the storm gets the same share right away and
  the rest when the storm ends. Order of crossing doesn't matter."
- **Is the trigger centralized?** "Today our bot decides, and the Memo makes it auditable. Next is an
  on-chain program plus an oracle so the rule is enforced, not just checkable."

## Demo video script (about 2 minutes 30)

Record the screen at 1440 wide with the phone mirrored on the right. Voice over, calm and plain.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00 to 0:15 | Map hero, "Emergency money when your neighborhood floods." | "In 2017 Hurricane Harvey flooded Houston overnight. Renters waited weeks for help. Atlas is emergency money for the first days of a flood." |
| 0:15 to 0:45 | `#/protect`: type 77096, green check, pick $500, $22.50, open "Why $22.50?", confirm in Phantom | "Type where you live. Meyerland is covered: we pay when Brays Bayou reaches 42 feet, the official flood level. Five hundred dollars of protection is $22.50 for 90 days, priced from 19 years of USGS river data. One tap in your wallet." |
| 0:45 to 0:55 | Phone: You're protected, river at 17 ft vs 42 ft | "Now you're protected. Nothing else to do." |
| 0:55 to 1:35 | Map: press Start replay; dots turn orange then red; live feed fills | "This is Hurricane Harvey's real river data, five days replayed in 90 seconds. Gauges turn orange as the water rises, and red when they cross flood level. Brays Bayou crosses 42 feet..." |
| 1:35 to 1:50 | Phone flips to "Flood detected · We've sent you $500" | "...and five hundred dollars lands on the phone, in seconds, with what to do right now." |
| 1:50 to 2:15 | Proof page: press Verify on the payout, green Verified sentence; money card | "Every payout is on Solana with a fingerprint of the river reading that triggered it. Your browser recomputes it and checks the match. The books match the chain." |
| 2:15 to 2:30 | Proof: Harvey stress test; end on the map | "A Harvey-sized year is paid in full: premiums first, then catastrophe-bond investors. Atlas: emergency money when your neighborhood floods. atlasflood.us." |

Tips: do one dry run first; keep the cursor still while talking; if a step lags, cut it in editing
rather than re-recording everything.
