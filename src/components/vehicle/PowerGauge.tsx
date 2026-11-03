import { useEffect, useId, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { EggBubble, useEggBubble } from "@/components/feedback/EggBubble";
import { REV_LINES, revAt } from "@/domain/easterEggs";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Stop, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/Text";
import { gaugeMax } from "@/domain/gauge";
import { sayRange, specRange } from "@/domain/specRange";
import { useCountUp } from "@/hooks/useCountUp";
import { color, FONT, space, type } from "@/theme/tokens";

const W = 300;
const H = 210;
const CX = W / 2;
const CY = 120;
const R = 96;
const START = 135; // degrees, clockwise from 3 o'clock; the dial sweeps 270° through the top
const SWEEP = 270;

const polar = (deg: number, r = R) => {
  const a = (deg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
};
const arc = (from: number, to: number, r = R) => {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/**
 * A tachometer for power: the needle swings to the current HP estimate, a lime arc fills up to it, the last
 * stretch of the dial is the Aggressive Red redline, a lime band shows the estimated range, and a Bone marker shows stock power when the owner entered
 * it. Only real numbers are drawn (an estimate from completed mods), never a made-up dyno curve; the spec card
 * beside it carries the required disclaimer.
 */
export function PowerGauge({
  hp,
  stockHp,
  stock = false,
}: {
  hp: number;
  stockHp?: number | null;
  /** No completed mods: show the exact stock number, no range band. */
  stock?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const max = gaugeMax(Math.max(hp, stockHp ?? 0));
  const shown = useCountUp(hp, 1100);
  const angle = (v: number) => START + (Math.max(0, Math.min(v, max)) / max) * SWEEP;
  // easter egg: tap to rev. Only the needle moves; the numbers and the fill stay the real estimate.
  const [rev, setRev] = useState(0);
  const [revs, setRevs] = useState(0);
  const raf = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const bubble = useEggBubble(2500);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );
  const blip = () => {
    haptic.tap();
    bubble.say(REV_LINES[revs % REV_LINES.length]!);
    setRevs((n) => n + 1);
    if (reduced) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const t0 = Date.now();
    const step = () => {
      const t = Date.now() - t0;
      setRev(revAt(t));
      raf.current = t < 1100 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };
  const needle = angle(shown + (max * 0.97 - shown) * rev);
  const tip = polar(needle, R - 14);
  const tail = polar(needle + 180, 16);
  const majors = Array.from({ length: 11 }, (_, i) => i);
  const gain = stockHp && !stock ? Math.round(hp - stockHp) : null;
  const range = stock ? null : specRange("hp", hp);
  const rangeLow = useCountUp(range?.low ?? hp, 1100);
  const rangeHigh = useCountUp(range?.high ?? hp, 1100);
  return (
    <Pressable
      onPress={blip}
      style={styles.wrap}
      accessible
      accessibilityRole="button"
      accessibilityHint="Rev it"
      accessibilityLabel={`Power gauge: ${range ? sayRange(range) : `about ${Math.round(hp)}`} horsepower${stockHp ? `, ${gain! >= 0 ? "up" : "down"} ${Math.abs(gain!)} from stock ${Math.round(stockHp)}` : ""}`}
    >
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id={`${id}-fill`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={color.accent} stopOpacity="0.55" />
            <Stop offset="1" stopColor={color.accent} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* bezel */}
        <Circle cx={CX} cy={CY} r={R + 18} fill="#0d0f11" stroke={color.hairline} strokeWidth={1} />
        <Path d={arc(START, START + SWEEP)} stroke="#23272c" strokeWidth={14} fill="none" strokeLinecap="butt" />
        {/* redline: the last 15% of the dial */}
        <Path d={arc(START + SWEEP * 0.85, START + SWEEP)} stroke={color.danger} strokeWidth={14} fill="none" />
        {/* power so far: glow + fill */}
        {shown > 0 ? (
          <>
            <Path
              d={arc(START, angle(shown))}
              stroke={color.accent}
              strokeOpacity={0.15}
              strokeWidth={26}
              fill="none"
            />
            <Path d={arc(START, angle(shown))} stroke={`url(#${id}-fill)`} strokeWidth={14} fill="none" />
          </>
        ) : null}
        {/* the estimate is a range: a lime band on the outer edge of the dial */}
        {range ? (
          <Path
            d={arc(angle(range.low), angle(range.high), R + 10)}
            stroke={color.accent}
            strokeOpacity={0.55}
            strokeWidth={5}
            fill="none"
          />
        ) : null}
        {/* ticks and numbers */}
        <G>
          {majors.map((i) => {
            const deg = START + (i / 10) * SWEEP;
            const a = polar(deg, R - 12);
            const b = polar(deg, R - 24);
            const lbl = polar(deg, R - 38);
            return (
              <G key={i}>
                <Line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={i >= 9 ? color.danger : color.text}
                  strokeWidth={2.5}
                />
                {i % 2 === 0 && i > 0 && i < 10 ? (
                  <SvgText
                    x={lbl.x}
                    y={lbl.y + 4}
                    fill={color.textMuted}
                    fontSize={11}
                    fontFamily={FONT.spec}
                    textAnchor="middle"
                  >
                    {String(Math.round(((max / 10) * i) / 10) * 10)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </G>
        {/* stock marker */}
        {stockHp ? (
          <Polygon
            points={(() => {
              const d = angle(stockHp);
              const p = polar(d, R + 10);
              const l = polar(d - 4, R + 22);
              const r = polar(d + 4, R + 22);
              return `${p.x},${p.y} ${l.x},${l.y} ${r.x},${r.y}`;
            })()}
            fill={color.text}
          />
        ) : null}
        {/* needle */}
        <Line
          x1={tail.x}
          y1={tail.y}
          x2={tip.x}
          y2={tip.y}
          stroke={color.accent}
          strokeOpacity={0.25}
          strokeWidth={8}
          strokeLinecap="round"
        />
        <Line
          x1={tail.x}
          y1={tail.y}
          x2={tip.x}
          y2={tip.y}
          stroke={color.accent}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={CX} cy={CY} r={10} fill="#16191c" stroke={color.accent} strokeWidth={2} />
      </Svg>
      {/* readout under the hub */}
      <View style={styles.readout} pointerEvents="none">
        <Text style={[type.impact, { fontSize: 36, lineHeight: 40 }]}>
          {range ? `${Math.round(rangeLow)}–${Math.round(rangeHigh)}` : String(Math.round(shown))}
        </Text>
        <Text style={[type.specUnit, { color: color.accent }]}>{range ? "HP · ESTIMATED RANGE" : "HP · STOCK"}</Text>
        {gain !== null ? (
          <Text variant="caption" muted>
            {gain >= 0
              ? `+${gain} hp over stock ${Math.round(stockHp!)}`
              : `${gain} hp vs stock ${Math.round(stockHp!)}`}
          </Text>
        ) : null}
      </View>
      <EggBubble text={bubble.text} tail="none" style={styles.rev} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingBottom: space.md },
  readout: { position: "absolute", top: 142, alignItems: "center" },
  rev: { position: "absolute", top: 0, alignSelf: "center" },
});
