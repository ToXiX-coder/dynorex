# Phase 5 (Dynorex+) and pitch mode: status report

Date: 2026-10-05. **Code complete and tested locally; not yet run against real stores, RevenueCat, Supabase or a
phone.** Pitch mode was checked end to end in the browser.

## Built

**Database** (`supabase/migrations/20261009000000_phase5_dynorex_plus.sql`)

- `subscriptions` + append-only `subscription_events`; `apply_subscription_event()` state machine (idempotent,
  ordered, transfer-safe); `user_has_plus()` now = verified entitlement or staff/tester override.
- `my_subscription()`, `plan_capabilities()` (server-defined limits incl. route recordings and marketplace for v2).
- Advanced specs (`advanced_spec_estimate`), build analytics (`record_build_view`, `my_build_analytics`),
  Torq sticker reactions (`build_reactions`, RLS Plus-only, 60/h, public counts view), profile badge in
  `public_profiles`, daily expiring/expired notifications.

**Edge Functions**: `revenuecat-webhook`, `subscription-sync`, shared `_shared/revenuecat.ts`.

**App**

- Torq-led paywall `/plus`: store prices (list prices labeled when the store isn't reachable), comparison table
  with "(later)" rows, renewal + cancellation disclosure, restore, "Not now", terms link; honest states for
  "not on sale yet" (flag off) and web ("buy in the app"); success only after server confirmation.
- Settings › Dynorex+: server status in plain words (renews / ends / payment problem / expired / refunded),
  manage in the store, restore, see plans.
- Plan-limit messages now offer "See Dynorex+". Vehicle page: Dynorex+ insights (projection, per-category,
  analytics) or a locked card. Public build page: sticker reactions (locked picker with "Dynorex+ only" for
  free users). Profile badges. Subscription notifications are live in Settings.
- RevenueCat store adapter for iOS/Android; web adapter that never sells.

**Pitch mode** (docs/pitch-mode.md): `npm run pitch` / `npm run pitch:web` / EAS profile `pitch`. No sign-in,
in-memory sample backend following the server's rules, simulated purchase with on-screen "nothing is charged",
permanent PITCH MODE pill with reset. Refused in production builds.

## Checks run on this machine

| Check                                           | Result                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / format                       | pass                                                                                                                                                             |
| Vitest                                          | **193/193**: 74 database (12 Phase 5), 119 unit (incl. pitch mode rules)                                                                                         |
| Jest (screens)                                  | **42/42** incl. 6 paywall                                                                                                                                        |
| `expo export` android / ios / web + secret grep | all bundle; 0 hits (now also RevenueCat secret names)                                                                                                            |
| `expo install --check`                          | up to date                                                                                                                                                       |
| Browser, pitch mode, phone size                 | opens signed-in on sample data; Discover, public build, locked sticker → paywall → simulated purchase → sticker sent; vehicle insights unlock; no console errors |

Exit-gate coverage: forged client state can't bypass limits (DB tests); purchase / restore / duplicate webhook /
out-of-order / expiration / grace / billing retry / refund / revoke / transfer (DB tests); price and renewal
disclosures visible (screen tests); store compliance review documented (docs/subscriptions.md). Concurrent limit
checks use the Phase 3 advisory lock; a true two-connection race still needs real Postgres (CI).

## Not verified

- Real purchases, RevenueCat webhooks and sync, sandbox/refund flows on devices.
- Edge Functions have never executed. Notification scheduler not set up.

## Decisions to review (docs/decisions.md)

**D-32 RevenueCat** · D-33 pitch mode · **D-34 public Plus badge** · D-35 advanced specs scope ·
D-36 analytics counts signed-in views · D-37 downgrade keeps data · D-38 later perks not sold · D-39 sticker art.
