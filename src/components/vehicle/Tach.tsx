import Svg, { Polygon, Text as SvgText } from "react-native-svg";
import { color, FONT } from "@/theme/tokens";

/**
 * The tachometer, drawn low-poly like the DynoRex logo: a faceted bezel, straight-edged sweep and redline bands,
 * wedge ticks, a blade needle and a hex hub. It's still a real gauge: 0–8 ×1000 RPM, a major tick every
 * 1,000 and a minor every 500, redline from 6,500, and the needle points at exactly the RPM it's given.
 */
export const MAX_RPM = 8000;
/** Where the red zone starts (6,500 RPM), as a fraction of the dial. */
export const REDLINE = 6500 / MAX_RPM;
/** Where the limiter cuts in (about 7,750 RPM). */
export const LIMIT = 0.97;

// the dial on a 100x100 grid
const CX = 50;
const CY = 52;
const START = 135; // degrees clockwise from 3 o'clock; the dial sweeps 270° over the top
const SWEEP = 270;
const FACETS = 32; // straight segments per full turn: angular, but the scale stays even

const at = (frac: number, r: number) => {
  const a = ((START + frac * SWEEP) * Math.PI) / 180;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const;
};
const pt = ([x, y]: readonly [number, number]) => `${x.toFixed(2)},${y.toFixed(2)}`;

/** A full faceted ring (polygon approximating a circle). */
const ring = (r: number, sides = 16, turn = 0) =>
  Array.from({ length: sides }, (_, i) => {
    const a = ((i + turn) / sides) * Math.PI * 2;
    return pt([CX + Math.cos(a) * r, CY + Math.sin(a) * r]);
  }).join(" ");

/**
 * A straight-edged band between radii r0 and r1 from `from` to `to` (fractions of the dial). Vertices sit on the
 * facet grid, plus the exact end points, so a band always ends precisely where its value says.
 */
const band = (from: number, to: number, r0: number, r1: number) => {
  if (to - from < 0.002) return "";
  const step = 360 / FACETS / SWEEP; // one facet, as a fraction of the dial
  const fr: number[] = [from];
  for (let f = Math.ceil(from / step) * step; f < to; f += step) if (f > from) fr.push(f);
  fr.push(to);
  const outer = fr.map((f) => pt(at(f, r1)));
  const inner = fr.reverse().map((f) => pt(at(f, r0)));
  return [...outer, ...inner].join(" ");
};

/** A tapered wedge tick pointing at the centre. */
const wedge = (frac: number, rOut: number, rIn: number, half: number) => {
  const d = half / SWEEP; // half-width at the outer edge, in dial fractions
  return [pt(at(frac - d, rOut)), pt(at(frac + d, rOut)), pt(at(frac, rIn))].join(" ");
};

/** The needle: a sharp blade from a short tail through the hub to the tip. */
const blade = (frac: number) => {
  const tip = at(frac, 33);
  const tail = at(frac + 0.5 * (360 / SWEEP), 9);
  const left = at(frac - 90 / SWEEP, 3.4);
  const right = at(frac + 90 / SWEEP, 3.4);
  return [pt(tip), pt(left), pt(tail), pt(right)].join(" ");
};

export function Tach({ size, value, numbers = false }: { size: number; value: number; numbers?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const hot = v > REDLINE;
  const majors = Array.from({ length: MAX_RPM / 1000 + 1 }, (_, i) => (i * 1000) / MAX_RPM);
  const minors = Array.from({ length: MAX_RPM / 1000 }, (_, i) => (i * 1000 + 500) / MAX_RPM);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* faceted bezel and face */}
      <Polygon points={ring(47, 16, 0.5)} fill={color.surface} stroke={color.hairline} strokeWidth={1} />
      <Polygon points={ring(43, 16, 0.5)} fill={color.background} />
      {/* scale track, redline, and the sweep up to the needle (straight-edged bands) */}
      <Polygon points={band(0, 1, 36, 41)} fill={color.hairline} />
      <Polygon points={band(REDLINE, 1, 36, hot ? 42.5 : 41)} fill={color.danger} />
      <Polygon points={band(0, Math.min(v, REDLINE), 36, 41)} fill={color.accent} />
      {/* ticks: a major wedge every 1,000 RPM, a minor every 500 */}
      {minors.map((f) => (
        <Polygon key={`m${f}`} points={wedge(f, 34, 30, 1.6)} fill={f >= REDLINE ? color.danger : color.textMuted} />
      ))}
      {majors.map((f) => (
        <Polygon key={`M${f}`} points={wedge(f, 34, 26, 3)} fill={f >= REDLINE ? color.danger : color.text} />
      ))}
      {numbers
        ? majors.map((f, i) => {
            const [x, y] = at(f, 19.5);
            return (
              <SvgText
                key={`n${i}`}
                x={x}
                y={y + 2.6}
                // bone, not red: red text on asphalt is under 4.5:1 (the red ticks mark the zone)
                fill={color.text}
                fontSize={7}
                fontFamily={FONT.header}
                textAnchor="middle"
              >
                {String(i)}
              </SvgText>
            );
          })
        : null}
      {/* blade needle and hex hub */}
      <Polygon points={blade(v)} fill={hot ? color.danger : color.accent} />
      <Polygon
        points={ring(5.5, 6)}
        fill={color.background}
        stroke={hot ? color.danger : color.accent}
        strokeWidth={2}
      />
    </Svg>
  );
}
