# Phase 2 (Auth & Profiles): status report

Date: 2026-10-05. **Code complete against Supabase; not yet run against a real Supabase project** (owner will
connect it later). Everything that can be verified without a server has been.

## Built

**Database** (`supabase/migrations/20261006000000_phase2_auth_profiles.sql`)

- Profile row created by a trigger at sign-up; username chosen after email verification (nullable until then).
  Clients can no longer insert profiles. `username_available()` RPC.
- Publishing requires a verified email **and** a username. Following requires a username.
- `blocks`: blocked person can't see the blocker's profile/vehicles/builds/mods (and vice versa), can't follow
  through either table, never learns who blocked them; blocking removes follows both ways.
- `mutes` (private to the muter, no access change). `reports` (verified users only; reporter sees only status;
  details/reporter id hidden; kept anonymised if the reporter deletes their account).
- `admin_moderation`: no client access; append-only for everyone including the service role.
- Server-side rate limits from spec section 13: vehicles 10/h, mods 50/h, photos 20/h, follows 100/h,
  reports 10/h, counted in a private schema clients can't read. Trusted server paths are exempt.
- Public views now also hide unnamed and blocked accounts.

**App**

- Auth: email/password sign-up, sign-in, verification email + resend (60 s cooldown), "I've verified" refresh,
  forgot/reset password (generic answer; one-time code checked by the server), sign-out (revokes this device's
  refresh token), Apple (native button on iOS, browser flow elsewhere), Google (browser flow, PKCE).
- Gates: welcome → verify → username → onboarding → app, as Expo Router protected groups. Guests and
  unconnected builds can "look around first"; account screens ask them to sign in.
- Animated brand splash (logo drop + Torq slide, ≤ 0.9 s, static under reduced motion), shown only while the
  session is read.
- Onboarding, exactly 3 steps with lime progress dots, Torq in the corner, Skip top-right (records the step,
  creates nothing), resume from the server-stored step:
  1. "What do you drive?" saves a real **private** vehicle (manual entry; NHTSA lookup is Phase 3), retry-safe
     against duplicates. 2. "Show it off": photo upload honestly marked Phase 3. 3. "What's the goal?": the 8
     spec goal cards, 2-column, Just Browsing last and full-width, selected = lime border + checkmark + radio state.
- Profile (view/edit with validation; reputation shown as server-calculated; follower counts), public profile
  `/u/:username` with Mute, Report (reason chips + details), Block (red confirm). Not-found is identical for
  missing / private / blocked.
- Settings: Account (email + verification status, sign-in methods, change password, sign out), Privacy
  (default visibility; friends-only shown disabled with the reason; blocked list with unblock), Notifications
  (honest Phase 4 notice), Your data (export to JSON via share sheet; delete account with DELETE + fresh
  sign-in + red confirm), About (states that terms/privacy/support are not published yet).
- Edge Functions: `delete-account` (rejects unless signed in within 5 minutes; deletes via service role only
  after that check), `export-data` (runs as the user, so RLS limits it to their own rows).
- Error copy: every failure maps to the spec's messages (plus 11 new entries in the same voice); no raw codes.

## Checks run on this machine

| Check                                                         | Result                                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck` / `npm run format:check` | pass                                                                                                                                                                  |
| Vitest                                                        | **106/106**: 30 database (17 Phase 1 + 13 Phase 2 on PGlite), 76 unit                                                                                                 |
| Jest (screens/components)                                     | **16/16** incl. sign-in, username, onboarding goal + skip, delete-account order, block confirm, not-found                                                             |
| `expo export` web, iOS, Android + secret grep                 | all bundle; 0 secret hits                                                                                                                                             |
| Browser (375 px web build, no backend)                        | Welcome renders with "Not connected yet"; sign-in validates and then shows "Not connected yet" (no fake success); guest mode shows the tab shell with sign-in prompts |

## Not verified (needs your Supabase project or devices)

- Any real sign-in, email delivery, OAuth round-trip, deep-link return from email, session refresh,
  account deletion or export against a live server. These are written to Supabase's documented APIs and will be
  tested the moment the project is connected.
- Edge Functions have never executed (no Deno/Supabase here); CI type-checks them.
- Native-only pieces (Apple button, SecureStore, share sheet) on a real phone.

## Spec gaps and decisions (also in docs/decisions.md)

- **D-16** Username is chosen right after verification (signup only collects email + password).
- **D-17** Rate limits: DB-side limits return a "Slow down" message but PostgREST sends HTTP 400, not 429;
  Supabase Auth's own limiter is per 5 minutes and shared by sign-in + sign-up, so the spec's exact
  "5 per 15 min" / "3 sign-ups per hour" / "lock after 10 failures" / "3 resets per hour per email" can't be
  configured 1:1. Closest settings applied; an exact version needs an auth gateway Edge Function or Supabase's
  paid auth hooks. **Owner decision.**
- **D-18** Email delivery needs your SMTP provider (Supabase's built-in mailer is for testing only).

## To connect Supabase later

1. Create the project; put `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
2. `npx supabase link --project-ref <ref>` then `npx supabase db push` (migrations only; never seed).
3. In Auth settings: site URL `dynorex://`, redirect URLs from `supabase/config.toml`, SMTP, then Apple/Google.
4. `npx supabase functions deploy delete-account export-data`.
5. Run the app on a development build and walk the Phase 2 flows; then regenerate types with `npm run db:types`.
