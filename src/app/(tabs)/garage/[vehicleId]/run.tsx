import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { analyzeRun, ESTIMATE_LABEL, findLaunch, SAFETY_NOTE } from "@/domain/perf";
import type { MappedError } from "@/features/auth/errors";
import { buildService } from "@/features/garage/buildService";
import { QUALITY_TEXT, secs, SpeedTrace } from "@/features/garage/PerfBits";
import { perfService } from "@/features/garage/perfService";
import { usePerfRecorder } from "@/features/garage/usePerfRecorder";
import { analytics } from "@/services/analytics";
import { haptic } from "@/services/haptics";
import { config } from "@/services/config";
import type { VehicleRow } from "@/services/supabase/database.types";
import { themed } from "@/theme/themed";
import { color, radius, space } from "@/theme/tokens";
import { kindNoun, kindOf } from "@/domain/vehicleKind";

const PHASE_TEXT = {
  idle: "",
  waiting: "Come to a complete stop",
  ready: "Ready. Launch when it's safe.",
  running: "Timing…",
  done: "Run complete",
} as const;

/**
 * Time a run (D-60): agree it's a closed course, arm, stop, launch. Timing starts on its own when the car moves
 * and ends past the quarter mile or when you lift. Nothing is saved until you press Save.
 */
export default function TimeRun() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const rec = usePerfRecorder();
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [safe, setSafe] = useState(false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);

  useEffect(() => {
    void buildService.getVehicle(id).then((r) => r.ok && setVehicle(r.data));
  }, [id]);

  const weight = vehicle?.baseline_weight_lb ? Number(vehicle.baseline_weight_lb) : null;
  const kind = kindOf(vehicle);
  const emoto = kind === "ebike";
  const result = useMemo(() => {
    const r = rec.phase === "done" ? analyzeRun(rec.samples, emoto ? null : weight) : null;
    // D-74: an e-moto is timed 0-30; a car or motorcycle needs a 0-60 or a quarter
    if (!r) return null;
    return (emoto ? (r.zeroThirty ?? r.zeroSixty ?? r.quarter) : (r.zeroSixty ?? r.quarter)) === null ? null : r;
  }, [rec.phase, rec.samples, weight, emoto]);
  // a buzz when the timer starts and when the run is done (no sound: eyes and ears stay on the road)
  useEffect(() => {
    if (rec.phase === "running" || rec.phase === "done") haptic.tap();
  }, [rec.phase]);

  const launch = rec.phase === "running" ? findLaunch(rec.samples) : null;
  const elapsed = launch ? Math.max(0, (rec.samples[rec.samples.length - 1]![0] - launch.ms) / 1000) : 0;

  const save = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    const r = await perfService.save({
      vehicle_id: id,
      ran_at: new Date().toISOString(),
      zero_sixty_s: result.zeroSixty,
      zero_thirty_s: result.zeroThirty,
      quarter_s: result.quarter,
      trap_mph: result.quarter === null ? null : result.trapMph,
      est_whp: result.estWhp,
      weight_lb: emoto ? null : weight,
      sample_hz: result.sampleHz,
      quality: result.quality,
      note: null,
      shared: share && vehicle?.visibility === "public",
      samples: result.samples,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    analytics.track("proof_logged", { kind: "run" });
    haptic.success();
    router.replace(`/garage/${id}/runs`);
  };

  if (rec.phase === "idle")
    return (
      <Screen>
        <Card style={{ gap: space.md }}>
          <Text variant="title">Before you run</Text>
          <Text variant="body">{SAFETY_NOTE}</Text>
          <Text variant="caption" muted>
            {`${ESTIMATE_LABEL} Phones usually update GPS once a second; times are a ballpark unless you see "Good GPS". Mount the phone so it can't slide.`}
          </Text>
          <Chip label="I'm on a closed course or private property" selected={safe} onPress={() => setSafe(!safe)} />
        </Card>
        {rec.permission === "denied" ? (
          <InlineNotice
            headsUp
            title="Location is off for Dynorex"
            body="Timing needs GPS speed. Turn on location for Dynorex in your phone's settings, then try again."
          />
        ) : null}
        <Button title="Arm the timer" fullWidth disabled={!safe} onPress={() => void rec.arm()} />
        {config.demoMode ? (
          <Button
            title="Play a sample run (pitch mode)"
            variant="secondary"
            fullWidth
            onPress={() => (emoto ? rec.simulate(Number(vehicle?.top_speed_mph ?? 50) + 2, 4) : rec.simulate())}
          />
        ) : null}
      </Screen>
    );

  return (
    <Screen>
      <View
        style={styles.gauge}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${PHASE_TEXT[rec.phase]}. ${Math.round(rec.speed)} miles per hour`}
      >
        <Text variant="caption" muted style={styles.phase}>
          {PHASE_TEXT[rec.phase]}
        </Text>
        <Text variant="impact" style={styles.speed}>
          {Math.round(rec.speed)}
        </Text>
        <Text variant="specUnit" muted>
          mph
        </Text>
        {rec.phase === "running" ? (
          <Text variant="spec" style={{ color: color.accent }}>
            {elapsed.toFixed(1)} s
          </Text>
        ) : null}
      </View>

      {rec.samples.length > 1 ? <SpeedTrace samples={result?.samples ?? rec.samples} mark={emoto ? 30 : 60} /> : null}

      {rec.phase === "done" && !result ? (
        <InlineNotice
          headsUp
          title="No standing start found"
          body={`Timing needs a full stop first, then a launch to at least ${emoto ? 30 : 60} mph. Nothing was saved.`}
        />
      ) : null}

      {result ? (
        <Card style={{ gap: space.sm }}>
          <View style={styles.results}>
            {emoto ? <Result label="0–30 mph" value={secs(result.zeroThirty)} /> : null}
            <Result label="0–60 mph" value={secs(result.zeroSixty)} />
            <Result
              label="¼ mile"
              value={result.quarter === null ? "–" : `${secs(result.quarter)}`}
              sub={result.trapMph ? `@ ${result.trapMph.toFixed(0)} mph` : undefined}
            />
            {emoto ? null : (
              <Result label="Est. power" value={result.estWhp === null ? "–" : `~${result.estWhp}`} sub="whp" />
            )}
          </View>
          <Text variant="caption" muted>
            {QUALITY_TEXT[result.quality]}
          </Text>
          {weight === null && !emoto ? (
            <Text variant="caption" muted>
              {`Add the ${kindNoun(kind)}'s weight on its edit screen to get a power estimate.`}
            </Text>
          ) : null}
          {vehicle?.visibility === "public" ? (
            <Chip label="Show on my public build" selected={share} onPress={() => setShare(!share)} />
          ) : null}
        </Card>
      ) : null}

      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {result ? <Button title="Save run" loading={busy} onPress={() => void save()} /> : null}
        <Button
          title={rec.phase === "done" ? "Try again" : "Cancel"}
          variant="secondary"
          disabled={busy}
          onPress={rec.reset}
        />
      </View>
    </Screen>
  );
}

function Result({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={`${label}: ${value} ${sub ?? ""}`}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="spec" style={{ fontSize: 26, lineHeight: 30 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" muted>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    gauge: {
      alignItems: "center",
      paddingVertical: space.xl,
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: color.hairline,
      gap: space.xxs,
    },
    phase: { textTransform: "uppercase", letterSpacing: 1 },
    speed: { fontSize: 96, lineHeight: 100, color: color.text },
    results: { flexDirection: "row", gap: space.sm },
  }),
);
