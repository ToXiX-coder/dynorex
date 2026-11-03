# Design tokens

Source of truth: `src/theme/palette.ts` and `src/theme/tokens.ts`. Dark only; there is no light theme.

## Palette (immutable)

| Token          | Hex                           | Role                                                                |
| -------------- | ----------------------------- | ------------------------------------------------------------------- |
| Asphalt Black  | `#111315`                     | background, text on lime                                            |
| Electric Lime  | `#AAFF00`                     | primary action, active tab, focus, progress, selection              |
| Aggressive Red | `#E00000`                     | errors, destructive, warnings (borders/icons/fills, not small text) |
| Bone White     | `#F2EFE8`                     | text                                                                |
| Card surface   | `#1A1D1F`                     | cards, sheets, modals                                               |
| Logo grays     | `#888888` `#999999` `#AAAAAA` | logo, units, muted text, borders                                    |

## Measured contrast (`npx tsx scripts/contrast-report.ts`; thresholds enforced in tests/unit/domain.test.ts)

| Pair                              | Ratio   | Use                                                 |
| --------------------------------- | ------- | --------------------------------------------------- |
| Bone on Asphalt                   | 16.21:1 | body text                                           |
| Bone on Card                      | 14.75:1 | card text                                           |
| #AAAAAA on Card                   | 7.29:1  | muted text, units                                   |
| #AAAAAA on Asphalt                | 8.02:1  | muted text                                          |
| #888888 on Asphalt                | 5.25:1  | disabled text, borders                              |
| Asphalt on Lime / Lime on Asphalt | 15.09:1 | primary button / accent text                        |
| Bone on Red                       | 4.39:1  | destructive label, **large text only** (18pt/800)   |
| Red on Asphalt                    | 3.70:1  | borders/icons only (≥3:1 non-text), never body text |

## Scale

- Spacing (8-pt): 2, 4, 8, 12, 16, 24, 32, 48, 64.
- Radii: 4, 8, 12, 16, pill. Borders: 1, 2, 3 (accent/focus).
- Type: display 34/800 condensed caps · heading 24/800 caps · title 18/700 · body 16/400 · caption 13/500 ·
  label 14/700 · button 16/800 · buttonLarge 18/800 · spec 28/700 mono · specUnit 14/500 mono. No weights below 400.
- Touch targets: 44 minimum; centre Add button 64.
- Motion: 150 / 250 / 400 ms; shimmer 1200 ms loop; every animation has a static reduced-motion path.
