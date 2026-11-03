# Phase 6 (Hardening & launch prep): status report

Date: 2026-10-05. **Everything that can be done and verified without accounts, devices or live services is
done. Release verdict: NO-GO** until the blockers in `docs/release/go-no-go.md` are cleared.

## Done and verified here

| Area               | What                                                                                                           | Evidence                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Security review    | STRIDE threat model + code review; 6 findings fixed (F-1…F-6), 3 low accepted                                  | `docs/threat-model.md`                                      |
| Schema audit       | Catalog checks fail CI on risky grants/functions; new functions now private by default                         | `tests/integration/audit.test.ts` (9)                       |
| Performance        | DB latency at 4,000 vehicles / 40,000 mods; search fixed 564 → 346 ms p95; startup/Garage marks sent to Sentry | `npm run perf:db`, `docs/performance.md`                    |
| Accessibility      | Automated audit of 20 screens on sample data; contrast report                                                  | `tests/component/a11y.test.tsx`, `docs/accessibility.md`    |
| E2E                | 6 pitch-mode + 2 staging Maestro flows for the critical paths                                                  | `.maestro/` (**not run**)                                   |
| Migrations         | Upgrade test: Phase 3 data survives Phases 4-6; migrations can't drop/truncate                                 | `tests/integration/upgrade.test.ts`                         |
| Seed scenarios     | Plus member, lapsed member, reaction, pref, moderator                                                          | `supabase/seed.sql`, seed test                              |
| Deletion / privacy | RevenueCat data deleted with the account; store-billing warning; public deletion page; retention purge         | delete-account, `/account-deletion`, `purge_expired_data()` |
| Store & legal      | Listing pack + both stores' privacy answers; legal fact sheets for counsel; Support page; About links          | `docs/store/`, `docs/legal/`, `/support`                    |
| Production config  | `npm run preflight` blocks unsafe or incomplete release config (tested pass + service-key leak)                | `scripts/preflight.mjs`                                     |
| Operations         | Deploy, rollback, incident, backups/retention, alert thresholds                                                | `docs/runbooks/`                                            |

## Checks

lint / typecheck / format pass · Vitest **205/205** (database 87, unit 118) · Jest **63/63** (incl. 21
accessibility) · `npm run perf:db` 12/12 under 500 ms · exports for 3 platforms, 0 secret hits.

## Not done (needs what this machine/project doesn't have)

Device performance runs, crash-free window, Maestro on emulators, manual screen-reader pass, live Edge Functions,
restore rehearsal, published legal pages, store accounts. See the go/no-go table for the order.
