# Dynorex+ subscriptions

## How it works

1. The app shows the paywall (`/plus`) with the store's localized prices, the plan comparison, and the renewal
   and cancellation terms before the buy button. Purchases use Apple / Google in-app purchase through
   RevenueCat (`react-native-purchases`), with the Dynorex account id as the RevenueCat app user id.
2. RevenueCat validates the receipt with the store and sends events to the `revenuecat-webhook` Edge Function,
   which checks RevenueCat's Authorization value and calls `apply_subscription_event()` (service role only).
3. After a purchase or "Restore purchases", the app calls `subscription-sync`, which reads the subscriber from
   RevenueCat's REST API **server-side** and records it. The app shows "You're on Dynorex+" only when the server
   says so; otherwise "Confirming your purchase" with "Check again".
4. Every Plus capability is decided in the database (`user_has_plus()`): vehicle/mod limits, advanced specs,
   build analytics, sticker reactions (RLS), the profile badge. The app never sends or trusts a "premium" flag.

State machine (`public.subscriptions`): active · cancelled (paid through `expires_at`) · grace (billing problem,
entitled until `grace_until`) · billing_retry · expired · refunded · revoked. Duplicate webhook deliveries are
no-ops (event id), late events never roll state back (event time), restoring on another account moves the
subscription. Every event is kept in the append-only `subscription_events` log.

## Operator setup (B-03: needs store and RevenueCat accounts)

1. App Store Connect and Google Play Console: create auto-renewing subscriptions `dynorex_plus_monthly`
   ($7.99) and `dynorex_plus_annual` ($59.99) in one subscription group; on Play, base plans under those ids.
2. RevenueCat: project, both apps, entitlement **`plus`** with both products, a default offering with the
   Monthly and Annual packages. Copy the public SDK keys to `EXPO_PUBLIC_REVENUECAT_IOS_KEY` /
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. RevenueCat webhook: URL `https://<project>.supabase.co/functions/v1/revenuecat-webhook`, Authorization value =
   a long random string, also stored as Edge Function secret `REVENUECAT_WEBHOOK_AUTH`. Secret API key as
   `REVENUECAT_SECRET_KEY`. Staging only: `ALLOW_SANDBOX_PURCHASES=true`.
4. Schedule `select public.queue_subscription_notifications()` daily (Supabase Cron) for the
   "ends in 3 days" / "expired" notifications.
5. Turn on the `subscriptions` flag for the build. Test with sandbox accounts: buy, restore on a second device,
   cancel, let it expire, billing grace (Play test cards), refund.

## Store compliance checklist (exit gate: documented review)

| Rule                                                                                        | Where                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Digital subscription sold only through Apple/Google IAP in the apps                         | `store.native.ts`; web points to the app   |
| Price, billing period and auto-renewal stated before purchase                               | paywall plan cards + `renewalDisclosure()` |
| How to cancel, at least 24 h before renewal                                                 | paywall + Settings › Dynorex+              |
| Restore Purchases available                                                                 | paywall + Settings › Dynorex+              |
| Links to Terms and Privacy from the paywall                                                 | paywall "Terms and privacy"                |
| Paywall can be dismissed; no fake urgency or countdowns                                     | "Not now"; no timers                       |
| Features not yet available aren't sold as included                                          | comparison rows marked "(later)"           |
| Manage subscription opens the store's own management page                                   | `store.manage()` / `MANAGE_URLS`           |
| Store listing / Terms must state the same prices and auto-renewal (owner to finalize, D-04) | pending                                    |

## Known limits

- `subscription-sync` can't see the store's original transaction id through RevenueCat's REST API and uses a
  stable surrogate key; if a webhook and a sync for different accounts race, both could show Plus until the next
  event. Low risk; revisit if RevenueCat exposes the id.
- Nothing here has run against real stores, RevenueCat or Supabase yet.
