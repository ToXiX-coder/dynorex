# Release

Not releasable yet: Phase 1 of 7. This is the checklist each release candidate must pass (handoff spec 16.3).

- [ ] All migrations apply from clean and from the previous release (`supabase db reset`; staging `db push`).
- [ ] RLS + storage policy tests pass for every table and media class.
- [ ] Auth, privacy, payment and webhook security review signed off; production secrets only in secret stores.
- [ ] Accessibility and performance targets met, or exceptions documented and approved.
- [ ] CI green: lint, types, unit/integration, secret scan, real-Supabase migration job, preview builds.
- [ ] Sentry environments, release tags, redaction and alerts verified.
- [ ] Production Supabase, buckets, Edge Functions, auth providers, deep-link files, notifications, store products verified.
- [ ] Store listing, screenshots, privacy labels, terms, affiliate disclosure, support URL, deletion instructions reviewed
      (store copy pending owner approval, see decisions D-04).
- [ ] Flags default safe: `line`, `paddock`, `marketplace`, `buildOfTheWeek` off.
- [ ] RC smoke test on real iOS and Android devices; rollback and incident steps rehearsed.

## Over-the-air updates (D-67)

JavaScript and asset fixes can reach installed apps without a store review. Native changes (a new library, a config
plugin, app.config.ts) still need a new build: the fingerprint runtime version keeps an update from ever reaching a
build it doesn't match.

1. One-time: set `EXPO_PUBLIC_EAS_PROJECT_ID` (B-02, the same id push uses) and make a new build. Builds made
   without it have updates switched off.
2. Publish to the channel the build was made for, with the same environment as its eas.json profile, so a pitch
   or staging setting can never reach production:

   ```bash
   APP_ENV=production npx eas-cli@latest update --channel production --message "what changed"
   ```

   Staging is `APP_ENV=staging --channel staging`. Pitch is `APP_ENV=staging EXPO_PUBLIC_DEMO_MODE=true --channel pitch`.
3. Phones check on launch without waiting and switch to the update on their next open.
4. Run lint, typecheck and tests before every update, exactly as for a build.

## Rollback

- App: EAS Update channel rollback for JS-only changes; store phased release pause for native changes.
- Database: forward-only migrations. A bad migration is fixed by a new compensating migration, never by editing history.
