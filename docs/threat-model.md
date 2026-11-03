# Threat model and security review (Phase 6)

Scope: the Expo app, Supabase (Postgres + RLS, Auth, Storage), Edge Functions, RevenueCat / stores, Expo push,
NHTSA, Mapbox (v2). Method: STRIDE per trust boundary, then a code review of each mitigation, then automated
checks so regressions fail CI. Reviewed 2026-10-05 against migrations 1-6 and the Phase 5 app.

## Trust boundaries

1. Phone ↔ Supabase API (anon key + user JWT; everything under RLS)
2. Phone ↔ Edge Functions (user JWT, or anon key for public media)
3. Store / RevenueCat ↔ `revenuecat-webhook` (shared Authorization value)
4. Scheduler ↔ `push-dispatch` (shared secret); Edge Functions ↔ Expo push / RevenueCat REST (server secrets)
5. Public web (dynorex.app pages, share links, QR codes) ↔ public views only

## STRIDE

| Threat                 | Example                                               | Mitigation                                                                                                                                | Evidence                         |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Spoofing               | Calling the API as someone else                       | Supabase Auth JWT; `auth.uid()` binds every write; PKCE OAuth; re-auth within 5 min for deletion                                          | rls / phase2 tests               |
| Spoofing               | Fake store webhook granting Dynorex+                  | Constant-time Authorization check; state only via service-role function; sandbox ignored in prod                                          | phase5 tests, function code      |
| Tampering              | Forged premium flag, owner id, reputation, badge, fee | No client column grants on server fields; Plus decided by `user_has_plus()`                                                               | audit + phase5 tests             |
| Tampering              | Parent/child substitution (my mod on your car)        | Composite FKs `(id, owner_id)`                                                                                                            | rls tests                        |
| Tampering              | Photo with GPS/EXIF or a disguised file               | On-device re-encode; `register-photo` checks magic bytes, size, dimensions, metadata                                                      | image unit tests                 |
| Repudiation            | Moderator or store-event disputes                     | Append-only `admin_moderation`, `subscription_events` (even for owner/service role)                                                       | phase2 / phase5 tests            |
| Information disclosure | VIN, odometer, costs, notes, location leaking         | Public views are allow-lists; leak scan over every public output and notification                                                         | phase4 test                      |
| Information disclosure | Existence of private builds                           | Same `not_found` for private / hidden / blocked / missing                                                                                 | phase4 tests                     |
| Information disclosure | Precise location via Nearby                           | Device sends a 55 km cell; both sides opt in; 3-owner minimum; no distances; 10 changes/day                                               | phase4 tests, D-27               |
| Information disclosure | Tokens / PII in logs, Sentry, analytics               | Scrubbers, strict event schemas, no payload logging in functions                                                                          | unit tests                       |
| Information disclosure | Secrets in the app bundle                             | Lint rule, bundle grep, preflight                                                                                                         | export grep, `npm run preflight` |
| Denial of service      | Spam writes, scraping search                          | DB rate limits (vehicles, mods, photos, follows, reports, reactions, search, share, region, push tokens, subscription sync, public media) | rate-limit tests                 |
| Elevation of privilege | Calling service-only functions                        | Revoked from anon/authenticated; schema audit keeps the allow-list                                                                        | audit test                       |
| Elevation of privilege | New function exposed by default                       | Default EXECUTE removed for new functions (migration 6)                                                                                   | audit test probe                 |

## Findings from this review

| #   | Severity | Finding                                                                                       | Status                                                                 |
| --- | -------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| F-1 | Low      | 11 trigger functions executable by PUBLIC (can't be called directly, but needlessly exposed)  | **Fixed** (migration 6)                                                |
| F-2 | Medium   | New functions would be executable by PUBLIC by default; a future migration could expose one   | **Fixed** (default privileges revoked; audit probe)                    |
| F-3 | Medium   | Search missed the 500 ms p95 target at volume (564 ms), an easy load amplifier                | **Fixed** (indexed candidates; 346 ms)                                 |
| F-4 | Medium   | Account deletion left purchase records at RevenueCat                                          | **Fixed** (delete-account deletes the subscriber)                      |
| F-5 | Medium   | Deleting an account doesn't cancel store billing; users weren't told                          | **Fixed** (warning on delete screen and deletion page)                 |
| F-6 | Low      | `public-media` had no per-user rate limit                                                     | **Fixed** for signed-in callers (300/h); guests rely on gateway limits |
| F-7 | Low      | `subscription-sync` uses a surrogate transaction key (RevenueCat REST limitation)             | Accepted, documented (docs/subscriptions.md)                           |
| F-8 | Low      | Plus status of any user id is answerable via `is_plus_member` (same fact as the public badge) | Accepted pending D-34                                                  |
| F-9 | Info     | Guest requests to `public-media` / public views are limited only by the platform gateway      | Accepted; monitor (runbooks/alerts.md)                                 |

No critical or high findings remain open. Not yet reviewable here: Supabase project settings (Auth rate limits
D-17, SMTP, CORS, network restrictions), store / RevenueCat dashboards, real Edge Function deployment.

## Automated guards (run in CI)

- `tests/integration/audit.test.ts`: definer functions pin `search_path`; anon can run only the reviewed
  functions; service-only functions unreachable; anon reads only `public_*` views and writes nothing; views are
  security barriers; `app_private` unreachable; server-only columns have no client grants; new functions start
  private.
- ESLint ban on service-role and secret key patterns in `src/`; bundle grep after `expo export`;
  `npm run preflight` before production builds.
