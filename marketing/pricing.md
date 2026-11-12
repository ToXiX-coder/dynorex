# Pricing: a first price to learn from

Written 2026-11-11 with the `pricing` skill. A recommendation, not a decision: nothing is charged until the owner
(and a parent or guardian, who handles money) decides and payments exist. Evidence: the market research
(`buildmark/research/reports/Modified car history market.md`) and D-66. No Dynorex user has paid anything yet.

## The short version

| Who | What they pay | Why |
|---|---|---|
| Owners logging a build | Free, always | Logging alone doesn't support a business in this category (Carfax's own owner app is free); it's how records get made |
| Sellers | **$49 once per sale**, for the Sale kit | The sale is where the record is worth money, and the seller is already paying far more in fees |
| E-moto sellers | **$29 once per sale** (test) | A used e-moto sells for a fraction of an auction car; the same $49 is a bigger share of the price |
| Buyers | Free | The buyer opening the link is the proof the seller paid for; the transfer turns the buyer into the next owner on Dynorex |
| Shops | Free, always | They already pay $199 to $499 a month for shop software; the confirm link is a favor to their customer and a mention of their name |
| Dynorex+ | Keep $7.99/month or $59.99/year, don't lead with it | For active builders between sales (more vehicles, insights). The research puts a ceiling near $88/year for an enthusiast membership |

## What "the Sale kit" is (the paid moment)

The things a seller only needs when selling, all already built:

- the buyer's link (the full record, with the VIN or frame-number check),
- the listing build sheet (short ad and full sheet) and the for-sale PDF with its QR code.

**Never charge for the transfer code.** The record moving to the buyer is what makes the next owner a Dynorex user
and keeps the history alive. A fee there breaks the loop.

## Why $49 (and not $9 or $100)

- **Value side:** on enthusiast auctions the research puts the average sale near $43K, with buyer fees of 5%
  (minimum $250) and seller listing fees of $99 to $429. A documented build can sell far above guide value (one
  reported Forester: $29,000 against a $7,750 guide value). $49 is small next to any of that.
- **Alternative side:** the seller's free option is a folder of receipts and a text list. Consumer history reports
  sell for about $30 to $45, which is the price people already expect to pay for a report.
- **Not $9:** ultra-low prices bring signups from people who'd never pay a real price, and raising a price 5 times
  later is much harder than starting at the right one.
- **A round number:** $49 sits in the research's $30 to $100 range and is easy to say in an interview.

The e-moto $29 is a separate guess: used Sur-Rons and Talarias list for a few thousand dollars, so the price should
be a similar small share of the sale. Test it on its own; don't mix the answers with car sellers'.

## How to test it honestly, in order

1. **Beta (now): free for every seller, ask one fixed price.** After a real sale, ask the four questions in
   [outreach.md](outreach.md) section 2, always with **$49** (or **$29** for an e-moto). Same number for
   everyone, so the answers can be compared. Write the words down.
2. **What counts as a signal:** a seller who says yes *and* had a buyer open the link. A yes from a seller whose
   buyer never looked is politeness.
3. **First real charge:** once 10 or more beta sellers say yes, turn on payments and charge new sellers $49. The
   first 25 beta sellers stay free for life (they helped build it); say so up front.
4. **Read it:** what share of sellers who reach "Make a buyer's link" pay. If 8 in 10 or more pay without
   asking, try $79 for new sellers. If fewer than 2 in 10 do, ask the ones who stopped why before lowering it.

**Don't do:** a "Pay $49" button that takes no money, or "price shown, buy later" tricks. They read as fake and
break the honesty the whole product rests on.

## Things to check before charging anyone

- **App store rules:** a feature unlocked inside an iPhone or Android app usually has to be paid through Apple's
  or Google's in-app purchase, which takes a cut. RevenueCat (already planned) handles that. Check the current
  store rules before building. `[NEED: check App Store Review Guidelines 3.1 and Google Play's payments policy]`
- **Money and accounts stay with a parent or guardian** (the founder is 14).
- **Wording:** the Sale kit is never sold as making a car "verified". It shows what backs each entry, nothing more.

## Fill these in

- `[NEED: 10+ seller answers to "would you have paid $49 for this sale?"]`
- `[NEED: e-moto seller answers at $29]`
- `[NEED: owner and family decision to charge, and when]`
