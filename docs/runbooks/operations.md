# Operations runbook (deploy, rollback, incidents, backups)

## Release order (every release)

1. `npm run format:check && npm run lint && npm run typecheck && npm test` — all green.
2. `npm run perf:db` — every query p95 < 500 ms; compare with `docs/perf/db-latency.json` (> 50 % slower = investigate).
3. Database: `npx supabase db push` to **staging**; run Maestro `pitch/` + `staging/` flows; then production.
   Migrations are additive (the upgrade test forbids drop table / truncate / bulk deletes), so the previous app
   version keeps working against the new schema.
4. Edge Functions: `npx supabase functions deploy <name>` (staging, then production). Secrets via
   `npx supabase secrets set` only.
5. App: `npm run preflight -- .env.production`, then `npx eas-cli@latest build --profile production`; submit to
   TestFlight / internal testing; RC smoke test on the reference devices; then staged rollout (Play: 10 % → 50 %
   → 100 %; App Store: phased release).
6. JS-only fixes may ship as an EAS Update on the `production` channel — never a change that needs a migration
   the old binary can't handle.

## Rollback

| What broke               | Do this                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App binary (crash spike) | Halt phased release / staged rollout; ship the previous build's JS with `eas update --branch production --republish` (if same runtime) or expedite a fixed build                          |
| JS update                | `eas update:republish` the previous update group                                                                                                                                          |
| Edge Function            | Redeploy the previous git tag of that function                                                                                                                                            |
| Migration                | Never edit a shipped migration. Write a new forward migration that restores behaviour. For data damage, use point-in-time recovery into a **new** project and copy back the affected rows |
| Feature misbehaving      | Turn its flag off in the next update; server checks stay on regardless                                                                                                                    |
| Store/RevenueCat outage  | Nothing to roll back: entitlements already recorded stay valid; purchases show "Confirming…" and retry                                                                                    |

## Incident response

1. **Declare** (anyone): severity S1 = data exposure, auth bypass, payments wrong, app unusable; S2 = major
   feature down; S3 = degraded.
2. **Contain** (S1 first hour): revoke leaked keys (rotate anon/service keys and webhook secrets), disable the
   affected Edge Function or flag, hide content via `apply_moderation`.
3. **Communicate**: status note in the app's About/support page; email affected users for data incidents;
   check legal notification deadlines (e.g. 72 h in the EU/UK) with counsel.
4. **Fix and verify** with a test that reproduces it; add it to the regression suite.
5. **Review** within 5 working days: timeline, cause, what stops it recurring.

## Backups and retention

- Supabase Pro: daily backups + point-in-time recovery (7 days). **Rehearse a restore** into a scratch project
  before launch and record how long it took.
- Storage (photos) is not covered by database PITR: enable bucket versioning or a nightly copy if loss of photos
  is unacceptable (owner decision).
- Retention: rate-limit events 1 day; notifications 180 days (add a scheduled purge before launch);
  regions 30 days; subscription and moderation logs kept (append-only) for the period counsel sets; Sentry 90 days.

## Support

Support inbox `EXPO_PUBLIC_SUPPORT_EMAIL`; first response target 2 working days; deletion requests by email
are verified by replying from the account's address, then deleted via the same delete-account path.
