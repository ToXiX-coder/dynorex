import type { StickerId } from "@/domain/plus";
import { torqSvg, type TorqExpression } from "./art";

/**
 * The 12 Dynorex+ Torq stickers: a Torq pose plus a small geometric prop, in the brand palette.
 * Engineering drafts like the rest of the mascot art (B-04); a designer can replace them one by one.
 */
const LIME = "#AAFF00";
const RED = "#E00000";
const BONE = "#F2EFE8";
const GRAY = "#888888";
const ASPHALT = "#111315";

const STICKER_ART: Record<StickerId, { base: TorqExpression; prop: string }> = {
  hype: {
    base: "excited",
    prop: `<polygon points="60,20 66,32 54,32" fill="${LIME}"/><polygon points="170,22 178,34 164,34" fill="${LIME}"/><polygon points="12,110 22,116 10,122" fill="${LIME}"/>`,
  },
  wrenching: { base: "wrenching", prop: "" },
  burnout: {
    base: "neutral",
    prop: `<circle cx="30" cy="222" r="16" fill="${GRAY}" opacity="0.8"/><circle cx="56" cy="214" r="12" fill="${GRAY}" opacity="0.6"/><circle cx="16" cy="200" r="10" fill="${GRAY}" opacity="0.5"/><circle cx="190" cy="226" r="12" fill="${ASPHALT}" stroke="${GRAY}" stroke-width="4"/>`,
  },
  shrug: { base: "shrugging", prop: "" },
  thumbs_up: { base: "success", prop: "" },
  fire: {
    base: "armsCrossed",
    prop: `<polygon points="186,150 176,126 186,134 190,108 202,132 206,120 212,150" fill="${RED}"/><polygon points="190,150 186,138 194,142 198,126 204,150" fill="${LIME}"/>`,
  },
  cop_spotted: {
    base: "shrugging",
    prop: `<rect x="160" y="12" width="44" height="12" rx="3" fill="${GRAY}"/><rect x="162" y="2" width="18" height="10" fill="${RED}"/><rect x="184" y="2" width="18" height="10" fill="#2D6BFF"/><polygon points="57,32 64,32 62,58 59,58" fill="${BONE}"/><circle cx="60.5" cy="67" r="3.5" fill="${BONE}"/>`,
  },
  rev_limiter: {
    base: "excited",
    prop: `<path d="M150 50 A36 36 0 0 1 222 50" fill="none" stroke="${GRAY}" stroke-width="6"/><path d="M206 30 A36 36 0 0 1 222 50" fill="none" stroke="${RED}" stroke-width="6"/><line x1="186" y1="50" x2="216" y2="34" stroke="${RED}" stroke-width="4" stroke-linecap="round"/>`,
  },
  track_ready: {
    base: "success",
    // racing helmet shaped to Torq's skull, lime visor across the eye line
    prop: `<polygon points="90,62 98,34 126,22 170,28 200,46 204,58 92,64" fill="${ASPHALT}" stroke="${GRAY}" stroke-width="3"/><polygon points="112,48 198,50 196,60 112,60" fill="${LIME}" opacity="0.85"/>`,
  },
  sleeping: {
    base: "neutral",
    prop: `<text x="170" y="40" font-size="26" font-weight="800" fill="${LIME}">Z</text><text x="192" y="22" font-size="18" font-weight="800" fill="${LIME}">z</text><rect x="118" y="58" width="22" height="6" fill="${ASPHALT}"/>`,
  },
  money_eyes: {
    base: "excited",
    prop: `<circle cx="128" cy="62" r="13" fill="${ASPHALT}" stroke="${LIME}" stroke-width="3"/><text x="121" y="70" font-size="20" font-weight="800" fill="${LIME}">$</text>`,
  },
  wave: {
    base: "success",
    prop: `<path d="M172 96 q8 -8 0 -16" fill="none" stroke="${LIME}" stroke-width="3"/><path d="M182 100 q12 -12 0 -24" fill="none" stroke="${LIME}" stroke-width="3"/>`,
  },
};

/** Full SVG for a sticker: Torq pose with the prop drawn on top. */
export function stickerSvg(id: StickerId): string {
  const { base, prop } = STICKER_ART[id];
  const torq = torqSvg(base);
  const inner = torq.slice(torq.indexOf(">") + 1, torq.lastIndexOf("</svg>"));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 240">${inner}${prop}</svg>`;
}
