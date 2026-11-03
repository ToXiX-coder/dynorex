import { memo, useEffect, useId, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { artLabel, bodyStyleFor, hasWing, paintFor, shade, type BodyStyle } from "@/domain/vehicleArt";
import type { VehicleKind } from "@/domain/vehicleKind";

/**
 * Side-profile illustration of a car in its body style and paint, shown until the owner adds a photo.
 * Drawn in a 400x200 box; front faces left. Studio-lit and stylised (shaded paint, glowing lamps, lime light
 * streaks), but still clearly an illustration, so it never passes for a photo of the owner's car.
 */
type Shape = { body: string; windows: string[]; wheels: [number, number]; r: number; cy: number; extra?: string };

const SHAPES: Record<BodyStyle, Shape> = {
  sedan: {
    body: "M30 142C30 128 36 120 52 117L118 108C132 106 140 100 150 92L176 74C182 70 188 68 196 68L262 68C272 68 278 70 284 76L312 102L352 108C366 110 372 118 372 130L372 142C372 148 368 152 362 152L324 152A32 32 0 0 0 260 152L140 152A32 32 0 0 0 76 152L40 152C34 152 30 148 30 142Z",
    windows: [
      "M160 96L182 76C186 73 190 72 196 72L230 72L230 98Z",
      "M236 72L260 72C268 72 274 74 279 79L300 100L236 100Z",
    ],
    wheels: [108, 292],
    r: 26,
    cy: 150,
  },
  coupe: {
    body: "M28 140C28 127 34 120 50 118L128 110C142 108 150 102 160 95L188 76C194 72 200 71 208 71L250 71C262 71 272 76 282 84L330 108L356 112C368 114 372 122 372 132L372 142C372 148 368 152 362 152L324 152A32 32 0 0 0 260 152L140 152A32 32 0 0 0 76 152L38 152C32 152 28 148 28 140Z",
    windows: [
      "M170 96L192 79C196 76 200 75 206 75L236 75L236 99Z",
      "M242 75L252 75C262 75 270 79 278 86L304 102L242 102Z",
    ],
    wheels: [108, 292],
    r: 26,
    cy: 150,
  },
  hatch: {
    body: "M40 142C40 128 46 120 60 117L120 108C132 106 140 100 150 92L174 72C180 67 186 66 194 66L300 66C310 66 316 70 320 78L334 108C340 112 344 118 344 128L344 142C344 148 340 152 334 152L312 152A32 32 0 0 0 248 152L142 152A32 32 0 0 0 78 152L48 152C42 152 40 148 40 142Z",
    windows: [
      "M160 94L180 74C184 71 188 70 194 70L236 70L236 98Z",
      "M242 70L296 70C304 70 308 73 311 79L322 100L242 100Z",
    ],
    wheels: [110, 280],
    r: 26,
    cy: 150,
  },
  roadster: {
    body: "M34 142C34 130 40 123 54 120L140 112C150 110 158 106 166 100L186 84L192 86L178 102L258 102C266 102 272 98 278 94L296 94L300 104L344 110C358 112 366 120 366 132L366 142C366 148 362 152 356 152L320 152A30 30 0 0 0 260 152L140 152A30 30 0 0 0 80 152L42 152C36 152 34 148 34 142Z",
    windows: ["M168 100L186 86L189 87L176 101Z"],
    wheels: [110, 290],
    r: 24,
    cy: 150,
  },
  suv: {
    body: "M30 136C30 122 36 114 50 112L108 106C116 104 120 100 124 94L140 58C143 52 148 50 156 50L342 50C350 50 354 54 356 60L366 104C370 108 372 114 372 124L372 140C372 148 368 152 360 152L334 152A36 36 0 0 0 262 152L146 152A36 36 0 0 0 74 152L40 152C34 152 30 146 30 136Z",
    windows: [
      "M136 92L150 60C152 56 154 55 158 55L210 55L210 92Z",
      "M216 55L272 55L272 92L216 92Z",
      "M278 55L336 55C340 55 342 57 343 60L350 92L278 92Z",
    ],
    wheels: [110, 298],
    r: 30,
    cy: 148,
  },
  truck: {
    body: "M24 136C24 122 30 114 44 112L100 106C108 104 112 100 116 94L132 60C135 54 140 52 148 52L222 52C230 52 234 56 236 62L240 100L376 100L376 140C376 148 372 152 364 152L340 152A36 36 0 0 0 268 152L140 152A36 36 0 0 0 68 152L34 152C28 152 24 146 24 136Z",
    windows: [
      "M128 92L142 62C144 58 146 57 150 57L186 57L186 92Z",
      "M192 57L222 57C228 57 231 60 232 64L234 92L192 92Z",
    ],
    wheels: [104, 304],
    r: 30,
    cy: 148,
    extra: "M246 108L370 108",
  },
  muscle: {
    body: "M22 140C22 128 26 122 38 120L150 112C158 110 164 106 170 100L194 80C198 76 204 75 212 75L254 75C262 75 268 78 274 84L296 106L366 110C374 112 378 118 378 128L378 142C378 148 374 152 368 152L334 152A32 32 0 0 0 270 152L132 152A32 32 0 0 0 68 152L30 152C24 152 22 148 22 140Z",
    windows: [
      "M180 100L198 83C201 80 205 79 211 79L238 79L238 102Z",
      "M244 79L252 79C259 79 264 82 268 87L284 104L244 104Z",
    ],
    wheels: [100, 302],
    r: 26,
    cy: 150,
  },
};

// [front x, rear x, lamp y] for the head- and taillights
const LAMPS: Record<BodyStyle, [number, number, number]> = {
  sedan: [30, 372, 124],
  coupe: [28, 372, 124],
  hatch: [40, 344, 122],
  roadster: [34, 366, 126],
  suv: [30, 372, 116],
  truck: [24, 376, 114],
  muscle: [22, 378, 126],
};

// rear wing mount point [x, y] for track-focused models (none on SUVs and trucks)
const WING_AT: Partial<Record<BodyStyle, [number, number]>> = {
  sedan: [340, 106],
  coupe: [342, 110],
  hatch: [302, 66],
  roadster: [334, 108],
  muscle: [352, 108],
};

function Wheel({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  const rim = r * 0.68;
  const spokes = Array.from({ length: 10 }, (_, i) => {
    const a = ((i * 36 + (i % 2) * 6 - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(a) * rim * 0.92, y: cy + Math.sin(a) * rim * 0.92 };
  });
  return (
    <G>
      {/* tyre with a lit sidewall */}
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id}-tyre)`} />
      <Circle cx={cx} cy={cy} r={rim + 1.5} fill="#0b0c0e" />
      {/* brake disc and an Aggressive Red caliper behind the spokes */}
      <Circle cx={cx} cy={cy} r={rim * 0.78} fill="#4a4f56" />
      <Path
        d={`M${cx + rim * 0.2} ${cy - rim * 0.8}A${rim * 0.82} ${rim * 0.82} 0 0 1 ${cx + rim * 0.8} ${cy - rim * 0.2}L${cx + rim * 0.5} ${cy - rim * 0.12}A${rim * 0.52} ${rim * 0.52} 0 0 0 ${cx + rim * 0.12} ${cy - rim * 0.5}Z`}
        fill="#E00000"
      />
      {spokes.map((s, i) => (
        <Line
          key={i}
          x1={cx}
          y1={cy}
          x2={s.x}
          y2={s.y}
          stroke={`url(#${id}-rim)`}
          strokeWidth={i % 2 ? r * 0.07 : r * 0.1}
          strokeLinecap="round"
        />
      ))}
      <Circle cx={cx} cy={cy} r={rim} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={r * 0.1} />
      <Circle cx={cx} cy={cy} r={r * 0.13} fill="#1d2024" stroke="#8d939b" strokeWidth={1} />
    </G>
  );
}

// D-71: where the two-wheelers stand (bottom of their tyres) in the same 400x200 box
const BIKE_GROUND = { motorcycle: 184, ebike: 182 } as const;

/** A thin bicycle wheel: tyre, rim and wire spokes. */
function SpokedWheel({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r - 3} fill="none" stroke="#141518" strokeWidth={6} />
      <Circle cx={cx} cy={cy} r={r - 7} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={2} />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        return (
          <Line
            key={i}
            x1={cx + Math.cos(a) * 4}
            y1={cy + Math.sin(a) * 4}
            x2={cx + Math.cos(a + 0.35) * (r - 8)}
            y2={cy + Math.sin(a + 0.35) * (r - 8)}
            stroke="#8d939b"
            strokeWidth={0.8}
            opacity={0.8}
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={4} fill="#1d2024" stroke="#8d939b" strokeWidth={1} />
    </G>
  );
}

/**
 * Side profiles for motorcycles and e-bikes, front to the left like the cars: painted tank or frame, dark mechanicals,
 * a lit headlamp and the shared wheel styles. Same studio, same lighting, so a mixed garage reads as one set.
 */
function BikeDrawing({ kind, paint, id, ground }: { kind: "motorcycle" | "ebike"; paint: string; id: string; ground: number }) {
  const shadow = <Ellipse cx={200} cy={ground} rx={150} ry={7} fill={`url(#${id}-shadow)`} />;
  if (kind === "motorcycle") {
    const cy = ground - 34;
    return (
      <G>
        {shadow}
        {/* swingarm, exhaust and engine in the dark */}
        <Line x1={290} y1={cy} x2={222} y2={cy - 18} stroke="#2a2d33" strokeWidth={7} strokeLinecap="round" />
        <Rect x={168} y={cy - 46} width={66} height={42} rx={8} fill="#24272c" />
        <Rect x={176} y={cy - 40} width={22} height={30} rx={3} fill="#33373e" />
        <Path d={`M226 ${cy - 6}L298 ${cy - 16}L322 ${cy - 24}`} stroke="#8d939b" strokeWidth={7} strokeLinecap="round" fill="none" />
        {/* frame and fork */}
        <Line x1={150} y1={cy - 58} x2={240} y2={cy - 50} stroke="#1a1c20" strokeWidth={6} />
        <Line x1={110} y1={cy} x2={148} y2={cy - 76} stroke="#9aa0a8" strokeWidth={6} strokeLinecap="round" />
        <Line x1={136} y1={cy - 82} x2={164} y2={cy - 86} stroke="#1a1c20" strokeWidth={4} strokeLinecap="round" />
        {/* painted tank, tail and front cowl, with a highlight */}
        <Path
          d={`M148 ${cy - 58}C156 ${cy - 82} 206 ${cy - 86} 232 ${cy - 68}L238 ${cy - 52}L156 ${cy - 48}Z`}
          fill={`url(#${id}-paint)`}
        />
        <Path d={`M162 ${cy - 70}C178 ${cy - 80} 204 ${cy - 80} 220 ${cy - 72}`} stroke={shade(paint, 0.55)} strokeWidth={1.6} fill="none" opacity={0.8} />
        <Path d={`M232 ${cy - 64}L298 ${cy - 60}C306 ${cy - 59} 308 ${cy - 54} 302 ${cy - 50}L238 ${cy - 50}Z`} fill="#16181b" />
        <Path d={`M292 ${cy - 62}L334 ${cy - 72}L338 ${cy - 66}L302 ${cy - 52}Z`} fill={`url(#${id}-paint)`} />
        <Path d={`M140 ${cy - 82}C126 ${cy - 76} 122 ${cy - 58} 132 ${cy - 50}L150 ${cy - 56}Z`} fill={`url(#${id}-paint)`} />
        {/* lamps */}
        <Ellipse cx={124} cy={cy - 64} rx={24} ry={10} fill={`url(#${id}-head)`} opacity={0.6} />
        <Circle cx={130} cy={cy - 64} r={5} fill="#F2EFE8" />
        <Ellipse cx={338} cy={cy - 68} rx={14} ry={7} fill={`url(#${id}-tail)`} opacity={0.6} />
        <Rect x={334} y={cy - 71} width={6} height={5} rx={2} fill="#ff2a2a" />
        <Wheel cx={110} cy={cy} r={34} id={id} />
        <Wheel cx={290} cy={cy} r={34} id={id} />
      </G>
    );
  }
  // real proportions: the wheelbase is under twice a wheel's diameter
  const r = 42;
  const cy = ground - r;
  const F = { x: 122, y: cy };
  const BB = { x: 200, y: cy + 2 };
  const R = { x: 282, y: cy };
  const H = { x: 148, y: cy - 74 };
  const S = { x: 188, y: cy - 78 };
  const tube = { stroke: `url(#${id}-paint)`, strokeWidth: 7, strokeLinecap: "round" as const };
  return (
    <G>
      {shadow}
      <SpokedWheel cx={F.x} cy={F.y} r={r} id={id} />
      <SpokedWheel cx={R.x} cy={R.y} r={r} id={id} />
      {/* fork, chain and the rear hub motor */}
      <Line x1={F.x} y1={F.y} x2={H.x} y2={H.y} stroke="#9aa0a8" strokeWidth={4} strokeLinecap="round" />
      <Line x1={BB.x} y1={BB.y + 8} x2={R.x} y2={R.y + 6} stroke="#3a3f47" strokeWidth={2} />
      <Circle cx={R.x} cy={R.y} r={11} fill="#24272c" stroke="#3a3f47" strokeWidth={1.5} />
      {/* frame: down tube carries the battery */}
      <Line x1={H.x - 2} y1={H.y + 12} x2={BB.x} y2={BB.y} {...tube} strokeWidth={9} />
      <Line x1={H.x + 6} y1={H.y + 22} x2={BB.x - 8} y2={BB.y - 10} stroke="#1a1c20" strokeWidth={9} strokeLinecap="round" />
      <Line x1={H.x + 8} y1={H.y + 22} x2={BB.x - 10} y2={BB.y - 12} stroke="#AAFF00" strokeWidth={1.2} opacity={0.7} />
      <Line x1={H.x} y1={H.y + 6} x2={S.x} y2={S.y + 8} {...tube} />
      <Line x1={BB.x} y1={BB.y} x2={S.x} y2={S.y} {...tube} />
      <Line x1={BB.x} y1={BB.y} x2={R.x} y2={R.y} {...tube} strokeWidth={5} />
      <Line x1={S.x} y1={S.y + 4} x2={R.x} y2={R.y} {...tube} strokeWidth={5} />
      <Circle cx={BB.x} cy={BB.y} r={9} fill="#2a2d33" stroke="#8d939b" strokeWidth={1.5} />
      {/* cockpit and saddle */}
      <Path d={`M${H.x} ${H.y}L${H.x - 4} ${H.y - 14}L${H.x + 16} ${H.y - 18}`} stroke="#1a1c20" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Line x1={S.x} y1={S.y} x2={S.x - 3} y2={S.y - 10} stroke="#1a1c20" strokeWidth={4} />
      <Path d={`M${S.x - 22} ${S.y - 12}C${S.x - 10} ${S.y - 17} ${S.x + 10} ${S.y - 16} ${S.x + 14} ${S.y - 11}L${S.x - 20} ${S.y - 8}Z`} fill="#16181b" />
      {/* lamps */}
      <Ellipse cx={H.x - 12} cy={H.y + 10} rx={18} ry={8} fill={`url(#${id}-head)`} opacity={0.6} />
      <Circle cx={H.x - 6} cy={H.y + 10} r={3.5} fill="#F2EFE8" />
      <Rect x={S.x + 22} y={S.y + 4} width={5} height={4} rx={1.5} fill="#ff2a2a" />
    </G>
  );
}

export const VehicleArt = memo(function VehicleArt({
  make,
  model,
  year,
  seed,
  hint,
  style,
  label,
  inset = 0,
  animate = false,
  kind,
}: {
  make: string;
  model: string;
  year?: number | null;
  /** Usually the vehicle id: keeps the paint color stable. */
  seed: string;
  /** Build title or nickname: a color named there ("Rally Red Evo") is used for the paint. */
  hint?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Give a label only where the picture isn't already described by surrounding text. */
  label?: string | false;
  /** Lift the car this many points off the bottom edge (heroes put the title over the lower part). */
  inset?: number;
  /** Heroes only: a lime light sweep crosses the car every few seconds (off with reduced motion). */
  animate?: boolean;
  /** D-71: motorcycles and e-bikes get their own drawing (cars when left out) */
  kind?: VehicleKind;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const body = bodyStyleFor(make, model, year);
  const s = SHAPES[body];
  const paint = paintFor(seed, hint).hex;
  const bike = kind === "motorcycle" || kind === "ebike" ? kind : null;
  const ground = bike ? BIKE_GROUND[bike] : s.cy + s.r;
  const [front, rear, lampY] = LAMPS[body];
  const wing = hasWing(model) ? WING_AT[body] : undefined;
  const a11y = label === false ? undefined : (label ?? artLabel(year, make, model));
  return (
    <View
      style={[{ backgroundColor: "#0e0f11", overflow: "hidden" }, style]}
      accessible={Boolean(a11y)}
      accessibilityRole={a11y ? "image" : undefined}
      accessibilityLabel={a11y}
    >
      {/* full-bleed studio backdrop: fills any frame (tall heroes, wide cards, square thumbnails) */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`${id}-studio`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1f2227" />
            <Stop offset="0.75" stopColor="#121417" />
            <Stop offset="1" stopColor="#0b0c0e" />
          </LinearGradient>
          <LinearGradient id={`${id}-streak`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#AAFF00" stopOpacity="0" />
            <Stop offset="0.55" stopColor="#AAFF00" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#AAFF00" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id}-studio)`} />
        <Polygon points="0,62 100,8 100,16 0,70" fill={`url(#${id}-streak)`} />
        <Polygon points="0,78 100,30 100,32.5 0,80.5" fill={`url(#${id}-streak)`} opacity={0.6} />
      </Svg>
      {/* the car, standing on the bottom edge */}
      <View style={[StyleSheet.absoluteFill, { bottom: inset }]} pointerEvents="none">
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          viewBox="0 34 400 152"
          preserveAspectRatio="xMidYMax meet"
        >
          <Defs>
            <LinearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={shade(paint, 0.35)} />
              <Stop offset="0.38" stopColor={paint} />
              <Stop offset="0.7" stopColor={shade(paint, -0.25)} />
              <Stop offset="1" stopColor={shade(paint, -0.6)} />
            </LinearGradient>
            <LinearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#4a5664" />
              <Stop offset="0.5" stopColor="#1b2027" />
              <Stop offset="1" stopColor="#0c0f12" />
            </LinearGradient>
            <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#e3e7ec" />
              <Stop offset="1" stopColor="#6f757d" />
            </LinearGradient>
            <RadialGradient id={`${id}-tyre`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0.7" stopColor="#141518" />
              <Stop offset="0.92" stopColor="#24272b" />
              <Stop offset="1" stopColor="#0c0d0f" />
            </RadialGradient>
            <RadialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#000" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#000" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id={`${id}-head`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#F2EFE8" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#F2EFE8" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id={`${id}-tail`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#E00000" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#E00000" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0b0c0e" stopOpacity="0.55" />
              <Stop offset="0.6" stopColor="#0b0c0e" stopOpacity="1" />
            </LinearGradient>
            <ClipPath id={`${id}-body`}>
              <Path d={s.body} />
            </ClipPath>
          </Defs>

          {/* floor (the studio backdrop is the full-bleed layer behind this drawing) */}
          <Rect x={-200} y={ground} width={800} height={200 - ground} fill="#0b0c0e" />
          <Line x1={-200} y1={ground} x2={600} y2={ground} stroke="#F2EFE8" strokeOpacity={0.06} strokeWidth={1} />

          {bike ? (
            <BikeDrawing kind={bike} paint={paint} id={id} ground={ground} />
          ) : (
          <>
          {/* floor reflection, faded into the floor */}
          <G transform={`translate(0 ${ground * 2}) scale(1 -1)`} opacity={0.18}>
            <Path d={s.body} fill={paint} />
          </G>
          <Rect x={-200} y={ground} width={800} height={200 - ground} fill={`url(#${id}-fade)`} />
          <Ellipse cx={(s.wheels[0] + s.wheels[1]) / 2} cy={ground} rx={190} ry={9} fill={`url(#${id}-shadow)`} />

          {/* deep wheel-arch shadows behind the body */}
          <Circle cx={s.wheels[0]} cy={s.cy} r={s.r + 4} fill="#050506" />
          <Circle cx={s.wheels[1]} cy={s.cy} r={s.r + 4} fill="#050506" />

          {/* body with shaded layers clipped to its outline */}
          <Path d={s.body} fill={`url(#${id}-paint)`} />
          <G clipPath={`url(#${id}-body)`}>
            {/* rocker panel in shadow */}
            <Rect x={0} y={lampY + 16} width={400} height={60} fill="#000" opacity={0.35} />
            {/* specular sweep */}
            <Polygon
              points={`${front + 70},20 ${front + 120},20 ${front + 70},200 ${front + 20},200`}
              fill="#fff"
              opacity={0.08}
            />
            <Polygon
              points={`${rear - 90},20 ${rear - 76},20 ${rear - 126},200 ${rear - 140},200`}
              fill="#fff"
              opacity={0.06}
            />
            {/* shoulder crease catching the light */}
            <Line
              x1={front + 26}
              y1={lampY - 6}
              x2={rear - 22}
              y2={lampY - 8}
              stroke={shade(paint, 0.55)}
              strokeWidth={1.4}
              opacity={0.8}
            />
            <Line
              x1={front + 26}
              y1={lampY - 4.5}
              x2={rear - 22}
              y2={lampY - 6.5}
              stroke="#000"
              strokeWidth={1}
              opacity={0.25}
            />
          </G>
          {/* crisp outline */}
          <Path d={s.body} fill="none" stroke={shade(paint, -0.7)} strokeWidth={1} opacity={0.6} />

          {/* glass with a reflection */}
          {s.windows.map((w, i) => (
            <Path key={i} d={w} fill={`url(#${id}-glass)`} stroke="#050607" strokeWidth={1.2} />
          ))}
          {s.extra ? <Path d={s.extra} stroke={shade(paint, -0.55)} strokeWidth={3} /> : null}

          {/* rear wing on track builds */}
          {wing ? (
            <G>
              <Line
                x1={wing[0] - 10}
                y1={wing[1]}
                x2={wing[0] - 8}
                y2={wing[1] - 13}
                stroke="#1a1c20"
                strokeWidth={3}
              />
              <Line
                x1={wing[0] + 6}
                y1={wing[1] + 1}
                x2={wing[0] + 8}
                y2={wing[1] - 13}
                stroke="#1a1c20"
                strokeWidth={3}
              />
              <Path
                d={`M${wing[0] - 26} ${wing[1] - 14}L${wing[0] + 18} ${wing[1] - 17}L${wing[0] + 20} ${wing[1] - 11}L${wing[0] - 26} ${wing[1] - 9}Z`}
                fill="#16181b"
                stroke="#AAFF00"
                strokeWidth={0.8}
                strokeOpacity={0.7}
              />
            </G>
          ) : null}

          {/* lamps with glow */}
          <Ellipse cx={front + 4} cy={lampY + 3} rx={26} ry={10} fill={`url(#${id}-head)`} opacity={0.55} />
          <Rect x={front + 3} y={lampY} width={16} height={6} rx={3} fill="#F2EFE8" />
          <Ellipse cx={rear - 4} cy={lampY + 2} rx={18} ry={9} fill={`url(#${id}-tail)`} opacity={0.6} />
          <Rect x={rear - 9} y={lampY - 2} width={7} height={9} rx={2} fill="#ff2a2a" />

          <Wheel cx={s.wheels[0]} cy={s.cy} r={s.r} id={id} />
          <Wheel cx={s.wheels[1]} cy={s.cy} r={s.r} id={id} />
          </>
          )}
        </Svg>
      </View>
      {animate ? <LightSweep /> : null}
    </View>
  );
});

/** A diagonal lime light band that sweeps across the frame, then rests for a few seconds. */
function LightSweep() {
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(x, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(3600),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, x]);
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-420, 420] }) },
            { skewX: "-24deg" },
          ],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="sweep-band" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0.35" stopColor="#AAFF00" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#AAFF00" stopOpacity="0.16" />
            <Stop offset="0.65" stopColor="#AAFF00" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#sweep-band)" />
      </Svg>
    </Animated.View>
  );
}
