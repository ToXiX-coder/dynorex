# Phase 3 (Build core): status report

Date: 2026-10-05. **Code complete and tested locally; not yet run against a real Supabase project or a phone.**

## Built

**Database** (`supabase/migrations/20261007000000_phase3_build_core.sql`)

- Spec-delta contract (schema_version 1: hp/kW, lb-ft/Nm, lb/kg, seconds; unknown keys and out-of-range values refused).
- `vehicle_spec_estimate()`: baseline + **Complete** mods only; planned/in-progress reported separately; missing
  baseline → `unknown`; impossible results → `invalid`; fixed units and rounding. Runs under RLS.
- `vehicle_cost_summary()`: Spent = Complete + In Progress, Planned = Planned, per currency and category, integer cents.
- Free-plan limits: 2 vehicles, 20 mods per vehicle, serialised with an advisory lock so two simultaneous saves
  can't both slip through. `my_plan()` for the UI. Staff/tester override table (service role only).
- Idempotent creates (`client_ref` unique per owner) for vehicles and mods.
- `status_changed_at` maintained by the server.
- Wishlist (https-only, no credentials in URLs, affiliate flag server-only, owner-only, soft delete).
- Private `vehicle-media` bucket (10 MB, JPEG/PNG/WebP), owner-folder-only storage policies, immutable files.
- Photo rows and hero images: clients can't write them; only the `register-photo` Edge Function can.

**Edge Functions**

- `register-photo`: path in caller's folder, ownership via RLS, 20/hour limit, 12 per mod, bytes checked
  (real image by magic bytes, ≤10 MB, ≤8000 px, **no Exif/XMP/text metadata**), rejected files deleted.
- `delete-account` now also removes the user's photos; `export-data` includes the wishlist.

**App**

- Garage list (cached-first, pull to refresh, offline "Last updated", plan limit message, empty state with Torq).
- Add/Edit Vehicle: NHTSA make/model suggestions with full manual entry (lookup never required, VIN never sent),
  all fields incl. trim, build name, odometer + units, private VIN, notes, optional user-reported stock specs,
  visibility; hero photo with progress; duplicate-safe saves; delete with the spec's red confirm.
- Vehicle Detail: full-width hero with name overlay and lime accent, spec card (monospace numbers, gray units, lime
  accent, **exact disclaimer always visible**), pending changes listed separately, newest-first timeline with date
  chip / name / category icon / status / cost / notes, "Load more" pagination, exact empty message
  "Add your first mod to start your build story".
- Add/Edit Mod in the exact field order (name; category icon grid; brand + part number; cost; status; photos; spec
  deltas; notes) with a full-width Save pinned above keyboard/home indicator; drafts autosaved and restored;
  offline Save queues the draft ("Saved offline") and it syncs on reconnect without duplicates; photos upload
  after save with per-photo progress, cancel, retry.
- Mod Detail: quick status change, details, spec changes with "counts only when Complete" and the disclaimer,
  before/after photos (5-minute signed URLs), add/remove photos, edit, delete with red confirm.
- Costs: per-currency Spent/Planned with the rules stated, category pie (palette only) plus a text legend.
- Wishlist: safe-link check, confirm before leaving the app naming the site, honest "no affiliate deals" notice.
- Offline: red "You're offline" banner, 7-day per-user cache (VINs never cached), cache wiped on sign-out.
- Centre "+" now opens Add Vehicle / Add Mod (vehicle picker); v2 entries remain Coming Soon.

## Checks run on this machine

| Check                                           | Result                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / format                       | pass                                                                                                           |
| Vitest                                          | **137/137**: 43 database (incl. 13 Phase 3), 94 unit                                                           |
| Spec formula SQL vs app                         | identical on 40 random cars (units, rounding, unknown/invalid)                                                 |
| Jest (screens)                                  | **26/26** incl. 10 Phase 3 (field order, empty-timeline text, disclaimer, delete confirm, link safety, legend) |
| `expo export` android / ios / web + secret grep | all bundle; 0 hits                                                                                             |
| `expo install --check`                          | dependencies up to date                                                                                        |
| Browser (web, no backend)                       | app loads; guest Garage and + chooser ask to sign in; no runtime errors                                        |

## Not verified

- Real Supabase: storage uploads, signed URLs, Edge Functions (never executed), NHTSA calls from a phone.
- Camera/library permissions, image re-encoding and upload progress on real iOS/Android devices.
- True concurrency of the plan limit (PGlite is single-connection; the advisory lock is standard Postgres but
  needs a two-connection test against real Supabase, planned for CI).
- Cold-start/cached-Garage timing targets (needs devices; Phase 6).

## Deliberate gaps (decisions.md)

- **D-19** Free-plan limits are enforced now although Dynorex+ can't be bought yet (copy says so). Owner may switch
  them off until Phase 5.
- **D-20** Power-to-weight shown as **lb per hp** (lower is better), one decimal.
- **D-21** Swipe actions and pinch-zoom galleries not built; every action has an accessible button instead
  (the spec calls swipe a convenience only). Mod thumbnails are not shown in the timeline (avoids N+1 photo calls).
- **D-22** Offline mods can't carry photos (camera files may be cleared before sync); the app says so.
