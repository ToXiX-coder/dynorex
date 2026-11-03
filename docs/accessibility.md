# Accessibility audit (Phase 6)

## Automated (runs with `npm test`)

`tests/component/a11y.test.tsx` renders 20 screens on the pitch-mode sample data and checks every element:

- everything tappable has a screen-reader name and a role
- no explicit tap target under 44 × 44 (including hit slop)
- images have text alternatives (or are marked decorative); switches and text fields are labeled
- text scaling is never disabled (`allowFontScaling={false}` anywhere fails)

Result 2026-10-05: **20/20 screens pass**, each with a minimum number of controls actually checked so a screen
stuck on a spinner can't pass silently. Screens: Home, Garage, Vehicle detail, Add mod, Costs, Wishlist,
Discover, Search, Inbox, My profile, Public profile, Public build, Paywall, Settings, Notification settings,
Dynorex+ settings, Privacy settings, About, Support, Account deletion.

Contrast (`npx tsx scripts/contrast-report.ts`): all text pairs pass AA; Bone on Red (4.39:1) is used only for
large destructive-button labels (D-08); red is never used for body text (D-09).

## Design rules already in the components

- Status never by colour alone: status chips use shape + word; selected chips add ✓; offline banner uses ⚠ + text.
- Headings marked as headers; errors announced (`announceForAccessibility` + live regions).
- Reduced motion: skeleton shimmer and sticker animation stop; Torq art is static.
- Text scales to 200% (`maxFontSizeMultiplier={2}`); layouts wrap rather than truncate key text.
- Charts have text legends with amounts and percentages (CostChart).
- Modals: focus starts on the title; Cancel is always present.

## Manual checks still needed on devices (before release)

| Check                                                                                      | iOS | Android |
| ------------------------------------------------------------------------------------------ | --- | ------- |
| VoiceOver / TalkBack: sign-up, add vehicle, add mod, public build, paywall, delete account | ☐   | ☐       |
| Focus order in forms and modals; nothing trapped                                           | ☐   | ☐       |
| Largest text size: no clipped buttons or overlapping text on the 6 key screens             | ☐   | ☐       |
| Reduce Motion / Remove animations honoured                                                 | ☐   | ☐       |
| Hardware keyboard / switch access reaches every control                                    | ☐   | ☐       |
| Dark-only contrast in sunlight (outdoor car meets)                                         | ☐   | ☐       |

Known gaps: swipe actions and pinch-zoom are not built (D-21), so there's nothing gesture-only to make
accessible; sticker art is decorative and every sticker has a name and use in its label.
