# Security and privacy (Phase 1 state)

## In place and tested

| Control                                                                                                           | Where                                   | Test                                                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| RLS on every table, owner-only base policies                                                                      | migration                               | `rls.test.ts` "every table has RLS", ownership suite |
| Column GRANTs: clients can't write `reputation`, `business_badge`, `featured`, ids, owner, timestamps             | migration                               | "rejects writes to reputation…", "cannot feature"    |
| Parent/child substitution blocked by composite FKs `(parent_id, owner_id)`                                        | migration                               | "cannot … attach to their parents"                   |
| Storage paths must sit under the owner's folder                                                                   | CHECK constraints                       | same                                                 |
| Public reads only via allow-listed views; no VIN, odometer, cost, notes, owner ids                                | migration                               | "public views never contain…"                        |
| Effective visibility: a child is public only if every parent is                                                   | views                                   | "public build on a private vehicle stays hidden"     |
| Publishing needs a verified email (client roles)                                                                  | trigger                                 | "unverified users cannot publish"                    |
| `friends_only` refused until real accepted relationships exist                                                    | CHECK                                   | same                                                 |
| Soft delete via owner-checked functions; same `false` for "missing" and "not yours"                               | functions                               | "owner can soft delete…", cross-user delete          |
| Notifications are server-written only                                                                             | GRANTs                                  | notifications suite                                  |
| anon cannot read any base table                                                                                   | GRANTs                                  | "anon cannot read base tables"                       |
| No server secrets in client code (incl. Mapbox `sk.` tokens; only public `pk.` accepted)                          | ESLint rule + CI bundle grep + gitleaks | bundle grep run locally: 0 hits                      |
| Session tokens in Keychain/Keystore (chunked SecureStore), PKCE                                                   | `services/supabase`                     | `services.test.ts` chunking                          |
| Sentry: no default PII, request bodies/headers/cookies dropped, token paths masked, VIN/email/JWT/coords scrubbed | `sentryOptions.ts`                      | sentry scrubbing suite                               |
| Analytics: strict per-event schemas, PII guard, off until consent, never blocks UI                                | `analytics/`                            | analytics suite                                      |
| Upload checks by magic bytes, size, dimensions (client copy; server copy in Phase 3)                              | `domain/validation/upload.ts`           | upload suite                                         |

## Known gaps (scheduled)

- **Rate limits** (spec 13 table): not enforced yet. They need Edge Functions; Phase 2 adds them for auth/writes.
- **Blocks/mutes/reports** tables and their effect on views: Phase 2.
- **Storage buckets and policies, EXIF stripping, signed URLs**: Phase 3.
- **Account deletion/export** Edge Functions: Phase 2.
- RLS tests run on PGlite with a Supabase auth shim. The `supabase-db` CI job applies the same migrations
  to a real local Supabase, but it **has not run yet** (no Docker on the dev machine).
- Threat model and external review: Phase 6.

## Logging rules

Never log passwords, tokens, VINs, payment data, private messages or precise location. Edge Functions
log only an error class name, never messages or bodies (`supabase/functions/_shared/auth.ts`).

## Added in Phase 2 (tested on PGlite / Jest)

- Profiles are created by a sign-up trigger; clients cannot insert profile rows.
- Blocks hide content both ways in every public view, stop follows through both tables, remove existing follows, and are invisible to the blocked person.
- Reports: verified users only; reporters can read only their own reports' status; reporter identity and details are never readable by clients.
- `admin_moderation`: no client access, append-only for every role.
- Write rate limits in the database (vehicles, mods, photos, follows, reports); counters in a private schema.
- Account deletion requires a sign-in in the last 5 minutes (Edge Function) plus typed confirmation; export runs as the user under RLS.
- Password reset gives the same answer whether or not the email exists; sign-up conflicts are reported generically.
- Session: PKCE, Keychain/Keystore storage, refresh only in foreground, sign-out revokes this device's refresh token.
- Not yet verified against a live Supabase project; Edge Functions not yet executed.

## Added in Phase 3

- Private media bucket; owner-folder storage policies; 5-minute signed URLs; files immutable.
- Photos and hero images are recorded only by `register-photo` after a byte-level check (type, size, dimensions, no Exif/XMP/text metadata); rejected files are deleted. The app also strips metadata by re-encoding before upload.
- Free-plan limits enforced atomically in the database (advisory lock); plan overrides not readable or writable by clients.
- Idempotent creates (`client_ref`) stop duplicate vehicles/mods from retries and offline replays.
- Spec-delta JSON validated by the database; spec estimates and cost totals computed server-side under RLS.
- Wishlist links: https only, no credentials, no private hosts (app); https + no credentials (database); confirm before opening.
- VIN never sent to NHTSA and never written to the offline cache; cache is per user and wiped on sign-out.

## Added in Phase 4

- **One visibility rule.** Every public read (pages, Discover, search, feed, notifications, share checks, photo
  signing) goes through the `public_*` views, which require the record and all parents to be public, not
  deleted, not moderation-hidden, owned by a named account, and not blocked either way with the viewer.
  The visibility matrix (guest / signed-in / owner × public / private / deleted / hidden / blocked) is tested
  across views, status, specs, share links, feed, search, Discover and photos (`tests/integration/phase4.test.ts`).
- **No existence leaks.** Private, hidden, blocked and missing builds return the same `not_found`; only a build
  that was public before deletion returns `gone`.
- **Leak scan.** A test renders every public output (views, functions, notifications) for a vehicle seeded with a
  VIN, odometer, cost, notes and a storage path, and checks none of them appear.
- **Public photos** are signed only by `public-media` after it re-checks the views as the caller; storage paths
  are never returned; 30 ids per call; 5-minute URLs; `Cache-Control: no-store`.
- **Share links** are issued only for builds public right now (server check, 30/hour).
- **Follows:** public builds only, not your own, blocked pairs impossible, 100/hour shared with user follows.
  Blocking removes follows both ways and hides the blocker's notifications from the inbox.
- **Notifications** are server-written with public text only; prefs are enforced before a row is created;
  push tokens live in `app_private` (clients can't read them); the dispatcher authenticates with its own secret
  (constant-time compare) and never logs payloads.
- **Search** is signed-in only, 60/minute, and reduces input to 5 alphanumeric words before `to_tsquery`, so
  query syntax can't be injected. Discover ranking happens on the server; unknown modes are rejected.
- **Nearby** never stores or returns coordinates: the device sends a ~55 km grid cell; both sides opt in;
  3-owner minimum; no distances; 30-day expiry; 10 changes/day (D-27). Android blocks fine/background location.
- **Moderation:** `apply_moderation()` is service-role only, requires a listed moderator, and writes an
  append-only audit row. Build of the Week selection refuses to run while switched off.
- Not verified yet: Edge Functions (`public-media`, `push-dispatch`) have not run against real Supabase/Expo,
  and universal-link files are not hosted (docs/deep-links.md).

## Added in Phase 5

- **Entitlements come only from verified store events.** Clients have no access to `subscriptions` or
  `subscription_events`; `apply_subscription_event()` is service-role only and is called by the
  `revenuecat-webhook` (constant-time check of RevenueCat's Authorization value) and `subscription-sync` (reads
  RevenueCat server-side for the caller's own JWT identity, 10/hour). Sandbox purchases are ignored unless
  explicitly allowed on staging. Tested: forged inserts, direct calls, duplicate and out-of-order events,
  cancellation, grace, billing retry, refund, revoke, transfer.
- **Every Plus capability is enforced in the database**: limits (`enforce_plan_limits` now reads verified state),
  advanced specs and analytics (`plus_required`), sticker reactions (RLS via `current_user_has_plus()`, which only
  answers for the caller), badge computed in the view. Free users calling the RPCs directly are refused.
- Event log is append-only, even for the service role and the database owner.
- RevenueCat **public** SDK keys only in the app; the secret key and webhook value are Edge Function secrets and
  are grepped out of every bundle.
- **Pitch mode** (`EXPO_PUBLIC_DEMO_MODE`) is refused when `APP_ENV=production` (unit-tested), never creates a
  Supabase client, and shows a permanent badge. It changes only the app's data layer; server rules are untouched.
