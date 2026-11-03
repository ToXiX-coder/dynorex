# Setup

## Requirements

- Node 22+ (developed on Node 24) and npm.
- For a phone: the Expo Go app is NOT enough (Sentry and SecureStore need a development build). Use
  `eas build --profile development` or `npx expo run:android` / `run:ios` (iOS needs a Mac).
- For a local backend: Docker + the Supabase CLI (`npx supabase`).

## First run (no backend)

```bash
npm install
npm run web            # opens the app shell in a browser at http://localhost:8081
npm test               # unit tests + migrations/RLS tests on PGlite (no Docker needed)
```

Without Supabase variables the app runs and says it is not connected; nothing is faked.

## Local Supabase

```bash
npx supabase init      # first time only, then commit supabase/config.toml
npx supabase start     # prints the local URL and anon key
npx supabase db reset  # applies migrations + seed.sql (development data only)
```

Copy `.env.example` to `.env.local` and fill `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Environments and promotion

| Env         | Supabase project                          | App build                                           | How it updates                                                                                          |
| ----------- | ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| development | local (`supabase start`) or a dev project | `APP_ENV=development`, bundle `app.dynorex.dev`     | `supabase db reset`                                                                                     |
| staging     | `dynorex-staging`                         | EAS `preview` profile, bundle `app.dynorex.staging` | `deploy-db.yml` on every push to `main`                                                                 |
| production  | `dynorex-prod`                            | EAS `production` profile, bundle `app.dynorex`      | `deploy-db.yml` manual dispatch, guarded by the `production` GitHub Environment with required reviewers |

Migrations are the only way schema changes. No dashboard edits.

## Variables

| Name                                                        | Where                                 | Public?                                            |
| ----------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `APP_ENV`                                                   | EAS profile / local shell             | n/a                                                |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, EAS env                 | **Public** (RLS protects data)                     |
| `EXPO_PUBLIC_SENTRY_DSN`                                    | `.env.local`, EAS env                 | **Public**                                         |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`                           | `.env.local`, EAS env                 | **Public** `pk.` token only, URL/bundle-restricted |
| `EXPO_PUBLIC_FLAG_OVERRIDES`                                | `.env.local`                          | Public, ignored in production                      |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | Supabase Edge Function secrets (auto) | **Secret**                                         |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`             | GitHub Environment secrets            | **Secret**                                         |
| `SUPABASE_PROJECT_REF`                                      | GitHub Environment variable           | Not secret                                         |
| `EXPO_TOKEN`                                                | GitHub secret                         | **Secret**                                         |
| `SENTRY_AUTH_TOKEN`                                         | EAS secret (source maps)              | **Secret**                                         |
| Store / Stripe server keys                                  | Edge Function secrets (Phase 5 / v2)  | **Secret**                                         |

## Brand assets

`npm run brand:export` regenerates every SVG and PNG in `assets/brand/` from `src/components/mascot/art.ts`.
