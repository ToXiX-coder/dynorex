# Architecture

```
 ┌────────────── Expo app (TypeScript, strict) ──────────────┐
 │ src/app/        routes only (Expo Router): 5 tabs, stacks │
 │ src/components/ UI kit: buttons, forms, cards, feedback,  │
 │                 mascot (SVG source shared with exports)   │
 │ src/domain/     pure rules: flags, privacy, validation,   │
 │                 copy. No React Native imports. Unit-tested│
 │ src/services/   supabase client, analytics, monitoring    │
 │ src/theme/      immutable palette + tokens                │
 └──────────────┬────────────────────────────────────────────┘
                │ anon key + user JWT (HTTPS)
 ┌──────────────▼──────────── Supabase ──────────────────────┐
 │ PostgREST → Postgres with RLS on every table              │
 │   base tables: owner-only policies + column GRANTs        │
 │   public_* views: allow-listed columns, effective         │
 │   visibility (child public only if every parent is)       │
 │   security-definer functions: soft delete, verified check │
 │ Edge Functions (Deno): privileged work after an explicit  │
 │   identity check; service-role key lives only here        │
 │ Storage (Phase 3): private buckets + short-lived URLs     │
 └───────────────────────────────────────────────────────────┘
```

## Rules

- Screens never hold privileged logic. They call services; services call Supabase as the user.
- The database is the enforcement point. Client checks (flags, `canView`) only shape the UX.
- Public data is read ONLY from `public_*` views or a public-safe Edge Function projection.
- Feature flags change what is shown; they never grant access.

## Navigation and deep links

| URL                                           | Route file                                | Who can open it                                       |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `/`                                           | `(tabs)/(home)/index.tsx`                 | app shell (guests too)                                |
| `/discover`, `/discover/botw`                 | `(tabs)/(home)/discover/…`                | anyone; a cold link while signed out opens guest mode |
| `/search`, `/inbox`, `/following`             | `(tabs)/(home)/…`                         | signed in (guests see a sign-in prompt)               |
| `/profile`, `/settings/…`                     | `(tabs)/(home)/…`                         | signed in                                             |
| `/garage/…`                                   | `(tabs)/garage/…`                         | owner only (RLS)                                      |
| `/line`, `/paddock`                           | teasers                                   | v2                                                    |
| `/add`                                        | modal chooser                             | signed in                                             |
| `/u/:username`                                | `u/[username].tsx`                        | **public**, outside the sign-in gates                 |
| `/build/:vehicleId`, `/build/:vehicleId/mods` | `build/[vehicleId]/index.tsx`, `mods.tsx` | **public**                                            |
| `/build/:vehicleId/mod/:modId`                | `build/[vehicleId]/mod/[modId].tsx`       | **public**                                            |
| `/v/:vehicleId`                               | `v/[vehicleId].tsx` → `/build/:vehicleId` | **public**                                            |
| private, hidden, blocked or never existed     | the public page itself                    | identical "Build not found", so existence never leaks |
| deleted after being public                    | the public page itself                    | "This build no longer exists" (spec wording)          |

Notification taps go through `notificationHref()` (`src/domain/deepLinks.ts`), which accepts only
`entity_type` + a validated id/username; anything else opens the inbox. Universal links
(`applinks:dynorex.app`) and Android App Links are configured for production builds; the hosted
`apple-app-site-association` and `assetlinks.json` files need the Apple Team ID and the Android signing
certificate fingerprint, so they are templates in `docs/deep-links.md` until those accounts exist (B-03).

## Final folder tree (Phase 1)

```
src/app/            _layout, add, +not-found, (tabs)/{_layout, add-placeholder, line, paddock,
                    (home)/{_layout, index, discover, profile, settings/{index, subscription}},
                    garage/{_layout, index}}
src/components/     Text, Screen, icons, buttons/, cards/, forms/, feedback/, mascot/
src/domain/         flags, copy/errors, privacy/{scrub, visibility, publicProjection}, validation/upload
src/services/       config, supabase/{client, secureStorage, database.types},
                    analytics/{events, queue}, monitoring/{sentry, sentryOptions}
src/providers/      AppProviders (flags, safe area)
src/theme/          palette, tokens
src/hooks/, src/utils/
supabase/           migrations/, seed.sql, functions/_shared/
tests/              unit/, integration/ (PGlite)
scripts/            export-brand.ts
assets/brand/       svg/, png/
docs/               setup, architecture, security, release, design-tokens, brand, decisions, phase-1-report
web-pilot/          previous web MVP, reference only (to be deleted after porting)
```

Spec folders not created yet because they would be empty: `src/features/*` (begins in Phase 2),
`tests/e2e` (Phase 6, Maestro), `src/services/nhtsa` and `src/services/storage` (Phase 3),
`src/services/notifications` (Phase 4).
