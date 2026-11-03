/**
 * The app-open intro, as a timeline (milliseconds -> what's on screen). 5 seconds in all:
 * 0–700 the needle sweeps up through the revs into the redline, 700–1150 it bounces off the limiter,
 * 1150–1550 the tachometer zooms and fades out while the DynoRex logo fades in (1250–1650), then the logo
 * holds with speed slashes streaking past while the fuel-gauge loading bar fills from E to F (1250–5000).
 * The app shows once the intro is done and the session is ready.
 */
export const INTRO_MS = 5000;
/** When the speed slashes start streaking (as the logo arrives). */
export const SLASHES_FROM_MS = 1250;

const LIMIT = 0.97;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeIn = (x: number) => x * x * x;
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const ramp = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

export type IntroFrame = {
  /** needle position, 0..1 of the dial */
  needle: number;
  tachOpacity: number;
  tachScale: number;
  logoOpacity: number;
  logoScale: number;
  /** the fuel-gauge loading bar, 0 (E) .. 1 (F): fills slowly from when the logo appears to the end */
  fuel: number;
  done: boolean;
};

export function introFrame(t: number): IntroFrame {
  const needle =
    t < 700
      ? LIMIT * easeIn(ramp(t, 0, 700))
      : t < 1150
        ? LIMIT - 0.06 * Math.abs(Math.sin(((t - 700) / 450) * Math.PI * 3))
        : LIMIT;
  const out = easeOut(ramp(t, 1150, 1550));
  const into = easeOut(ramp(t, 1250, 1650));
  return {
    needle,
    tachOpacity: 1 - out,
    tachScale: 1 + 0.25 * out,
    logoOpacity: into,
    logoScale: 0.9 + 0.1 * into,
    fuel: easeInOut(ramp(t, SLASHES_FROM_MS, INTRO_MS)),
    done: t >= INTRO_MS,
  };
}

/**
 * Later launches (D-61, replaces "5 seconds every time" from D-52): the full intro plays on the first launch, then
 * a 1.2-second version: the logo fades in and the fuel gauge fills, no tachometer.
 */
export const QUICK_INTRO_MS = 1200;
export function quickIntroFrame(t: number): IntroFrame {
  const into = easeOut(ramp(t, 0, 250));
  return {
    needle: LIMIT,
    tachOpacity: 0,
    tachScale: 1,
    logoOpacity: into,
    logoScale: 0.95 + 0.05 * into,
    fuel: easeInOut(ramp(t, 100, QUICK_INTRO_MS)),
    done: t >= QUICK_INTRO_MS,
  };
}

/**
 * Speed slashes behind the logo: fixed lanes (so every launch looks the same), each streaking left to right on
 * its own loop. top/width are fractions of the screen; colours are brand only.
 */
export const SPEED_SLASHES = [
  { top: 0.12, w: 0.55, h: 3, c: "accent", ms: 900, delay: 0 },
  { top: 0.19, w: 0.8, h: 8, c: "accent", ms: 1100, delay: 250 },
  { top: 0.25, w: 0.4, h: 2, c: "text", ms: 700, delay: 500 },
  { top: 0.76, w: 0.7, h: 5, c: "danger", ms: 1000, delay: 120 },
  { top: 0.81, w: 0.45, h: 2, c: "text", ms: 650, delay: 380 },
  { top: 0.86, w: 0.9, h: 10, c: "accent", ms: 1250, delay: 650 },
  { top: 0.92, w: 0.5, h: 3, c: "danger", ms: 800, delay: 300 },
] as const;
