import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { DateField } from "@/components/forms/PickerFields";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { formatLap, LAP_SOURCES, lapSourceLabel, parseLapList } from "@/domain/proof";
import { localToday } from "@/domain/when";
import type { MappedError } from "@/features/auth/errors";
import { proofService } from "@/features/garage/proofService";
import { analytics } from "@/services/analytics";
import type { LapSource, TrackLapRow } from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";

const today = () => localToday();

/**
 * Track laps for a car, from a lap-timer app (RaceChrono, Harry's LapTimer...) with a 10 Hz GPS for real accuracy, or
 * a stopwatch. Type a time or paste the lap list the app exports. Track days only. Private unless shared.
 */
export default function TrackLaps() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [laps, setLaps] = useState<TrackLapRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(() => {
    void proofService.laps(id).then((r) => (r.ok ? setLaps(r.data) : setError(r.error)));
  }, [id]);
  useFocusEffect(load);

  if (laps === null && !error) return <LoadingState label="Loading laps" />;
  // best per track, fastest track first
  const tracks = [...new Set((laps ?? []).map((l) => l.track))]
    .map((t) => {
      const ls = (laps ?? []).filter((l) => l.track === t);
      return { track: t, best: ls.reduce((a, b) => (b.lap_ms < a.lap_ms ? b : a)), laps: ls };
    })
    .sort((a, b) => a.best.lap_ms - b.best.lap_ms);

  return (
    <Screen onRefresh={load}>
      <Text variant="caption" muted>
        Laps from track days, timed by your lap-timer app. Phone GPS alone is rough: a 10 Hz GPS receiver makes them
        accurate. Private unless you show one on your public build.
      </Text>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {adding ? (
        <LapForm
          vehicleId={id}
          lastTrack={laps?.[0]?.track ?? ""}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      ) : (
        <Button title="Add laps" onPress={() => setAdding(true)} />
      )}
      {laps && laps.length === 0 ? (
        <EmptyState
          expression="wrenching"
          message="No laps yet"
          detail="After a track day, paste the lap list from RaceChrono or Harry's, or type your best."
        />
      ) : null}
      {tracks.map((t) => (
        <View key={t.track} style={{ gap: space.xs }}>
          <SectionHeader>{t.track}</SectionHeader>
          <Text variant="title" style={{ color: color.accent }}>{`Best ${formatLap(t.best.lap_ms)}`}</Text>
          {t.laps.map((l) => (
            <Card key={l.id} style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="bodyStrong">{formatLap(l.lap_ms)}</Text>
                <Text variant="caption">{l.driven_on}</Text>
              </View>
              <Text variant="caption" muted>
                {lapSourceLabel(l.source)}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Chip
                  label={l.shared ? "On your public build" : "Show on public build"}
                  selected={l.shared}
                  onPress={async () => {
                    const r = await proofService.setLapShared(l.id, !l.shared);
                    if (r.ok) load();
                  }}
                />
                <Chip
                  label="Delete"
                  selected={false}
                  onPress={async () => {
                    const r = await proofService.removeLap(l.id);
                    if (r.ok) load();
                  }}
                />
              </View>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function LapForm({ vehicleId, lastTrack, onDone }: { vehicleId: string; lastTrack: string; onDone: () => void }) {
  const [track, setTrack] = useState(lastTrack);
  const [day, setDay] = useState(today());
  const [source, setSource] = useState<LapSource>("racechrono");
  const [times, setTimes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const found = parseLapList(times);

  const save = async () => {
    const e: Record<string, string> = {};
    if (track.trim().length < 2) e.track = "Name the track";
    if (!found.length) e.times = "Add at least one lap, like 1:42.31";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    const r = await proofService.addLaps(
      found.map((lap_ms) => ({ vehicle_id: vehicleId, track: track.trim(), lap_ms, driven_on: day, source })),
    );
    setBusy(false);
    if (!r.ok) return setError(r.error);
    analytics.track("proof_logged", { kind: "laps" });
    onDone();
  };

  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Add laps</SectionHeader>
      <TextField label="Track" required value={track} onChangeText={setTrack} maxLength={80} error={errors.track} />
      <DateField label="Date" value={day} onChange={setDay} max={today()} />
      <Text variant="label">Timed with</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {LAP_SOURCES.map((s) => (
          <Chip key={s.id} label={s.label} selected={source === s.id} onPress={() => setSource(s.id)} />
        ))}
      </View>
      <TextField
        label="Lap times"
        required
        value={times}
        onChangeText={setTimes}
        multiline
        placeholder={"1:44.80\n1:43.91\nor paste the lap list your app exports"}
        error={errors.times}
      />
      <Text variant="caption" muted>
        {found.length
          ? `Found ${found.length} lap${found.length === 1 ? "" : "s"}, best ${formatLap(Math.min(...found))}.`
          : "Times like 1:42.31, one per line. Pasting a whole export works: dates and other numbers are skipped."}
      </Text>
      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button
          title={found.length > 1 ? `Save ${found.length} laps` : "Save"}
          loading={busy}
          onPress={() => void save()}
        />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={onDone} />
      </View>
    </Card>
  );
}
