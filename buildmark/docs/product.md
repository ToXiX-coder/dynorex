# Buildmark: product rules

Built 2026-10-16 from the research in `research/reports/Modified car history market.md`. Its verdict: logging mods
and sharing a link is already done by several small apps; what nobody offers is a record a skeptical buyer can
weigh (installer confirmation, measured results tied to the install, compliance status, an audit trail), delivered
where modified cars are sold. The wedge is the seller at the moment of an enthusiast sale.

## Rules the code enforces

| Rule | Why | Where |
|---|---|---|
| Nothing is ever called "verified". Every label says who said what, and when. | A platform's own "verified" claim isn't covered by Section 230, and rivals have already cheapened the word. | `src/domain/evidence.ts`; a test scans `src/` for the word |
| Evidence is shown as a four-step ladder: owner-entered, receipt attached, part identified, shop-confirmed. | Buyers need to see how much each entry rests on. | `evidence()` |
| Entries can't be deleted or silently edited. An edit keeps the old version and needs a reason; a withdrawal stays visible. | A record a seller can scrub is worthless to a buyer. | `revise_entry`, `withdraw_entry`; no UPDATE/DELETE grants |
| A shop confirmation records the revision it saw. A later edit shows "Edited after the shop confirmed it". | Stops a confirmed entry from being changed underneath the shop. | `confirmations.rev` |
| Shops are never asked to confirm emissions-related work unless the part has a CARB EO number, or the work returned the car to stock. | A confirmation would be a dated admission against the shop (CARB holds installers liable; CARB fined COBB $1M in Aug 2026). | `confirm_block` / `confirmBlock` |
| Emissions-related parts carry a status: CARB EO (with number), off-road use only, or not recorded. | Honest labels; buyers in CARB states care. | `entries_compliance_fits` |
| The VIN never leaves the owner's account. Buyers can only ask "does this VIN match?", 10 times an hour per link. | Privacy, and proof the record belongs to the car in front of them. | `check_vin` |
| The VIN can be set once and never changed. | Otherwise a record could be moved onto a different car. | `set_car_vin` |
| A transfer needs the code from the seller **and** the VIN off the car; 5 wrong VINs close the code; codes are stored hashed. | A leaked code alone can't take a record. | `start_transfer`, `claim_transfer` |
| After a sale, the seller keeps a read-only copy of what was logged up to the sale, and nothing after. | The seller's own history, without seeing the new owner's. | `read_until` |
| A car that has changed hands can't be deleted. | A seller can't erase a record a buyer relied on. | `delete_car` |
| Upload times come from the server, and each file's SHA-256 is recorded. Removing a file leaves a visible note. | Receipts can't be backdated or swapped silently. | `add_receipt`, `remove_receipt` |
| Entries logged more than 30 days after the work are flagged, as are odometer readings lower than an earlier one. | Signals a buyer should ask about. | `evidence()`, `odometer.ts` |
| Costs and notes are private to the owner. | Sellers shouldn't have to show what they paid. | `public_record` leaves them out |
| "Carfax" never appears in the product, its name, domain or ads. | Carfax enforces its mark (it cancelled "AAA CarFacts"). | — |

## Not built yet

- **Payments.** The plan is free logging, with sellers paying once when they export a listing-ready record. Nothing
  charges money yet.
- **Receipt images for buyers.** Buyers see that a receipt exists, its upload date and fingerprint, but not the image.
  That needs short-lived signed links from an Edge Function, and a way for owners to blur addresses first.
- **A shop identity check.** A confirmation records what the person who opened the link typed. Next steps: shop
  accounts tied to a business email or phone, and showing how many confirmations a shop has given.
- **Account deletion and data export** screens (the database cascades on account deletion).
- **Listing integrations** with auction sites, and an insurer-facing export.

## Before launch

- Check the name for trademark conflicts.
- A lawyer should review: whether to accept records of known off-road-only parts at all; the disclaimer wording;
  whether insurer data deals would make records "consumer reports" under the FCRA.
- Test with 20–30 sellers of modified cars on enthusiast auction sites before building more (the research's
  recommended next step).
