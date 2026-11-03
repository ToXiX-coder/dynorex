# Phase 7 (v2): first slice of Line and Paddock

Date: 2026-10-05. **Built and tested locally behind their flags. Off in every real build** (the preflight check
fails a production build if `line`, `paddock` or `marketplace` is on). On in pitch mode with sample data.

## Line (routes)

- **Record** a drive in the foreground after a consent screen ("never runs in the background"; "don't use your
  phone while driving"); pause / resume / stop; bad GPS fixes dropped (accuracy > 50 m, jitter, > 120 m/s).
- **Recovery**: the track is saved on the phone every 10 points and on pause/stop; next time the app offers
  "Unsaved drive found → Review it / Discard it". Nothing is uploaded until Save; saves are idempotent.
- **Privacy**: drives are private by default. Sharing makes the **server** keep a trimmed copy without the first
  and last 500 m, without timestamps, rounded to ~1 m, and shows only the date; drives under ~1 km can't be
  shared. Owners always see their full track; nobody else ever can.
- **Server rules**: track validated and distance/time computed server-side; **Free: 5 drives a month** (deleted
  ones still count; atomic), Dynorex+ unlimited; 30 saves/hour.
- **Discover routes**: top rated, new, near me (uses the Phase 4 coarse cell of the trimmed start).
- **Ratings**: 1–5 stars, public routes only, not your own, one per person (changeable), 30/hour.
- Public page `dynorex.app/route/:id`; report a route.
- Route shape drawn as an SVG trace (no map tiles yet).

## Paddock (events)

- **Create** an event (verified, named accounts; 5/day): name, day/time/length chips, public meeting place with a
  "never a home address" hint, optional capacity. Can't start in the past; can't be moved once started.
- **RSVP** going / interested / can't go; **capacity** enforced under a row lock (no double-booking the last spot).
- **Check-in**: the host's screen shows the event's 6-digit code (one code for the whole event since D-50; it used to
  rotate every minute); attendees
  who said Going enter it during the event window; once per person; 10 attempts/hour (anti-guessing/replay).
- **Cancel** notifies everyone who RSVP'd; **reminders** 24 h before (scheduler, once per person); both respect the
  "Event reminders" notification switch, which is now live.
- Public page `dynorex.app/events/:id`; notification taps open it; report an event; blocked hosts disappear.

## Checks

| Check                            | Result                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database tests (Phase 7)         | 12/12: validation, ownership, trimming, short-route refusal, monthly limit, ratings, blocks, nearby, capacity, check-in codes, cancel + reminders |
| App trim vs server trim          | identical on 25 random drives                                                                                                                     |
| Schema audit                     | still clean (new functions explicitly granted; service-only ones unreachable)                                                                     |
| Unit tests                       | route + event helpers, pitch-mode rules                                                                                                           |
| Accessibility audit              | 7 new screens pass (28 total)                                                                                                                     |
| Browser (pitch mode, phone size) | Line hub → simulated drive → review → share → saved route page; Paddock list → host tools with live code → RSVP updates capacity                  |

# Slice 2: Paddock community, group drives, QR check-in, maps, v2 search

Same rules: built and tested locally, off in every real build, on in pitch mode with sample data.
Migration `20261012000000_phase7b_community.sql`.

## Paddock

- **Clubs**: start (verified, named accounts; 3/day; unique names), join, leave, delete. Owners can't leave.
  Memberships are written only by server functions; nobody can see anyone else's membership rows, only counts.
- **Posts**: to everyone or to one of your clubs (members only); optional link to one of **your public** builds
  (the link disappears if the build goes private). 20 posts/hour; control characters refused.
- **Comments**: text for everyone; **Torq stickers on comments are Dynorex+ only** (enforced by RLS). 60/hour.
- **Likes**: once per person, 200/hour. Counts change only after the server accepts.
- **Feed**: "Following" (you, people you follow, your clubs) or "Everyone". Muted and blocked people are left out.
- **Club events**: hosts must be members; club pages list upcoming club events and posts.
- **Event editing**: organizers edit title, details, place, spots and time before the start; the time is locked
  once the event has started (server-enforced).
- **QR check-in**: the host's screen shows the code **and** a QR code drawn on the device. Attendees scan
  it in the app (camera opens only on tap, no microphone) or with the phone's own camera, which opens the event
  page with the code filled in. A scan never checks you in by itself: the server applies the same RSVP, window,
  90-second and 10-attempts/hour rules as a typed code. Typing still works everywhere.
- Public pages `dynorex.app/clubs/:id` and `dynorex.app/posts/:id`; report a club, post or comment.

## Line

- **Group drives**: from a shared route tap "Plan a group drive"; the event shows the route. Only shared routes
  can be used; if the route is later made private the event stays but the route link disappears. Nobody is tracked
  during a group drive.
- **Maps**: shared routes appear on a Mapbox map (Static Images API, public `pk.` token, simplified to ≤300
  points, under the 8,192-character URL limit). **Only the server-trimmed copy is ever sent to Mapbox**; your own
  full drive is still drawn on the phone. No token, or a failed image, falls back to the drawn shape.

## Search and moderation

- Search now also finds **routes, events and clubs** (public ones only, mutes respected), each group shown only
  when its feature flag is on.
- `apply_moderation` can hide/restore **routes, events, clubs, posts and comments** (audited, service role only);
  reports accept the new targets.

## Checks (slice 2)

| Check                       | Result                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Database tests (Phase 7b)   | 9/9: clubs, membership rules, posts and build links, Plus-only stickers, likes, feed, rate limits, group drives, search, moderation |
| Schema audit                | clean; `paddock_feed` added to the reviewed anon-callable list                                                                      |
| All Vitest suites           | 262/262                                                                                                                             |
| Component + accessibility   | 77/77 (7 new screens audited: group drive, plan drive, edit event, new post, start club, club, post)                                |
| Lint, typecheck, format     | clean                                                                                                                               |
| Export (iOS, Android, web)  | builds; 0 secret hits                                                                                                               |
| Preflight                   | "unfinished v2 features off" passes; the 9 known launch blockers from Phase 6 remain                                                |
| Browser (pitch mode, phone) | Paddock tabs; feed like and comment; club page; group drive page with route; host QR code                                           |

# Slice 3: hardening Line and Paddock

Migration `20261013000000_phase7c_line_usage.sql`.

## Fixed

- **"Export my data" failed for everyone** (since Phase 2): it asked for every column of `reports`, but users
  may only read some of them, so the request errored. It now asks for the readable columns and relies on
  row-level security. The export also gained everything added since Phase 4: sticker reactions, Dynorex+ plan,
  drives (full tracks, they're the owner's), ratings, events hosted, RSVPs, check-ins, clubs, memberships,
  posts, comments and likes. The table list is shared with a new test that **fails whenever a table referencing a
  user isn't exported** (or excluded with a written reason: who blocked/muted you stays private to them).
- **Drive drafts on a shared phone**: the unsaved-drive draft used one key for every account and survived
  sign-out, so the next person to sign in could be offered someone else's precise track. Drafts are now per
  account and wiped on sign-out/account deletion; the old shared draft is deleted (its owner can't be known).
- **Monthly drive count**: the Line hub counted only drives still in your list, but the limit also counts deleted
  ones (D-42), so after a delete it showed a free slot the server would refuse. It now shows the server's count
  (`my_route_usage`).

## Added

- **Offline drive uploads**: saving with no connection keeps the drive on the phone (same idempotency key, so
  retrying can never create two copies) and uploads it when Line opens or the phone comes back online. Refused
  uploads (e.g. the monthly limit) stay listed with the reason until discarded; nothing is dropped silently.
- **Load more** on routes, your drives, events, the feed and clubs (20 at a time; switching filters never mixes
  answers).

## Performance (PGlite, 2,000 routes, 1,500 events, 20,000 posts, 40,000 comments, 60,000 likes)

| Query                      | p95 before | p95 now |
| -------------------------- | ---------- | ------- |
| Paddock feed (following)   | 239 ms     | 11 ms   |
| Paddock feed (everyone)    | 236 ms     | 3 ms    |
| Upcoming events            | 210 ms     | 31 ms   |
| Search incl. routes/events | n/a        | 135 ms  |
| Discover routes (top)      | n/a        | 23 ms   |

The feed and events list now choose the page from indexed tables before building rows; two tests check they
return exactly what the public views return (hidden, deleted, blocked, muted, cancelled, club rules).

## Checks (slice 3)

Vitest 267/267 (new: export coverage, usage, fast-list equivalence), Jest 82/82 (new: offline queue and
per-account drafts), lint/typecheck/format clean, benchmark 20/20 under 500 ms. Browser (pitch mode): usage line
shows the server count and stays at 1 after deleting a drive.

## Still not built (each needs its own exit gate before launch)

- **Line**: background GPS (separate consent and battery work), interactive native Mapbox maps (needs
  `@rnmapbox/maps` and a development build).
- **Paddock**: private/invite-only clubs and club moderators (owner decision D-47), editing posts, push notifications
  for comments and likes, event photos.
- **Marketplace**: listings, offers, Stripe payments, the 5 % `dyno_fee`, shipping, disputes. Not started; it
  needs payment compliance work first.
- QR scanning needs a development or store build (Expo Go and web use typing; the phone camera link works anywhere).
