# Phase 1 (Foundation): status report

Date: 2026-10-04. Gate result: **partially met.** All local checks pass; several gate items need accounts,
devices or CI runs that this machine can't provide (listed below).

## Done

- Expo SDK 57 + React Native 0.86 + strict TypeScript, Expo Router with typed routes, `app.config.ts` with
  development/staging/production variants (separate bundle IDs), dark-only UI, `dynorex.app` universal/app links (prod).
- Five-tab shell (Home | Build | + | Line | Paddock), a stack per tab, centre + opens an honest
  creation chooser, Line/Paddock gray with a SOON tag and flag-gated teasers, Discover/Profile/Settings reachable,
  a single not-found screen for unknown/private/deleted links.
- Design tokens (immutable palette, 8-pt spacing, type scale, radii, motion, 44-pt targets) and components:
  Button (primary/secondary/destructive), Chip, TextField, Card, Empty/Error/Loading states, Skeleton
  (reduced-motion static), ProgressBar, ComingSoon, PhaseNotice, icons.
- Brand: logo redrawn from the owner's concept with the DYNOREX wordmark (3 colour variants), app icons
  (14 sizes), Android adaptive + monochrome, splash, lockup 1x/2x/3x; Torq in 7 poses (SVG + transparent PNG).
  Engineering drafts, see docs/brand.md.
- Supabase migration for users, vehicles, builds, mods, mod_photos, follows, build_follows, notifications:
  constraints, indexes, RLS on every table, column grants, composite ownership FKs, public allow-list views,
  verified-email publishing gate, owner-checked soft delete. Seed data (synthetic, idempotent).
- Sentry wiring with tested scrubbing; typed analytics events with PII guard, consent gate and batching (no-op sink).
- Ported from the web pilot: public-projection allow-list, upload magic-byte checks.
- GitHub Actions: lint, types, format, tests, web bundle + secret grep, gitleaks, real-Supabase migration job,
  Deno check, EAS preview builds, gated staging→production database deploys.
- Docs: setup, architecture, security, release, design tokens, brand, decisions.

## Commands run and results (this machine)

| Command                                           | Result                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                    | pass (0 problems)                                                                                                           |
| `npm run typecheck`                               | pass                                                                                                                        |
| `npm run format:check`                            | pass                                                                                                                        |
| `npm test`                                        | **78/78 pass**: Vitest 71 (16 RLS/migration, 1 seed, 54 unit) + Jest 7 component                                            |
| `npx expo export` web, iOS, Android + secret grep | all three bundles built; 0 secret hits                                                                                      |
| `npx expo start --web` (browser pane, 375 px)     | shell renders; 5 tabs in order, each ≥ 44 pt; no horizontal overflow; Add chooser, Line teaser and not-found screen checked |
| `npm run brand:export`                            | 16 SVG + 45 PNG written; icon needle readable at 120 px                                                                     |

## Not verified / blocked (gate items)

- **App launch on real iOS/Android**: not run (Windows, no simulator, no EAS account). Native-only modules
  (SecureStore, Sentry native) were not exercised; web preview is not a substitute.
- **CI**: workflows written, never run (no git remote).
- **Real Supabase**: migrations tested on PGlite with an auth shim; the real-stack job has not run.
- **Separate Supabase dev/staging/prod projects**: not created (needs owner's account).
- **Sentry**: no DSN; scrubbing is unit-tested only.
- **Final logo/Torq art**: drafts; needs designer sign-off (docs/brand.md acceptance checks).
- **Screen-reader pass** (VoiceOver/TalkBack): not done; labels, roles and states are in place.
- Owner decisions open: docs/decisions.md D-04, D-05, D-07, B-03, B-07 (maps provider resolved: Mapbox, D-14).

## Next: Phase 2 (Auth & Profiles)

1. See docs/phase-2-readiness.md (config.toml is committed; owner prerequisites listed there).
2. Email/password, Google and Apple sign-in, verification + resend, reset, session refresh, route guards.
3. Three-step onboarding with server-side state; profile edit; Settings sections that save for real.
4. Blocks/mutes/reports tables + policies; account deletion (re-auth) and export Edge Functions; rate limits.
5. Remove `web-pilot/` once its remaining rules (share tokens, CSV export) are ported in Phases 3-4.
