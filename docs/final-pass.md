# Final pass: making Dynorex feel like a real app

Started 2026-10-06 after all phases were built (parked items: [deferred.md](deferred.md)). Method: walk every main
screen at phone size in pitch mode, list what reads as unfinished, fix in order of impact, re-check on screen.

## Round 1 (done)

| What felt unfinished                                               | Change                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No car images anywhere: empty dark boxes on Garage, Home, Discover | **Car illustrations** until a photo is added: side profile in the right body style (roadster, sedan, coupe, hatch, SUV, truck, classic muscle) and a stable factory paint; a color in the build name wins ("Rally Red Evo" is red). Labeled as an illustration for screen readers. Real photos still replace it. |
| People shown only as @handles                                      | **Initials avatars** with a stable color per person (all pass 4.5:1 contrast), lime ring for Dynorex+, on profiles, posts, comments and search                                                                                                                                                                   |
| Profiles and pages ended in a wall of full-width Mute/Report/Block | Primary action stays (Follow, RSVP, Join); **secondary actions moved to a "⋯" menu** (header on build, event, club, route and post pages; inline on comments) in a bottom sheet with short explanations                                                                                                          |
| Profile header was a column of text                                | Avatar + name + badge row, **stats row** (followers, following, builds, reputation)                                                                                                                                                                                                                              |
| Paywall said "(later)" for features that exist in pitch mode       | Rows follow the feature flags: production still honestly says "(later)" for Line, Paddock and Marketplace                                                                                                                                                                                                        |
| Taps felt flat                                                     | **Press feedback** on every card/row link (same dim-and-shrink as buttons); **haptics** on follow, like, RSVP, sticker, comment, rating and saving a drive (warning buzz on refusals; never on web)                                                                                                              |
| Lists couldn't be refreshed by pulling                             | **Pull-to-refresh** (lime spinner) on Line, Paddock, club, post and event pages (Home, Garage, Discover, Inbox, builds already had it)                                                                                                                                                                           |

Checks: Vitest 272/272, Jest 82/82 (the accessibility audit now also covers the "⋯" header buttons), lint,
typecheck, format clean.

## Round 2: high-end look, still aggressive (done)

Brand rules kept: Asphalt / Electric Lime / Aggressive Red / Bone only for UI, heavy condensed type, nothing thin.

| Area       | Change                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography | **Barlow Condensed** (SIL Open Font License) bundled so iOS, Android and web look identical: ExtraBold Italic for display titles, ExtraBold for headings, buttons and tab labels (uppercase, tracked), Bold tabular numerals for specs, Black Italic for hero numbers. Only 4 font files ship; loaded behind the brand splash with a 2 s fallback.                     |
| Car art v2 | Studio render: shaded paint with specular sweep, rocker shadow and shoulder crease; deep wheel arches; 10-spoke rims with disc and **Aggressive Red calipers**; glowing head/tail lamps; floor reflection; full-bleed backdrop with **diagonal lime light streaks**; rear wing on track models (STI, Evo, Type R, GT3, GT-R…). Scales to heroes, cards and thumbnails. |
| Heroes     | Vehicle and build pages: tall art/photo, fade to Asphalt, skewed lime slash, lime kicker, name in heavy italic, and up to three headline numbers (HP, torque, 0–60) in Black Italic with lime units. Numbers are only real estimates; the spec card below keeps the disclaimer.                                                                                        |
| Spec cards | "Dyno readout": tracked condensed labels, hairline frame, lime power bars for HP and torque (decorative, hidden from screen readers).                                                                                                                                                                                                                                  |
| Routes     | "Night map" panel: grid and contours, glowing lime route, lime start ring, checkered finish. Still drawn on the phone, never sent anywhere.                                                                                                                                                                                                                            |
| Surfaces   | Hairline edges on cards; skewed lime section-header slashes on 26 headers; lime glow on the + button; skewed active-tab bar; feed rows with lime category tiles, avatars and times.                                                                                                                                                                                    |

Checks: Vitest 272/272, Jest 82/82, lint, typecheck, format; iOS/Android/web export builds, 4 fonts bundled, 0 secret hits.

## Round 3: bolder graphics, same design language (done)

| Area          | Change                                                                                                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Power gauge   | Tachometer on vehicle and build pages: lime fill up to the HP estimate, Aggressive Red redline, Bone marker at the owner's stock power with "+N hp over stock". Needle swings in on load. Only real numbers (the estimate), never an invented dyno curve; the spec card keeps the disclaimer. |
| Motion        | Hero numbers count up; a lime light sweep crosses hero cars every few seconds. Everything is static with reduced motion; the sweep runs only on heroes, not in lists.                                                                                                                         |
| Event posters | Paddock events and event pages lead with a race-poster block: lime month, huge day, weekday and start time, racing stripes, GROUP DRIVE (lime, red stripe, checkered strip) or MEET badge, red CANCELLED tag.                                                                                 |
| Club crests   | Shield crest per club in its own stable color with a lime rim and slash, on club lists and club pages.                                                                                                                                                                                        |
| Launch splash | Lime and red slashes race in behind the logo, animated loader sweep (under 1 s; static with reduced motion).                                                                                                                                                                                  |

Checks: Vitest 273/273, Jest 82/82, lint, typecheck, format.

## Round 4: whole-app UI audit and navigation (done)

| Area          | Change                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Way back      | Every screen except a section's start screen has the same back chevron (`components/navigation/stackOptions.tsx`), in all four tab stacks and the top-level stack. It goes back through history, or to that section's home when opened from another tab, a notification or a link. Tabs remember history, so back from a car opened on Home returns to Home. Add's Close works without history too. |
| Times         | Raw timestamps ("10/5/2026, 9:15:05 PM") replaced app-wide with "12 min ago", "Yesterday", "4 days ago", "Sep 16" (`domain/when.ts`).                                                                                                                                                                                                                                                               |
| Notifications | Lime unread dot, title with the time on the right, read items dimmed.                                                                                                                                                                                                                                                                                                                               |
| Home          | Discover uses the same slash section header as every other section, with "See all". Build-update rows no longer truncate: mod, "on Build", then avatar, owner and time.                                                                                                                                                                                                                             |
| Profile       | Avatar header with name, Dynorex+ badge and goal; one-line location and experience; tappable Followers / Following stat strip with the reputation badge; Edit and Settings side by side; menu card for garage, public profile and Dynorex+.                                                                                                                                                         |
| Costs         | Donut chart; legend rows show the category and percent on one line and the amount under it (no more wrapping), with skewed swatches.                                                                                                                                                                                                                                                                |

Checks: Vitest 297/297, Jest 88/88, lint, typecheck, format.

## Round 5: driver easter eggs, one check-in code (done)

| Area           | Change                                                                                                                                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your driver    | A little car person on the Home profile button, your profile and public profiles, dressed for your build goal: race helmet and suit for Track, flat cap and mechanic's jacket for Restomod, beanie and flannel for Off-Road, and so on. Brand colours only (`components/social/Driver.tsx`).                                           |
| Kit out        | Profile → "Kit out your driver": pick what you're into (re-dresses the driver, also tunes "For you" in Discover), then swap headgear (8), outfit (5) and what's in hand (5). Each option previews on your own driver; "FOR YOU" marks your interest's pick. Saved on the server (`users.driver_gear`, checked against the same lists). |
| Easter egg     | Tap a driver and they hop and say something in character ("10 mm socket? Never seen it."); the full race kit has its own lines. Static with reduced motion; screen readers hear what they're wearing.                                                                                                                                  |
| Event check-in | One code per event instead of a new one every minute (D-50).                                                                                                                                                                                                                                                                           |

Checks: Vitest 305/305, Jest 89/89, lint, typecheck, format.

## Round 6: more car easter eggs (done)

Honk the car, rev the gauge into the limiter, prank parts ("blinker fluid"), search words ("vtec"), odometer
milestones, the logo roar and "Cars & Coffee o'clock" greetings. Full list and rules: [easter-eggs.md](easter-eggs.md).
Checks: Vitest 315/315, Jest 92/92, lint, typecheck, format.

## Round 7: smarter forms (done)

| Area          | Change                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mod category  | Picked from the mod name, including names people type themselves ("Garrett GTX turbo kit" → Engine, "BC Racing coilovers" → Suspension, "NRG steering wheel" → Interior). Shows "Picked from the mod name"; tapping another category overrides it.                                                                                         |
| Scroll wheels | Every date, time and length is a dropdown that opens a scroll-wheel sheet (`components/forms/Wheel.tsx`, `PickerFields.tsx`): mod install date, event day, start time, how long, vehicle year (garage and onboarding). Changes apply on Done; optional dates can be cleared. Screen readers get adjustable controls (swipe up/down).       |
| Meeting place | Suggests places as you type (Mapbox Search Box, public token, no Dynorex server). "Use my location" ranks nearby places first; the point is rounded to ≈1 km on the phone and never saved. Street addresses get a "public spot, not a home" reminder. Without a token it says suggestions aren't connected; pitch mode uses sample places. |

Checks: Vitest 343/343, Jest 96/96, lint, typecheck, format.

## Candidates for the next rounds

- Loading skeletons in the shape of the content instead of spinners.
- Toast confirmations ("Saved", "Posted") for actions that don't navigate.
- Empty states with Torq poses on every list; first-run tips.
- Real sample photos for pitch mode (would need licensed images; illustrations are used instead).
- App icon, splash and store screenshots review on real devices.
