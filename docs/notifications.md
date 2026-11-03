# Notifications

## How it works

1. **Created by the database.** Triggers write a row to `public.notifications` when someone follows you
   (`new_follower`) or adds a mod to a public build you follow (`build_update`). Clients can't insert rows.
   - A row is only created if the recipient's switch for that category is on (`notification_prefs`, no row = on),
     they haven't muted the actor, and neither has blocked the other.
   - Build updates: at most one per build per follower per hour. New follower: once per follower per day.
   - Text holds public facts only: a public username and a public build title. Never the mod name, cost,
     notes, VIN, location or any token.
2. **Inbox.** The bell on Home opens `/inbox`. It reads the same rows, so it works with push off.
3. **Push (optional, per phone).** Settings > Notifications > "Turn on push" asks the OS, gets an Expo push
   token, and stores it with `register_push_token()` in `app_private.push_tokens` (unreadable by clients).
   Signing out removes this phone's token first.
4. **Delivery.** The `push-dispatch` Edge Function claims unsent rows (`claim_pending_pushes`, each row once,
   never older than a day) and sends them to Expo's push API with
   `data = { entity_type, entity_id, category }`. Tokens Expo reports as `DeviceNotRegistered` are deleted.
5. **Tap.** `NotificationRouter` (inside the signed-in shell, so after the auth check) validates the payload
   and opens `/u/:username` or `/build/:vehicleId`; anything else opens the inbox.

## Operator setup (not done yet: needs a Supabase project, B-03)

1. `eas init` and set `EXPO_PUBLIC_EAS_PROJECT_ID` (push tokens need it). Push needs a development or store
   build; Expo Go on Android has no remote push.
2. iOS: an APNs key in the Expo account. Android: FCM V1 credentials in the Expo account.
3. Edge Function secrets: `PUSH_DISPATCH_SECRET` (long random string), optionally `EXPO_ACCESS_TOKEN`.
4. Schedule the dispatcher every minute with Supabase Cron + pg_net, sending the header
   `x-dispatch-secret: <PUSH_DISPATCH_SECRET>` (store the secret in Vault, not in the job text).
5. Schedule `recall-check` once a day (same header and secret). It looks up NHTSA recalls for each make / model /
   year that a live car has (never a VIN) and queues a `recall` alert for owners the first time a campaign appears.
6. Send a test follow between two test accounts and confirm the push arrives and the tap opens the profile.

## Later alert types

- D-61: likes and comments on your posts (`post_like`, `post_comment`), new meets in your clubs (`club_event`).
- D-62: safety recalls that may affect your cars (`recall`, opens the car), Shop listings matching your wishlist
  (`wishlist_match`, only while the Shop is on).

## Not built yet

Event reminders, marketplace, subscription and Build of the Week notifications have switches (saved now)
but nothing sends them until those features exist.
