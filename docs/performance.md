# Performance report (Phase 6)

## Targets (spec 15.1)

| Target                     | Threshold                               | Status                                             |
| -------------------------- | --------------------------------------- | -------------------------------------------------- |
| Cold start to usable shell | < 3 s on the reference device           | **Instrumented, not yet measured** (needs devices) |
| Cached Garage render       | < 1 s after launch                      | **Instrumented, not yet measured**                 |
| API p95 (our server only)  | < 500 ms                                | **Database share measured: all < 500 ms** (below)  |
| Crash-free sessions        | ≥ 99.5 % in the RC window               | Needs Sentry + RC testers                          |
| Photo uploads              | progress, cancel, retry, never block UI | Built (Phase 3); device check pending              |

## Methodology

- **Devices**: reference mid-range Android = Pixel 6a (Android 15); iOS = iPhone 12 (iOS 18). Plus one current
  flagship each for regression comparison.
- **Builds**: EAS `preview` profile (release mode, Hermes), never dev builds. Pitch build acceptable for UI timing.
- **Network**: production-like staging project, phone on 4G-class link (Network Link Conditioner "LTE" / Android
  emulator "4G"), plus Wi-Fi.
- **Cold** = app killed and removed from recents, device idle 30 s. **Warm cache** = Garage loaded once in the
  last 7 days.
- **Sample**: 20 cold starts per device per build; report p50/p95.
- **Measurement points** (`src/services/monitoring/perf.ts`, sent to Sentry as `app.perf` spans and printed in
  development): `shell_ready`, `content_visible` (the intro has lifted; the cold-start target is judged on this
  one, D-67), `garage_cached`, `garage_fresh`, all from JS start; native start-up before JS is
  Sentry's automatic app-start measurement. Slow/frozen frames come from Sentry's frame tracking.
- **Seed volume**: `npm run perf:db` loads 3,000 users, 4,000 vehicles/builds, 40,000 mods, ~15,000 build follows
  and ~10,000 follows (production-like pagination: 20 per page).

## Database latency (measured 2026-10-05, `docs/perf/db-latency.json`)

Engine: PGlite (Postgres in WASM, single thread) on a developer laptop. That's slower than hosted Postgres, so
these are an upper bound for database time. Network and Edge Function time come on top and must be measured on
staging.

| Query                     | p50 ms | p95 ms |
| ------------------------- | ------ | ------ |
| Garage list (page 1)      | 0.8    | 1.8    |
| Vehicle timeline (page 1) | 1.0    | 1.8    |
| Spec estimate             | 1.3    | 3.5    |
| Cost summary              | 0.7    | 2.1    |
| Public build page         | 1.1    | 2.6    |
| Public build specs        | 1.9    | 5.4    |
| Discover trending         | 98     | 119    |
| Discover new              | 49     | 74     |
| Home feed                 | 60     | 79     |
| Search                    | 321    | 346    |
| Notifications inbox       | 0.7    | 1.3    |

Search was 564 ms p95 before the Phase 6 fix (F-3). It's still the heaviest call; if staging p95 exceeds 300 ms,
next steps are a materialised search table refreshed on write, or limiting common-word candidates.

## Operational alert thresholds (to configure in Sentry / Supabase before release)

See `runbooks/alerts.md`: crash-free < 99.5 % (24 h), API 5xx > 1 % (15 min), p95 latency regression > 50 %
vs last release, auth failure spike, upload failure > 5 %, webhook errors or push backlog > 15 min, payment
sync failures.
