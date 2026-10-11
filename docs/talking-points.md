# Talking points: live judging and demo video

Live judging is science-fair style: judges walk up, give us 3 to 5 minutes, and ask questions.
Lead with the problem and the phone, not the tech. Say each step in one or two sentences, then
show it. Numbers below come from the live site (atlasflood.us) on Oct 11.

## Before judges arrive (set-up, 2 minutes)

- Laptop: `https://atlasflood.us/#/` (map), a second tab on `#/readiness`, admin token saved (`#/admin`), so **Start replay** and **Reset** show.
- Phone: Phantom on devnet with a policy already bought on Meyerland, open at
  `https://atlasflood.us/#/phone?owner=<phone address>`. It should say **You're protected**.
- Third tab on the laptop: `#/proof`. Fourth tab: the fallback video.
- After every judge: press **Reset** on the map, wait for it to finish, confirm the phone shows **You're protected** again.

## The 30-second version (if a judge only has a moment)

"When Hurricane Harvey flooded Houston, renters waited weeks for help, and the first nights are
when you need a hotel and food. Atlas is emergency money when your neighborhood floods. You
protect your address for 90 days, about $20 for $500. When the river gauge next to you hits the
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
$500: about $20 for 90 days (read the number on screen; it's $22.50 with no community money and
drops as the pool fills). Why that price? Brays has hit that level twice in 19 years of USGS records.
One tap in your wallet and you're protected."
- Show an uncovered ZIP (77339, Kingwood) turning red: "We only cover areas next to a gauge we trust."

**4. The phone before the storm (10 s).**
"This is the phone of someone who's protected: the river is well below the line, flood level is 42 feet. Nothing to do."

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
"The money is stacked in layers. First, the community fund: premiums, the seed reserve and sponsor
donations. That covers normal bad years. Above it, investors hold a catastrophe bond that only loses
money in rare, big years, about one year in nine; pooled across seven flood markets it pays about 8%
for a 1.4% expected loss. If a storm were ever bigger than all of it, every household gets the same
share; in production a city or reinsurer backs that layer. We ran Harvey's real flood levels through
it: an $837k loss, paid in full." (If asked: only Houston is live; the pooling is simulated.)
- If asked "why would investors take that?": "Because they're only on the hook for the rare, huge
  storm, and they're paid more than it costs on average. Our first version had investors cover
  every bad year; our own data showed they'd lose money in 5 of 10 years, so we moved them up."
- If asked for numbers: "A cat bond is priced at about three times its expected loss. Our old layer
  lost 16 to 26% a year on average, so it would need a coupon of 50 to 80%. Pooling seven markets
  brings the expected loss to 1.4% a year and the coupon to about 8%. Houston alone would need
  about 45%, so one city can't carry a cat bond; seven can."
- Be straight about it: "That pooled result is a simulation. We assumed the regions flood
  independently, it's 16 to 18 years of data, and the three-times multiple is market convention.
  In the live demo only Houston exists, so the bond behind it would still take a Harvey."

**9b. Readiness (45 s). Laptop, `#/readiness`. The part we lead with.**
"Here is the question we think every flood product should answer: if the river crossed the line right
now, how much of my payout is actually funded? This pool is **34% ready**: it would pay each household
about **$169 of $500**. That is not a hidden number in a reserve report, it is on the page, per market.
Watch what changes it." [Run 1 has just paid about $169.] "Now a sponsor funds readiness from a
phone: $1,320." [Page goes to 100%; the Brays quote falls from about $20.80 to about $15.91.] "Same storm,
Run 2:" [Start again.] "Full $500. Preparing changed what the household got, and the price went down
too, because the community's own money now covers the risk, not an outside investor."
- Point at the grade badges and the simulated markets: "Atlas grades any gauge in the country from the
  same data: how often it floods, how many years we trust. Eleven candidates here, simulated, nothing
  sold. Four are A, two B, five C, and C means we would not sell it."
- If readiness pricing is off at judging, skip the price lines and keep the $169 to $500 story.

**10. How it's built (20 s, only if they're technical).**
- Tiger Data: more than 6.5 million river readings since 2007, compressed 6.5x in columnstore,
  continuous aggregates for the charts; prices come straight from that history.
- Solana: policies are non-transferable tokens; buying is one atomic transaction; payouts go out
  in seconds with the evidence hash in a Memo; capital sits in a 2-of-3 multisig.
- Vultr hosts the whole stack at atlasflood.us (GoDaddy Registry domain).

**11. Close (10 s).**
"Fixed, fast, provable emergency money. Next: a licensed partner (a city programme, nonprofit or
insurer) to offer it, and an on-chain program so no server decides to pay."

## Likely questions, short answers

- **Can't I just buy right before a storm?** "No. Protection starts 7 days after you buy, and sales close
  as soon as the National Weather Service issues a flood or hurricane watch for that area. In the Harvey
  replay a simulated flood watch closes sales a day before the river crosses. (The live demo has the wait set to zero
  so you can watch a payout.)"
- **If the flood is mild, do people get $500 for nothing?** "The trigger is the official moderate flood
  level, where homes and roads near the river start flooding, not a heavy rain. Everyone paid for it, and
  the price assumes it. A street can stay dry while the gauge floods, or the reverse: that's the trade for
  paying in minutes with no adjuster. Next step is tiered payouts: less for minor flooding, more for major."
- **Can one person buy a lot of policies?** "No: one policy in force per wallet. In production, address
  verification makes it one per household."

- **What does "ready" mean?** "Funds available divided by what we've promised, right now. 34% ready means
  each household would get about a third of its $500 if the river crossed the line this minute. It is the
  same share our engine applies in a storm, shown before the storm."
- **Why does the price fall as readiness rises?** "Part of the price pays outside capital for carrying risk.
  When the community's own money (premiums and donated sponsor funds) covers more of it, that part shrinks.
  Return-seeking bond capital does not lower the price."
- **Why does my price go up when more people buy?** "More promises against the same reserve means a less
  funded pool. Four buyers on Brays saw $16.69, $19.43, $20.33 and $20.77."
- **Isn't someone already doing this?** "Parametric flood cover exists for businesses (FloodFlash), for
  earthquake renters (Jumpstart) and in a New York City pilot. We found no open, on-chain, household-level
  flood product that publishes its own funded status and ties its price to preparedness. We can't prove a negative."
- **Why not just let a neighborhood insure itself?** "We tested it on the real record: Houston flooded three
  years running (2015 to 2017), and a self-funded pool paid only 25 to 80% of what was owed. Preparation helps,
  but a flood cluster needs outside money too."
- **Are the other markets real?** "No. They are simulated: priced and graded from public data, nothing sold."
- **Is the money real?** "Devnet test money. The donation is test aUSD."

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

Record the screen at 1440 wide with the phone mirrored on the right. Talk like you're showing a
friend, not reading. It's fine to paraphrase; the bracketed lines say what's on screen.

**[Map, top of the page]**
So in 2017, Hurricane Harvey flooded a huge part of Houston, a lot of it overnight. And if you
were renting, you were mostly on your own. Renters' insurance usually doesn't cover floods, and
the aid that does come takes weeks. But you need a hotel room that night.

That's what Atlas is for. It's a small payment that shows up as soon as your neighborhood floods.

**[Get protected: type 77096]**
Here's how you sign up. I'll put in a Meyerland ZIP code. It goes green, so I'm covered, and it
tells me exactly what would pay me: Brays Bayou hitting 42 feet. That's the flood level the
National Weather Service already uses.

**[Pick $500, open "Why $…?"]**
Five hundred dollars of protection is about twenty dollars for three months (say the number on
screen). And it shows you why: that river has hit that level twice in the last nineteen years.

**[Confirm in Phantom; the phone shows "You're protected"]**
One tap in my wallet, and that's it. My phone says I'm protected, and I can see the river is
nowhere near the line right now.

**[Map: press Start replay]**
Now let's see what happens in a real flood. This is Harvey's actual river data from 2017, five
days of it, sped up to about a minute and a half.

**[Dots turn orange, then red; the feed fills]**
Each dot is a river gauge. They go orange as the water rises... and Brays just crossed 42 feet.

**[Phone: "We've sent you $500"]**
And there it is on the phone. Five hundred dollars, already in the wallet. Nobody filed a claim
and nobody had to approve it. It also tells you what to do next: call 911 if you're in danger,
find a shelter, and go get a room.

**[Proof page: press Verify]**
The fair question is why anyone should trust that. Every payment is on Solana with a fingerprint
of the exact river reading that triggered it. When I hit Verify, my browser checks that
fingerprint itself. It matches.

**[Proof page: the Harvey section]**
And the money is stacked so it holds up. The community fund covers normal bad years. Investors
only cover a storm as big as Harvey, and a city or reinsurer sits above that. We ran Harvey through
it: paid in full.

**[Back to the map]**
That's Atlas. When your neighborhood floods, the money's already on its way. You can try it at
atlasflood.us.

Tips: do one dry run first and keep the cursor still while you talk. If one part lags, cut it in
editing instead of re-recording the whole thing.
