# Dynorex

"Prove Your Build. Find Your Road."

Mobile app (iOS and Android) for car builds: a digital garage, mod log and build timeline.
Expo + React Native + TypeScript, with Supabase for auth, Postgres, storage and Edge Functions.

**Status: Phase 6 of 7 (Hardening) complete as far as possible without accounts and devices; release is NO-GO
until [the go/no-go list](docs/release/go-no-go.md) is cleared.** [Phase 6 report](docs/phase-6-report.md).
**Phase 7 started:** first slices of Line (drives) and Paddock (events), behind flags that stay off in real builds
([Phase 7 report](docs/phase-7-report.md)).
For demos without an account, run `npm run pitch:web` or `npm run pitch` ([pitch mode](docs/pitch-mode.md)).
Reports: [Phase 5](docs/phase-5-report.md), [Phase 4](docs/phase-4-report.md), [Phase 3](docs/phase-3-report.md), [Phase 2](docs/phase-2-report.md), [Phase 1](docs/phase-1-report.md).

"Prove" means keeping an organised record. Dynorex does not verify vehicles, parts, work or specs.
Any spec numbers are estimates from user-reported data.

```bash
npm install
npm run web      # app shell in the browser (no backend needed)
npm test         # unit + database/RLS tests (no Docker needed)
npm run lint && npm run typecheck && npm run format:check
```

Docs: [setup](docs/setup.md) · [architecture](docs/architecture.md) · [security](docs/security.md) ·
[decisions and open questions](docs/decisions.md) · [design tokens](docs/design-tokens.md) ·
[brand](docs/brand.md) · [release](docs/release.md)

`web-pilot/` holds the earlier web MVP for reference while its rules are ported. It is not part of the app.
