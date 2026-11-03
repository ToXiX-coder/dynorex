# Phase 4 (Sharing & Social): status report

Date: 2026-10-05. **Code complete and tested locally; not yet run against a real Supabase project, Expo push
service or a phone.**

## Built

**Database** (`supabase/migrations/20261008000000_phase4_sharing_social.sql`)

- Public views v2: exclude moderation-hidden content; add counts, car fields, `has_hero`, last activity;
  new `public_mod_photos` (ids only). Still the single place visibility is decided.
- `publish_build()` (one sharing switch per vehicle, runs as the caller so the verified-email/username gate
  applies), visibility sync trigger, `share_build_link()` (public-only, 30/h), `public_build_status()`
  (`public` / `gone` / `not_found`), `public_build_specs()` (server formula, current estimate only).
- Build follows: rate limited, no self-follow. Notifications: `new_follower` and `build_update` triggers with
  prefs, mutes, blocks, hourly/daily batching and public-only text; `notification_prefs`; inbox filtering of
  blocked actors; `mark_all_notifications_read()`.
- Push: tokens in `app_private`, register/unregister/status functions, `claim_pending_pushes()` (claim once).
- `home_feed()`, `discover_builds()` (trending / new / for you; server ranking), `nearby_builds()` with coarse
  opt-in regions, `search_public()` (full-text with prefix match, normalised input, 60/min).
- Moderation: `apply_moderation()` + moderators table + audit rows. Build of the Week: table, public view and
  selection boundary, switched off.

**Edge Functions**: `public-media` (re-check as caller, sign 5-minute URLs, `no-store`), `push-dispatch`
(scheduler secret, Expo push, dead-token cleanup). `export-data` now includes notification prefs, nearby
status and push device count.

**App**

- Public build page `/build/:vehicleId` (hero, specs with the exact disclaimer, timeline with Load more,
  follow, native share, report/block, owner shortcut, "Build not found" / "This build no longer exists"),
  public mod page, `/v/:id` and `/build/:id/mods` redirects. Public pages and `/u/:username` open without an
  account; a cold public link while signed out starts guest mode.
- Vehicle page "Sharing" card: public/private with a confirm, what is and isn't shown, view page, share.
- Profiles: follow button, counts, the person's public builds; your own Following/Followers lists.
- Discover: Trending / New / For you (signed in) / Nearby (flag off), pull to refresh, Load more; Build of the
  Week teaser behind its flag.
- Search: live after 2 characters, grouped Builds / Users / Mods with thumbnails, spec empty state, local
  recent searches with Clear.
- Home: garage cards (cached), Build Updates feed, unread badge on the bell, search icon, trending strip;
  each section fails independently.
- Inbox and Settings > Notifications: a switch for every category (only changes after the server confirms),
  push on/off per phone, OS permission state and "Open phone settings".
- Notification taps route only to validated targets; sign-out removes the phone's push token.
- Analytics wired: `build_shared`, `build_followed`, `build_unfollowed`, `discover_opened`,
  `search_performed`, `notification_tapped` (no identifiers).

## Checks run on this machine

| Check                                           | Result                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / format                       | pass                                                                                                                                               |
| Vitest                                          | **169/169**: 62 database (19 Phase 4), 107 unit (incl. Phase 4 deep links, cells, search)                                                          |
| Jest (screens)                                  | **36/36** incl. 10 Phase 4                                                                                                                         |
| `expo export` android / ios / web + secret grep | all bundle; 0 hits (now also checks `PUSH_DISPATCH_SECRET`, `EXPO_ACCESS_TOKEN`)                                                                   |
| `expo install --check`                          | dependencies up to date                                                                                                                            |
| Browser (web, no backend)                       | cold `/build/:id` shows "Build not found"; cold `/discover` opens Discover as a guest with the honest "Not connected yet"; `/` still shows Welcome |

Phase 4 exit-gate coverage (database tests): public/private matrix across views, status, specs, share links,
feed, search, Discover and photos; deleted vs private; VIN/odometer/cost/notes/path leak scan over every
public output and notification; follows vs blocks/privacy/self; mutes; nearby opt-in, 3-owner minimum, no
location in results, rate limit; notification text, batching, prefs, private builds never notifying; push
claim-once; moderation hide/restore/audit; Build of the Week refusal while off.

## Not verified

- Real Supabase: the migration, Edge Functions (`public-media`, `push-dispatch`) and signed URLs have not run.
- Push end to end (needs EAS project, APNs/FCM credentials, scheduler) and taps on real devices.
- Universal links / App Links (files not hosted; needs Team ID and signing fingerprint) and QR codes.
- Nearby on devices (permission prompts, coarse fix). Search ranking at real data volumes.

## Decisions to review (docs/decisions.md)

D-23 one sharing switch · D-24 what public pages show (costs never) · D-25 no offline copy of others' content ·
**D-26 search signed-in only** · **D-27 Nearby residual risk (flag off until accepted)** · D-28 notification
text/batching · D-29 Build of the Week off · D-30 moderation via service role · D-31 follower lists private.
