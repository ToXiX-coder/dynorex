/**
 * Torq mascot artwork, written as SVG source so one master feeds both the app (react-native-svg) and the PNG
 * exports (scripts/export-brand.ts). The DynoRex logo itself is the owner's artwork (assets/brand/source,
 * D-53), not drawn here.
 * Pure TypeScript: no React Native imports, so it can run in Node.
 */
const C = {
  asphalt: "#111315",
  lime: "#AAFF00",
  red: "#E00000",
  bone: "#F2EFE8",
  card: "#1A1D1F",
  g1: "#888888",
  g2: "#999999",
  g3: "#AAAAAA",
} as const;

// ---------------------------------------------------------------- Torq

export const TORQ_EXPRESSIONS = [
  "neutral",
  "excited",
  "shrugging",
  "wrenching",
  "armsCrossed",
  "success",
  "upgrade",
] as const;
export type TorqExpression = (typeof TORQ_EXPRESSIONS)[number];

/**
 * Torq: an angular, low-poly T-Rex in a mechanic jacket on a 220x240 grid, facing right. Still geometric
 * (flat facets, hard edges) but built like a real theropod: long skull with a brow ridge, nostril and a
 * separate lower jaw that opens for happy poses, rows of teeth, thick neck, forward-leaning torso, heavy
 * haunches, three-toed clawed feet, a balancing tail and short two-clawed arms. Facets are shaded light-to-
 * dark from the top so he reads as solid. The tachometer eye stays at (128, 62): stickers draw on it.
 * Every silhouette shape keeps a light gray outline so nothing disappears on Asphalt Black.
 */
export function torqSvg(expr: TorqExpression): string {
  const o = `stroke="${C.g3}" stroke-width="2.5" stroke-linejoin="round"`;
  const shade = (pts: string, op: number) => `<polygon points="${pts}" fill="${C.asphalt}" opacity="${op}"/>`;
  const lit = (pts: string, op: number) => `<polygon points="${pts}" fill="${C.bone}" opacity="${op}"/>`;
  const sleeve = (pts: string) =>
    `<polyline points="${pts}" fill="none" stroke="${C.g3}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="${C.card}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  // a scaly hand with two Bone claws pointing forward
  const hand = (x: number, y: number) =>
    `<polygon points="${x - 5},${y - 4} ${x + 4},${y - 6} ${x + 7},${y + 2} ${x - 3},${y + 6}" fill="${C.g1}" ${o}/>` +
    `<polygon points="${x + 4},${y - 6} ${x + 12},${y - 5} ${x + 6},${y - 1}" fill="${C.bone}"/>` +
    `<polygon points="${x + 6},${y + 1} ${x + 13},${y + 3} ${x + 5},${y + 5}" fill="${C.bone}"/>`;

  // an open palm turned up (shrug), claws pointing up and out
  const palmUp = (x: number, y: number, dir: 1 | -1) =>
    `<polygon points="${x - 6},${y + 2} ${x + 6},${y + 2} ${x + 5},${y + 8} ${x - 5},${y + 8}" fill="${C.g1}" ${o}/>` +
    `<polygon points="${x - 5},${y + 2} ${x - 2},${y - 8} ${x + 1},${y + 2}" fill="${C.bone}"/>` +
    `<polygon points="${x + 1},${y + 2} ${x + 4 * dir + 2},${y - 7} ${x + 6},${y + 2}" fill="${C.bone}"/>`;
  // a fist with the thumb up
  const thumbUp = (x: number, y: number) =>
    `<polygon points="${x - 7},${y - 4} ${x + 7},${y - 6} ${x + 9},${y + 7} ${x - 5},${y + 9}" fill="${C.g1}" ${o}/>` +
    `<polygon points="${x - 3},${y - 5} ${x - 2},${y - 18} ${x + 4},${y - 19} ${x + 4},${y - 6}" fill="${C.g1}" ${o}/>` +
    `<polygon points="${x - 2},${y - 18} ${x + 4},${y - 19} ${x + 1},${y - 23}" fill="${C.bone}"/>` +
    `<line x1="${x - 5}" y1="${y + 1}" x2="${x + 7}" y2="${y - 1}" stroke="${C.asphalt}" stroke-width="1.5" opacity="0.6"/>` +
    `<line x1="${x - 4}" y1="${y + 5}" x2="${x + 8}" y2="${y + 3}" stroke="${C.asphalt}" stroke-width="1.5" opacity="0.6"/>`;
  // a four-point glint
  const sparkle = (x: number, y: number, r: number, fill: string = C.lime) => {
    const k = r * 0.28;
    return `<polygon points="${x},${y - r} ${x + k},${y - k} ${x + r},${y} ${x + k},${y + k} ${x},${y + r} ${x - k},${y + k} ${x - r},${y} ${x - k},${y - k}" fill="${fill}"/>`;
  };
  const sweat = (x: number, y: number) =>
    `<path d="M${x} ${y} C${x - 5} ${y + 7} ${x - 4} ${y + 12} ${x} ${y + 12} C${x + 4} ${y + 12} ${x + 5} ${y + 7} ${x} ${y} Z" fill="${C.bone}" opacity="0.9"/>` +
    `<path d="M${x - 1.5} ${y + 6} Q${x - 2.5} ${y + 9} ${x - 0.5} ${y + 10}" fill="none" stroke="${C.asphalt}" stroke-width="1" opacity="0.5"/>`;
  const puff = (x: number, y: number, r: number, op: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.g2}" opacity="${op}"/>`;

  const arms: Record<TorqExpression, string> = {
    neutral: sleeve("134,126 148,140 156,134") + hand(158, 132),
    excited: sleeve("96,122 70,100 60,80") + hand(58, 76) + sleeve("140,122 170,106 188,86") + hand(190, 82),
    shrugging:
      sleeve("100,126 80,138 70,128") + palmUp(68, 120, -1) + sleeve("136,126 156,138 166,128") + palmUp(168, 120, 1),
    wrenching:
      sleeve("134,126 152,148 164,140") +
      hand(166, 138) +
      `<polygon points="166,142 196,112 202,118 172,148" fill="${C.g3}"/><polygon points="192,104 206,104 210,116 200,122 194,112" fill="${C.g3}"/><rect x="168" y="134" width="8" height="12" fill="${C.lime}" transform="rotate(-45 172 140)"/>`,
    armsCrossed: sleeve("96,144 140,152") + sleeve("96,154 140,144") + hand(142, 152) + hand(94, 154),
    success: sleeve("134,126 158,138 170,120") + thumbUp(172, 116),
    upgrade:
      sleeve("134,122 160,104 176,84") +
      hand(178, 80) +
      // the star is held up and out in front, clear of the tach eye, and it shines
      [0, 45, 90, 135, 180, 225, 270, 315]
        .map((d) => {
          const r = (d * Math.PI) / 180;
          const x = (n: number) => (192 + Math.cos(r) * n).toFixed(1);
          const y = (n: number) => (34 + Math.sin(r) * n).toFixed(1);
          return `<line x1="${x(21)}" y1="${y(21)}" x2="${x(27)}" y2="${y(27)}" stroke="${C.lime}" stroke-width="2.5" stroke-linecap="round"/>`;
        })
        .join("") +
      `<g transform="translate(192 34) scale(0.78) translate(-150 -64)"><polygon points="150,40 158,56 176,58 162,70 166,88 150,78 134,88 138,70 124,58 142,56" fill="${C.lime}" stroke="${C.asphalt}" stroke-width="2"/></g>`,
  };

  // the reaction itself: brow, eyelid, mouth details and the effects around him
  const brows: Record<TorqExpression, string> = {
    neutral: "110,44 148,42 152,50 112,54",
    excited: "108,36 148,30 152,38 112,46", // raised high
    shrugging: "110,48 146,34 151,42 112,56", // one side up: "no idea"
    wrenching: "108,40 146,48 150,56 112,50", // furrowed, focused
    armsCrossed: "106,36 148,50 150,58 108,46", // hard scowl
    success: "108,38 148,34 152,42 112,48",
    upgrade: "108,36 148,30 152,38 112,46",
  };
  // eyelid across the top of the tach eye (y = cut line)
  const lid = (cut: number) => {
    const half = Math.sqrt(13 * 13 - (cut - 62) ** 2).toFixed(1);
    return `<path d="M${128 - +half} ${cut} A13 13 0 0 1 ${128 + +half} ${cut} Z" fill="${C.g1}" ${o}/>`;
  };
  const glint = `<circle cx="122.5" cy="56.5" r="2" fill="${C.bone}" opacity="0.9"/>`;
  const smirk = `<polyline points="106,84 114,87 121,84" fill="none" stroke="${C.asphalt}" stroke-width="2" stroke-linecap="round"/>`;
  const clenched = [148, 157, 166, 175]
    .map((x) => {
      const base = 92 - (x - 148) * 0.25;
      return `<polygon points="${x},${base} ${x + 6},${base - 1} ${x + 3},${base - 7}" fill="${C.bone}"/>`;
    })
    .join("");
  const question =
    `<path d="M24 46 Q24 32 37 32 Q50 32 50 44 Q50 52 40 56 L40 63" fill="none" stroke="${C.lime}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="40" cy="73" r="3.5" fill="${C.lime}"/>`;

  const fx: Record<TorqExpression, string> = {
    neutral: smirk + glint,
    excited:
      glint +
      sparkle(30, 58, 9) +
      sparkle(210, 56, 7) +
      sparkle(98, 16, 7) +
      sparkle(20, 92, 5, C.bone) +
      // motion arcs by the waving hands, dust kicked up from a little hop
      `<path d="M44 64 Q38 76 44 88" fill="none" stroke="${C.g3}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M204 70 Q210 82 204 94" fill="none" stroke="${C.g3}" stroke-width="2.5" stroke-linecap="round"/>` +
      puff(74, 232, 5, 0.5) +
      puff(64, 226, 3.5, 0.35) +
      puff(162, 232, 5, 0.5) +
      puff(172, 226, 3.5, 0.35),
    shrugging:
      lid(55) +
      `<polyline points="146,86 156,83 166,86 176,82" fill="none" stroke="${C.asphalt}" stroke-width="2"/>` +
      question +
      sweat(92, 26),
    wrenching:
      lid(57) +
      // tongue out in concentration, grease on the snout, sweat, sparks off the bolt
      `<polygon points="178,76 194,80 192,88 182,84" fill="${C.red}" ${o}/>` +
      `<ellipse cx="168" cy="66" rx="6" ry="2.5" fill="${C.asphalt}" opacity="0.55"/>` +
      sweat(96, 24) +
      `<line x1="210" y1="104" x2="217" y2="96" stroke="${C.lime}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="213" y1="114" x2="219" y2="113" stroke="${C.bone}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="206" y1="124" x2="212" y2="131" stroke="${C.lime}" stroke-width="2.5" stroke-linecap="round"/>` +
      sparkle(214, 86, 4, C.bone),
    armsCrossed:
      lid(59) +
      clenched +
      // steam from the nostril and an anger mark
      puff(204, 44, 5, 0.75) +
      puff(211, 33, 4, 0.6) +
      puff(206, 23, 3, 0.45) +
      `<path d="M161 15 Q167 21 161 27 M177 15 Q171 21 177 27 M163 13 Q169 19 175 13 M163 29 Q169 23 175 29" fill="none" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>`,
    success: glint + sparkle(194, 96, 7) + sparkle(198, 124, 4, C.bone) + sparkle(138, 20, 5),
    upgrade: glint + sparkle(30, 60, 7) + sparkle(160, 12, 5, C.bone) + sparkle(214, 70, 4),
  };

  // eye needle angle per expression (the tach eye is Dynorex's signature)
  const needle: Record<TorqExpression, number> = {
    neutral: 300,
    excited: 350,
    shrugging: 270,
    wrenching: 320,
    armsCrossed: 210,
    success: 345,
    upgrade: 355,
  };
  const open = expr === "excited" || expr === "success" || expr === "upgrade";

  // upper teeth hang from the upper jaw line; lower teeth stand on the lower jaw
  const upperTeeth = [142, 151, 160, 169, 178, 187]
    .map(
      (x, i) =>
        `<polygon points="${x},${80 - i * 1.2} ${x + 7},${79 - i * 1.4} ${x + 3},${88 - i * 1.6}" fill="${C.bone}"/>`,
    )
    .join("");
  const lowerJaw = open
    ? // dropped jaw with a dark mouth and its own teeth
      `<polygon points="112,84 182,74 178,88 120,100" fill="${C.asphalt}"/>` +
      `<polygon points="108,86 150,90 178,96 172,108 146,110 116,102" fill="${C.g1}" ${o}/>` +
      shade("116,102 146,110 172,108 160,104 130,102", 0.45) +
      [124, 134, 144, 154, 164]
        .map(
          (x) =>
            `<polygon points="${x},${93 + (x - 124) * 0.06} ${x + 7},${94 + (x - 124) * 0.07} ${x + 3},${86 + (x - 124) * 0.08}" fill="${C.bone}"/>`,
        )
        .join("")
    : `<polygon points="106,84 150,80 184,74 180,86 150,95 118,98" fill="${C.g1}" ${o}/>` +
      shade("118,98 150,95 180,86 170,86 148,90", 0.45);
  const brow = `<polygon points="${brows[expr]}" fill="${expr === "armsCrossed" ? C.red : C.g2}" ${o}/>`;
  const a = (needle[expr] * Math.PI) / 180;
  // tach eye face: small ticks and a red redline sector from 330° round to 15°
  const ticks = [150, 190, 230, 270, 310, 350]
    .map((d) => {
      const r = (d * Math.PI) / 180;
      return `<line x1="${(128 + Math.cos(r) * 8.5).toFixed(1)}" y1="${(62 + Math.sin(r) * 8.5).toFixed(1)}" x2="${(128 + Math.cos(r) * 11).toFixed(1)}" y2="${(62 + Math.sin(r) * 11).toFixed(1)}" stroke="${C.g3}" stroke-width="1.2"/>`;
    })
    .join("");
  const arcPt = (d: number) =>
    `${(128 + Math.cos((d * Math.PI) / 180) * 12).toFixed(1)} ${(62 + Math.sin((d * Math.PI) / 180) * 12).toFixed(1)}`;
  const redline = `<path d="M${arcPt(330)} A12 12 0 0 1 ${arcPt(375)}" fill="none" stroke="${C.red}" stroke-width="2.5"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240">
<!-- tail: thick at the hip, tapering back and up for balance -->
<polygon points="80,140 40,124 4,104 8,114 36,138 76,172" fill="${C.g1}" ${o}/>
${lit("80,140 40,124 4,104 30,120 78,150", 0.12)}${shade("8,114 36,138 76,172 72,160 38,132", 0.4)}
<!-- far leg (in shadow) -->
<polygon points="110,150 134,152 140,186 128,200 116,196" fill="${C.g1}" ${o}/>${shade("110,150 134,152 140,186 128,200 116,196", 0.45)}
<polygon points="124,196 136,190 138,222 126,224" fill="${C.g1}" ${o}/>${shade("124,196 136,190 138,222 126,224", 0.45)}
<polygon points="118,222 146,222 154,232 112,234" fill="${C.g1}" ${o}/>${shade("118,222 146,222 154,232 112,234", 0.45)}
<!-- near leg: heavy haunch, shin, three clawed toes -->
<polygon points="70,146 108,144 118,180 100,202 72,190" fill="${C.g1}" ${o}/>
${lit("70,146 108,144 96,160 74,166", 0.12)}${shade("100,202 72,190 86,184 108,184", 0.35)}
<polygon points="92,196 110,186 114,222 100,224" fill="${C.g1}" ${o}/>${shade("104,192 110,186 114,222 108,222", 0.3)}
<polygon points="88,222 120,222 128,232 82,234" fill="${C.g1}" ${o}/>
<polygon points="126,229 136,233 126,235" fill="${C.bone}"/><polygon points="112,231 122,235 112,236" fill="${C.bone}"/><polygon points="96,231 106,235 96,236" fill="${C.bone}"/>
<!-- torso in the mechanic jacket, leaning forward -->
<polygon points="72,112 134,104 150,128 144,170 108,182 74,170 64,142" fill="${C.card}" ${o}/>
${lit("72,112 134,104 128,118 80,124", 0.06)}${shade("144,170 108,182 74,170 100,166 140,154", 0.35)}
<line x1="114" y1="108" x2="110" y2="178" stroke="${C.lime}" stroke-width="3"/>
<polygon points="98,108 114,124 108,106" fill="${C.lime}"/><polygon points="130,104 114,124 120,104" fill="${C.lime}"/>
<rect x="122" y="136" width="20" height="9" fill="${C.red}" transform="rotate(-6 132 140)"/>
<!-- neck -->
<polygon points="108,96 138,88 148,108 120,116" fill="${C.g1}" ${o}/>${shade("120,116 148,108 140,100 122,106", 0.3)}
<!-- skull: angular T-Rex head, long snout, brow ridge, cheekbone, nostril -->
${lowerJaw}
<polygon points="94,64 100,44 124,34 146,38 176,43 198,52 204,62 198,74 154,80 120,86 102,82" fill="${C.g1}" ${o}/>
<polygon points="98,48 104,36 112,46" fill="${C.g2}" ${o}/>
${lit("100,44 124,34 146,38 136,48 108,50", 0.22)}
${lit("146,38 176,43 198,52 196,58 162,54 140,48", 0.16)}
${shade("170,58 198,60 196,66 172,64", 0.18)}
${shade("102,82 120,86 126,72 108,68", 0.35)}
${shade("154,80 198,74 194,68 156,72", 0.3)}
<polygon points="190,54 198,56 194,60" fill="${C.asphalt}"/>
<polygon points="150,64 172,60 168,68" fill="${C.asphalt}" opacity="0.35"/>
${brow}
${upperTeeth}
<!-- tachometer eye -->
<circle cx="128" cy="62" r="12" fill="${C.asphalt}" stroke="${C.lime}" stroke-width="2.5"/>
${ticks}${redline}
<line x1="128" y1="62" x2="${(128 + Math.cos(a) * 9).toFixed(1)}" y2="${(62 + Math.sin(a) * 9).toFixed(1)}" stroke="${C.lime}" stroke-width="3" stroke-linecap="round"/>
<circle cx="128" cy="62" r="2.5" fill="${C.red}"/>
${arms[expr]}
${fx[expr]}
</svg>`;
}
/** Accessible description for each pose, used as the image label. */
export const TORQ_LABELS: Record<TorqExpression, string> = {
  neutral: "Torq the mascot, standing by with a smirk",
  excited: "Torq the mascot, cheering and hopping with arms up",
  shrugging: "Torq the mascot, shrugging with palms up and a question mark",
  wrenching: "Torq the mascot, turning a wrench with his tongue out",
  armsCrossed: "Torq the mascot, arms crossed and fuming",
  success: "Torq the mascot, giving a thumbs up",
  upgrade: "Torq the mascot, holding up a shining Dynorex+ star",
};
