/**
 * Brand faces (both SIL Open Font License), bundled so they look the same on iOS, Android and web:
 * - Orbitron for screen titles and big names: wide, heavy and geometric, matching the DynoRex logo lettering
 *   (owner decision, D-54). Section titles inside a screen use the system font since D-69.
 * - Barlow Condensed for buttons, the tab bar and spec numbers: heavy and condensed, so tight spaces still fit.
 * Only these files are bundled (requiring a package index would pull in every weight).
 */
export const FONT = Object.freeze({
  /** big names (vehicle, build, profile) */
  display: "Orbitron-Black",
  /** section headers and screen titles */
  header: "Orbitron-ExtraBold",
  /** buttons, tab labels, units */
  heading: "BarlowCondensed-ExtraBold",
  spec: "BarlowCondensed-Bold",
  impact: "BarlowCondensed-BlackItalic",
});

/**
 * Loaded at runtime only where they aren't built in: the web, Expo Go and builds made before D-67. Store builds get
 * the same files built in by the expo-font plugin (app.config.ts), named after each font's PostScript name.
 */
export const FONT_FILES = {
  [FONT.display]: require("../../assets/fonts/Orbitron-Black.ttf"),
  [FONT.header]: require("../../assets/fonts/Orbitron-ExtraBold.ttf"),
  [FONT.heading]: require("../../assets/fonts/BarlowCondensed-ExtraBold.ttf"),
  [FONT.spec]: require("../../assets/fonts/BarlowCondensed-Bold.ttf"),
  [FONT.impact]: require("../../assets/fonts/BarlowCondensed-BlackItalic.ttf"),
} as Record<string, number>;
