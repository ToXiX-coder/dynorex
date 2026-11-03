/** Prints the measured contrast of every rendered palette pair (used for docs/design-tokens.md). */
import { contrast, palette as p } from "../src/theme/palette";

const pairs: [string, string, string][] = [
  ["Bone on Asphalt", p.boneWhite, p.asphaltBlack],
  ["Bone on Card", p.boneWhite, p.cardSurface],
  ["#AAAAAA on Card", p.logoGrayLight, p.cardSurface],
  ["#AAAAAA on Asphalt", p.logoGrayLight, p.asphaltBlack],
  ["Asphalt on Lime", p.asphaltBlack, p.electricLime],
  ["Lime on Asphalt", p.electricLime, p.asphaltBlack],
  ["Bone on Red", p.boneWhite, p.aggressiveRed],
  ["Red on Asphalt", p.aggressiveRed, p.asphaltBlack],
  ["#888888 on Asphalt", p.logoGrayDark, p.asphaltBlack],
];
for (const [name, a, b] of pairs) console.log(`${name.padEnd(22)} ${contrast(a, b).toFixed(2)}:1`);
