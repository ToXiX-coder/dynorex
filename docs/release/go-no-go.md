# Release candidate: go / no-go

**Current verdict (2026-10-05): NO-GO.** The code is release-shaped; the accounts, live services and device
evidence the spec's exit gate requires don't exist yet. Every item below needs a ✓ with evidence linked.

## Exit gate (spec Phase 6)

| Gate                                    | Status    | Evidence / blocker                                                                          |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Crash-free ≥ 99.5 % in the RC window    | ☐ blocked | Needs Sentry project + RC testers (B-03)                                                    |
| Performance targets met                 | ◐ partial | DB p95 all < 500 ms (`docs/performance.md`); device cold start / cached Garage not measured |
| No open critical/high security findings | ✓         | `docs/threat-model.md` (F-1…F-6 fixed; rest low/accepted)                                   |
| No critical accessibility failures      | ◐ partial | Automated audit 20/20; manual VoiceOver/TalkBack pass pending (`docs/accessibility.md`)     |
| CI green                                | ✓ locally | lint, typecheck, Vitest, Jest, exports; GitHub Actions not yet connected to a repo          |
| E2E pass on iOS and Android             | ☐ blocked | Maestro flows written (`.maestro/`), never run (no emulator/simulator here)                 |
| Privacy, deletion, export verified      | ◐ partial | Logic tested; Edge Functions never executed against Supabase                                |
| Rollback and support rehearsed          | ☐         | Runbooks written (`docs/runbooks/`); restore rehearsal pending                              |

## Owner actions that unblock it (in order)

1. Accounts (B-03): Supabase (staging + prod), Expo/EAS, Apple Developer, Google Play, Sentry, RevenueCat.
2. Legal: counsel turns `docs/legal/` into published Terms, Privacy notice, Guidelines; set the URL env vars and
   a support inbox.
3. Decisions still open: D-04 store copy, D-05 analytics vendor, D-07 error copy, D-17 auth limits, D-18 SMTP,
   D-19 free limits, D-24, D-26, D-27, D-32, D-34, B-07 launch market.
4. Deploy staging (migrations, functions, secrets, cron jobs: push-dispatch every minute, recall-check daily,
   queue_subscription_notifications + purge_expired_data daily), host the deep-link files.
5. Build `preview` + `pitch`, run Maestro on both platforms, manual a11y pass, device performance runs.
6. RC on TestFlight / Play internal for ≥ 7 days with real testers → crash-free evidence.
7. `npm run preflight -- .env.production` passes → GO meeting with this table filled in.

## Known issues (carry into the RC notes)

- Search p95 346 ms in the local proxy (heaviest query); watch on staging.
- `subscription-sync` surrogate key (F-7).
- Sticker and mascot art are engineering drafts (B-04).
- Sample builds in pitch mode have no photos.
- Line and Paddock are teasers; their flags must stay off in production until their own gates pass.
