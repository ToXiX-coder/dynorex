# Deferred until all phases are done

Owner decision, 2026-10-06: park these and come back to them after all phases are complete, in a final pass to
make Dynorex feel like a real app. Nothing here is half-built: each item is either off behind a flag, refused by
preflight, or not started.

## Owner decisions still open

- ~~D-47: private or invite-only clubs, and club moderators.~~ Built (D-58).
- D-48: turning on Torq chat (AI key, message limits, privacy-policy update).
- D-68: turning on receipt scan (same AI key, scan limits, Anthropic in the privacy policy); see
  [receipt-scan.md](receipt-scan.md).
- Earlier open items: D-04, D-05, D-07, D-17, D-18, D-19, D-24, D-26, D-27, D-32, D-34, D-40, B-07
  (see [decisions.md](decisions.md)).

## Launch blockers (preflight, Phase 6 verdict NO-GO)

- RevenueCat iOS and Android keys.
- Published Terms, Privacy and Community Guidelines URLs.
- Support email.
- Store listings and links; crash-free window on real devices.
- See [release/go-no-go.md](release/go-no-go.md).

## Needs a development or store build

- Background GPS for Line (separate consent and battery review).
- Interactive native Mapbox maps (`@rnmapbox/maps`); static map images work today.
- In-app QR scanning on devices (typing the code and the phone-camera link work today).

## Not started

- Marketplace payments: Stripe, the 5 % `dyno_fee`, shipping, disputes (needs payment compliance work first).
  Listings, offers and the offer chat are built as the Paddock Shop (D-56), behind the `marketplace` flag.
- Paddock extras: editing posts, push notifications for comments and likes, event photos.

## Still enforced meanwhile

- `line`, `paddock` and `marketplace` stay off in production; preflight fails a production build if any is on.
- Pitch mode (all features on, sample data) stays impossible in production builds.
