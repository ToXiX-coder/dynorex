import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { Card } from "@/components/cards/Card";
import { Text } from "@/components/Text";
import { categoryLabel } from "@/components/build/BuildBits";
import { buildPath } from "@/domain/deepLinks";
import { ESTIMATE_LABEL, type ModImpact, type Sample } from "@/domain/perf";
import type { FitmentRow, PerfQuality, PerfRunRow, PublicPerfRun } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";
import { color, radius, space, touch } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Chip } from "@/components/buttons/Chip";
import { buildService, type VehicleCard } from "./buildService";
import { CardLinkHeader } from "./MaintenanceBits";
import { perfService } from "./perfService";

// SVG text on web otherwise falls back to a serif face
const SVG_FONT = Platform.OS === "web" ? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" : undefined;

export const secs = (s: number | null | undefined) =>
  s === null || s === undefined ? "–" : `${Number(s).toFixed(2)} s`;
export const QUALITY_TEXT: Record<PerfQuality, string> = {
  good: "Good GPS (8+ updates a second)",
  fair: "Fair GPS (4 to 7 updates a second)",
  rough: "Rough GPS (under 4 updates a second): treat as a ballpark",
};

type RunLike = Pick<PublicPerfRun, "zero_sixty_s" | "quarter_s" | "trap_mph" | "est_whp">;
/** Best of each number across runs: quickest times, highest power. */
export function bests(runs: readonly RunLike[]) {
  const nums = (k: keyof RunLike) =>
    runs
      .map((r) => r[k])
      .filter((x): x is number => x !== null)
      .map(Number);
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
  const quarter = min(nums("quarter_s"));
  return {
    zeroSixty: min(nums("zero_sixty_s")),
    quarter,
    trap: quarter === null ? null : Number(runs.find((r) => Number(r.quarter_s) === quarter)?.trap_mph ?? null),
    whp: nums("est_whp").length ? Math.max(...nums("est_whp")) : null,
  };
}

/** Three big numbers in a row: best 0-60, best quarter (with trap), best power estimate. */
export function BestNumbers({ runs }: { runs: readonly RunLike[] }) {
  const b = bests(runs);
  const cells: [string, string, string | null][] = [
    ["0–60 mph", b.zeroSixty === null ? "–" : b.zeroSixty.toFixed(2), b.zeroSixty === null ? null : "s"],
    ["¼ mile", b.quarter === null ? "–" : b.quarter.toFixed(2), b.trap ? `s @ ${b.trap.toFixed(0)}` : null],
    ["Est. power", b.whp === null ? "–" : String(b.whp), b.whp === null ? null : "whp"],
  ];
  return (
    <View style={styles.bests}>
      {cells.map(([label, value, unit]) => (
        <View
          key={label}
          style={styles.best}
          accessible
          accessibilityLabel={`Best ${label}: ${value === "–" ? "no run yet" : `${value} ${unit ?? ""}`}`}
        >
          <Text variant="caption" muted>
            {label}
          </Text>
          <Text variant="spec" style={styles.bestValue} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text variant="caption" muted>
            {unit ?? " "}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** "Performance" card on your vehicle page: best numbers and the way into runs. */
export function PerfCard({ vehicleId }: { vehicleId: string }) {
  const [runs, setRuns] = useState<PerfRunRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void perfService.list(vehicleId).then((r) => alive && r.ok && setRuns(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  const open = () => router.push(`/garage/${vehicleId}/runs`);
  return (
    <Card style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Performance runs${runs?.length ? `, ${runs.length} logged` : ""}`}
        onPress={open}
        style={withPress({ minHeight: touch.min, justifyContent: "center" })}
      >
        <CardLinkHeader title="Performance" action={runs && runs.length ? "Runs" : "Time a run"} />
      </Pressable>
      {runs && runs.length ? (
        <BestNumbers runs={runs} />
      ) : (
        <Text variant="caption" muted>
          Time 0–60 and the quarter mile with your phone, then see what each mod actually changed.
        </Text>
      )}
      <Text variant="caption" muted>
        {ESTIMATE_LABEL}
      </Text>
    </Card>
  );
}

/** Speed over time with a 60 mph line. Decorative for screen readers: the numbers beside it carry the result. */
export function SpeedTrace({ samples, height = 150 }: { samples: readonly Sample[]; height?: number }) {
  const W = 320;
  const H = 150;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  if (samples.length < 2) return null;
  const tMax = samples[samples.length - 1]![0] || 1;
  const vMax = Math.max(80, Math.ceil(Math.max(...samples.map(([, v]) => v)) / 20) * 20);
  const x = (t: number) => pad.l + (t / tMax) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / vMax) * (H - pad.t - pad.b);
  const d = samples.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const fill = `${d} L${x(tMax).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const ticks = Array.from({ length: vMax / 20 + 1 }, (_, i) => i * 20);
  return (
    <View {...a11yHidden} style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {ticks.map((v) => (
          <Line key={v} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={color.hairline} strokeWidth={1} />
        ))}
        {ticks
          .filter((v) => v % 40 === 0)
          .map((v) => (
            <SvgText
              key={`l${v}`}
              x={pad.l - 4}
              y={y(v) + 3}
              fontSize={9}
              fontFamily={SVG_FONT}
              fill={color.textMuted}
              textAnchor="end"
            >
              {v}
            </SvgText>
          ))}
        <Line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(60)}
          y2={y(60)}
          stroke={color.danger}
          strokeDasharray="4 3"
          strokeWidth={1}
        />
        <SvgText x={W - pad.r} y={y(60) - 3} fontSize={9} fontFamily={SVG_FONT} fill={color.textMuted} textAnchor="end">
          60 mph
        </SvgText>
        <Path d={fill} fill={color.accentSoft} />
        <Path d={d} stroke={color.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
        <SvgText x={W - pad.r} y={H - 4} fontSize={9} fontFamily={SVG_FONT} fill={color.textMuted} textAnchor="end">
          {`${(tMax / 1000).toFixed(1)} s`}
        </SvgText>
      </Svg>
    </View>
  );
}

/** Before and after each mod: two bars (shorter is quicker) and the change in words. */
export function ModImpactList({ impacts }: { impacts: readonly ModImpact[] }) {
  const shown = impacts.filter((m) => m.before !== null || m.after !== null);
  if (!shown.length)
    return (
      <Text variant="caption" muted>
        Time a run before and after your next mod to see what it changed. Runs go in the window of the most recent
        completed mod.
      </Text>
    );
  const max = Math.max(...shown.flatMap((m) => [m.before ?? 0, m.after ?? 0]));
  const bar = (s: number | null, tone: string) => (
    <View style={styles.track}>
      {s !== null ? <View style={[styles.bar, { width: `${(s / max) * 100}%`, backgroundColor: tone }]} /> : null}
    </View>
  );
  return (
    <View style={{ gap: space.md }}>
      {shown.map((m) => {
        const words =
          m.delta === null
            ? m.after === null
              ? "No run since it went on"
              : "No run from before it"
            : m.delta < 0
              ? `${Math.abs(m.delta).toFixed(2)} s quicker`
              : m.delta > 0
                ? `${m.delta.toFixed(2)} s slower`
                : "No change";
        return (
          <View
            key={m.modId}
            style={{ gap: space.xxs }}
            accessible
            accessibilityLabel={`${m.name}: best 0 to 60 before ${secs(m.before)}, after ${secs(m.after)}. ${words}.`}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {m.name}
              </Text>
              <Text
                variant="caption"
                style={m.delta !== null && m.delta < 0 ? { color: color.accent, fontWeight: "800" } : undefined}
              >
                {words}
              </Text>
            </View>
            <View style={styles.barRow}>
              <Text variant="caption" muted style={styles.barLabel}>
                Before
              </Text>
              {bar(m.before, color.border)}
              <Text variant="caption" style={styles.barValue}>
                {secs(m.before)}
              </Text>
            </View>
            <View style={styles.barRow}>
              <Text variant="caption" muted style={styles.barLabel}>
                After
              </Text>
              {bar(m.after, color.accent)}
              <Text variant="caption" style={styles.barValue}>
                {secs(m.after)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Shared runs on a public build: best numbers, labelled as phone estimates. Hidden when there are none. */
export function PublicPerfCard({ vehicleId }: { vehicleId: string }) {
  const [runs, setRuns] = useState<PublicPerfRun[]>([]);
  useEffect(() => {
    let alive = true;
    void perfService.publicRuns(vehicleId).then((r) => alive && r.ok && setRuns(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  if (!runs.length) return null;
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="title">Performance</Text>
      <BestNumbers runs={runs} />
      <Text variant="caption" muted>
        {`${runs.length} shared run${runs.length === 1 ? "" : "s"}. ${ESTIMATE_LABEL}`}
      </Text>
    </Card>
  );
}

/**
 * "Owners of your car run…": parts on public builds of the same make and model (year within 3), counted on the
 * server. Each row opens one of those builds.
 */
export function FitmentCard({
  car,
  category,
  terms,
  title,
  hideNames = [],
  empty,
}: {
  car: { make: string; model: string; year: number };
  category?: string | null;
  terms?: string | null;
  title: string;
  hideNames?: readonly string[];
  empty?: string;
}) {
  const [rows, setRows] = useState<FitmentRow[] | null>(null);
  const { make, model, year } = car;
  useEffect(() => {
    let alive = true;
    void perfService.fitment({ make, model, year }, category, terms).then((r) => alive && setRows(r.ok ? r.data : []));
    return () => {
      alive = false;
    };
  }, [make, model, year, category, terms]);
  const hidden = new Set(hideNames.map((n) => n.toLowerCase()));
  const shown = (rows ?? []).filter((r) => !hidden.has(r.name.toLowerCase())).slice(0, 5);
  if (rows === null) return null;
  if (!shown.length && !empty) return null;
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="title">{title}</Text>
      <Text variant="caption" muted>
        {`From public builds of the ${car.year - 3}–${car.year + 3} ${car.make} ${car.model}.`}
      </Text>
      {shown.length === 0 ? (
        <Text variant="caption">{empty}</Text>
      ) : (
        shown.map((r) => (
          <Pressable
            key={`${r.name}|${r.brand ?? ""}`}
            accessibilityRole="link"
            accessibilityLabel={`${r.brand ? `${r.brand} ` : ""}${r.name}: ${r.owners} owner${r.owners === 1 ? "" : "s"} run this. Open a build`}
            onPress={() => r.vehicle_ids[0] && router.push(buildPath(r.vehicle_ids[0]))}
            style={withPress(styles.fitRow)}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.name}
              </Text>
              <Text variant="caption" muted numberOfLines={1}>
                {[r.brand, categoryLabel(r.category)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.owners}>
              <Text variant="label" style={{ color: color.accent }}>
                {r.owners}
              </Text>
              <Text variant="caption" muted>
                {r.owners === 1 ? "owner" : "owners"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Card>
  );
}

/**
 * On a Shop listing: pick one of your cars and see how many owners of that car run parts like this one
 * (same category, matching words from the title). Shown only when you have a car in your garage.
 */
export function ListingFitment({ category, title, fits }: { category: string; title: string; fits: string | null }) {
  const [cars, setCars] = useState<VehicleCard[]>([]);
  const [picked, setPick] = useState<number | null>(null);
  // start on the car the seller says it fits, when one of yours matches
  const matched = cars.findIndex((c) => fits && fits.toLowerCase().includes(c.model.toLowerCase()));
  const pick = picked ?? Math.max(0, matched);
  useEffect(() => {
    let alive = true;
    void buildService.listVehicles(0).then((r) => alive && r.ok && setCars(r.data));
    return () => {
      alive = false;
    };
  }, []);
  const car = cars[pick];
  if (!car) return null;
  return (
    <View style={{ gap: space.sm }}>
      {cars.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {cars.map((c, i) => (
            <Chip
              key={c.id}
              label={c.nickname || `${c.year} ${c.model}`}
              selected={i === pick}
              onPress={() => setPick(i)}
            />
          ))}
        </View>
      ) : null}
      <FitmentCard
        car={{ make: car.make, model: car.model, year: Number(car.year) }}
        category={category}
        terms={title}
        title={`Owners of your ${car.model} who run this`}
        empty="No public builds of your car list a part like this yet. Check the seller's fit notes and ask before you buy."
      />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bests: { flexDirection: "row", gap: space.sm },
    best: {
      flex: 1,
      backgroundColor: color.background,
      borderRadius: radius.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.sm,
      alignItems: "center",
    },
    bestValue: { fontSize: 28, lineHeight: 32, color: color.text },
    track: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: color.background, overflow: "hidden" },
    bar: { height: "100%", borderRadius: radius.pill },
    barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
    barLabel: { width: 46 },
    barValue: { width: 58, textAlign: "right", fontVariant: ["tabular-nums"] },
    fitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      minHeight: touch.min,
      paddingVertical: space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: color.hairline,
    },
    owners: { alignItems: "center", minWidth: 52 },
  }),
);
