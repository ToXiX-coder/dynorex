/**
 * Writes the SVG masters and every PNG size from src/components/mascot/art.ts.
 * Run: npm run brand:export   (re-run after any art change; outputs are committed)
 */
import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { TORQ_EXPRESSIONS, torqSvg } from "../src/components/mascot/art";

const OUT = path.resolve(import.meta.dirname, "../assets/brand");
const SVG_DIR = path.join(OUT, "svg");
const PNG_DIR = path.join(OUT, "png");
fs.mkdirSync(SVG_DIR, { recursive: true });
fs.mkdirSync(PNG_DIR, { recursive: true });

function png(svg: string, file: string, width: number, height = width, background?: string) {
  const wrapped = background
    ? svg.replace(/<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" fill="${background}"/>`)
    : svg;
  const r = new Resvg(wrapped, { fitTo: { mode: "width", value: width } });
  const img = r.render();
  let buf = img.asPng();
  if (Math.abs(img.height - height) > 1) {
    // letterbox onto an exact canvas (e.g. splash)
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111315"/><image href="data:image/png;base64,${buf.toString("base64")}" x="0" y="${(height - img.height) / 2}" width="${width}" height="${img.height}"/></svg>`;
    buf = new Resvg(canvas).render().asPng();
  }
  fs.writeFileSync(path.join(PNG_DIR, file), buf);
}

// ---------------------------------------------------------------- the logo (owner's artwork, D-53, v2 2026-10-10)
// Source: assets/brand/source/dynorex-logo.png (1254 px square, the owner's image used as-is; v1 kept as
// dynorex-logo-v1.*). The keyed copy has its black background faded to
// transparent so the logo sits on any dark screen. Every logo PNG below is cut from it.
const LOGO_PX = 1254;
const LOGO = fs.readFileSync(path.join(OUT, "source/dynorex-logo-keyed.png")).toString("base64");
type Crop = { x: number; y: number; w: number; h: number };
// boxes measured from the keyed image (art 49-1202 x 196-1106), with ~8 px breathing room
/** head + car + DYNOREX wordmark */
const LOCKUP: Crop = { x: 40, y: 188, w: 1172, h: 926 };
/** the DYNOREX wordmark on its own (headers) */
const WORDMARK: Crop = { x: 50, y: 917, w: 1160, h: 197 };
/** head + car, no wordmark (icons and small spots) */
const MARK: Crop = { x: 40, y: 188, w: 1156, h: 728 };

/** An SVG that places `crop` centred in a box, filling `fill` of the box width (or height, whichever binds). */
function placed(crop: Crop, boxW: number, boxH: number, fill: number, bg?: string, filter = "") {
  const s = Math.min((boxW * fill) / crop.w, (boxH * fill) / crop.h);
  const tx = (boxW - crop.w * s) / 2 - crop.x * s;
  const ty = (boxH - crop.h * s) / 2 - crop.y * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${boxW} ${boxH}">` +
    (bg ? `<rect width="${boxW}" height="${boxH}" fill="${bg}"/>` : "") +
    filter +
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})"${filter ? ' filter="url(#f)"' : ""}>` +
    `<clipPath id="c"><rect x="${crop.x}" y="${crop.y}" width="${crop.w}" height="${crop.h}"/></clipPath>` +
    `<image clip-path="url(#c)" xlink:href="data:image/png;base64,${LOGO}" width="${LOGO_PX}" height="${LOGO_PX}"/></g></svg>`
  );
}

// App and store icons (square, no transparency, OS applies the mask): the mark on asphalt.
const icon = placed(MARK, 1024, 1024, 0.84, "#111315");
for (const s of [1024, 512, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20]) png(icon, `app-icon-${s}.png`, s);
png(placed(MARK, 48, 48, 0.94, "#111315"), "favicon-48.png", 48);
// Android adaptive icon: 432 px canvas, mark inside the 264 px safe circle, transparent.
png(placed(MARK, 432, 432, 0.6), "android-adaptive-foreground-432.png", 432);
// Android monochrome: the same shape in solid white (the OS tints it).
const white = `<filter id="f"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>`;
png(placed(MARK, 432, 432, 0.6, undefined, white), "android-monochrome-432.png", 432);
// Native splash (the app's own intro takes over right after) and in-app logos at 1x/2x/3x, transparent.
png(placed(LOCKUP, 1242, Math.round((1242 * LOCKUP.h) / LOCKUP.w), 0.8), "splash-logo-1242.png", 1242);
for (const [w, tag] of [
  [240, "1x"],
  [480, "2x"],
  [720, "3x"],
] as const) {
  png(placed(LOCKUP, LOCKUP.w, LOCKUP.h, 1), `logo-lockup-${tag}.png`, w, Math.round((w * LOCKUP.h) / LOCKUP.w));
  png(placed(MARK, MARK.w, MARK.h, 1), `logo-mark-${tag}.png`, w / 2, Math.round((w / 2) * (MARK.h / MARK.w)));
  png(
    placed(WORDMARK, WORDMARK.w, WORDMARK.h, 1),
    `logo-wordmark-${tag}.png`,
    w,
    Math.round((w * WORDMARK.h) / WORDMARK.w),
  );
}

// Torq: SVG master per expression + transparent PNGs at 1x/2x/3x (120 px base width).
for (const e of TORQ_EXPRESSIONS) {
  fs.writeFileSync(path.join(SVG_DIR, `torq-${e}.svg`), torqSvg(e));
  // keep the 220x240 aspect so nothing is cropped, and stay transparent
  for (const [w, tag] of [
    [120, "1x"],
    [240, "2x"],
    [360, "3x"],
  ] as const) {
    png(torqSvg(e), `torq-${e}@${tag}.png`, w, Math.round((w * 240) / 220));
  }
}
console.log(`Wrote ${fs.readdirSync(SVG_DIR).length} SVG and ${fs.readdirSync(PNG_DIR).length} PNG files to ${OUT}`);
