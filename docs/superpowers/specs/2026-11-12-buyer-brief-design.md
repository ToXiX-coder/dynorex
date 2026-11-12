# Buyer brief (D-76)

## Why

Reddit research (`marketing/reddit-research.md`, 2026-11-12) found that logging and even handing a record to the
next owner already exist elsewhere. What buyers say changes their mind is receipts, a shop's paper trail and service
history, and what they ask about is stock parts, emissions and (for e-motos) the battery. The buyer's link showed
all of that entry by entry, but a buyer had to read eleven cards to work out what was backed up and what to ask.

## What

One function, `buyerBrief(record, today)` in `src/domain/buyerBrief.ts`, reads a Build Record the way a buyer
does and returns:

- `facts`: counts taken from the record. Who fitted the mods (named shop, owner, not stated) and how many of the
  shop jobs the shop confirmed; receipts on file; services logged and the newest one; emissions-related parts by
  status (cars and motorcycles); the newest battery check (e-motos), marked as the owner's reading.
- `asks`: what the record leaves open, in a fixed order: flagged entries, shop work the shop hasn't confirmed, mods
  with no receipt and no shop confirmation, emissions parts with no CARB EO number, no service in over a year (or
  none), no battery check (e-motos), and whether the stock parts come with the vehicle. Each has a buyer wording
  and a seller wording.

`BuyerBrief` (`src/features/record/BuyerBrief.tsx`) shows it in two places:

- the buyer's link (`/history/<token>`): "Before you pay", the facts, then "Ask the seller";
- the owner's Build Record: "What a buyer will ask", the same gaps in the owner's words; hidden when there are
  none and after a sale.

## Not doing

- No score, grade or "trust rating". The brief counts and asks; it never rates the vehicle or the owner.
- No new data: no migration, nothing added to the record the buyer's link returns.
- No "stock parts kept" field on a mod yet (needs a column and a migration; worth doing once D-74's is applied).

## Rules kept

Never "verified", "certified" or "guaranteed" (tested). A battery figure is the owner's reading. A missing
receipt is a question for the seller, not a mark against them. E-motos get no emissions line.

## Tests

`tests/unit/buyerBrief.test.ts` (12) and `tests/component/buyerBrief.test.tsx` (3), written before the code.
Checked in the pitch demo at phone width on the WRX and the Sur-Ron, owner view and buyer view.
