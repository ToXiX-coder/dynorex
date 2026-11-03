import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { AlertIcon } from "@/components/icons";
import { ListRow } from "@/components/lists/ListGroup";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { dynoLabel, formatLap, lapSourceLabel, OWNER_REPORTED } from "@/domain/proof";
import type {
  DynoResultRow,
  PublicDynoResult,
  PublicTrackLap,
  TrackLapRow,
  VehicleRecall,
} from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";
import { proofService } from "./proofService";

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Safety recalls that may affect this car, from NHTSA by make, model and year (checked daily, never by VIN). A match
 * by model isn't proof the car is affected, so every recall says to confirm with a dealer. The owner can mark one
 * dealt with (or not their car); that only hides it here.
 */
export function RecallsCard({ vehicleId, car }: { vehicleId: string; car: string }) {
  const [recalls, setRecalls] = useState<VehicleRecall[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const load = useCallback(() => {
    void proofService.recalls(vehicleId).then((r) => r.ok && setRecalls(r.data));
  }, [vehicleId]);
  useEffect(load, [load]);
  if (!recalls) return null;
  const open = recalls.filter((r) => !r.dismissed);
  const done = recalls.filter((r) => r.dismissed);
  const shown = showDone ? recalls : open;

  return (
    <Card style={{ gap: space.sm }}>
      <SectionHeader>Recalls</SectionHeader>
      <Text variant="caption" muted>
        {`US safety recalls for the ${car}, from NHTSA by make, model and year (never your VIN), checked daily. A match may not mean your car is affected: a dealer can check with your VIN, and recall repairs are free.`}
      </Text>
      {open.length === 0 ? (
        <Text>{recalls.length ? "Nothing open." : "No recalls found for this car."}</Text>
      ) : null}
      {shown.map((r) => (
        <View
          key={r.campaign}
          style={{
            gap: 2,
            borderLeftWidth: 4,
            borderLeftColor: r.dismissed ? color.border : r.park_it ? color.danger : color.accent,
            paddingLeft: space.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {r.park_it && !r.dismissed ? <AlertIcon color={color.danger} /> : null}
            <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
              {`${r.park_it && !r.dismissed ? "Park it until fixed · " : ""}${titleCase((r.component ?? "Recall").split(":")[0]!)}`}
            </Text>
          </View>
          <Text variant="caption" muted>
            {`Campaign ${r.campaign}${r.reported_on ? ` · ${r.reported_on}` : ""}${r.dismissed ? " · marked dealt with" : ""}`}
          </Text>
          {r.summary ? <Text variant="caption">{r.summary}</Text> : null}
          {r.remedy ? <Text variant="caption">{`Fix: ${r.remedy}`}</Text> : null}
          <View style={{ flexDirection: "row" }}>
            <Button
              title={r.dismissed ? "Show as open" : "Dealt with / not my car"}
              variant="secondary"
              onPress={async () => {
                const res = await proofService.setRecallDismissed(vehicleId, r.campaign, !r.dismissed);
                if (res.ok) load();
              }}
            />
          </View>
        </View>
      ))}
      {done.length ? (
        <Button
          title={showDone ? "Hide dealt-with recalls" : `Show ${done.length} dealt with`}
          variant="secondary"
          onPress={() => setShowDone(!showDone)}
        />
      ) : null}
    </Card>
  );
}

/** Links to the dyno log, track laps and the insurance mod list, each with its headline number. */
export function RecordsCard({ vehicleId }: { vehicleId: string }) {
  const [dyno, setDyno] = useState<DynoResultRow[]>([]);
  const [laps, setLaps] = useState<TrackLapRow[]>([]);
  useEffect(() => {
    let alive = true;
    void proofService.dynoResults(vehicleId).then((r) => alive && r.ok && setDyno(r.data));
    void proofService.laps(vehicleId).then((r) => alive && r.ok && setLaps(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  const latest = dyno[0];
  const best = laps.length ? laps.reduce((a, b) => (b.lap_ms < a.lap_ms ? b : a)) : null;
  return (
    <Card style={{ gap: 0, paddingVertical: space.xs }}>
      <ListRow
        title="Dyno log"
        detail={latest ? `${latest.whp} whp on a ${dynoLabel(latest.dyno)} · owner-reported` : "Log a shop dyno sheet"}
        onPress={() => router.push(`/garage/${vehicleId}/dyno`)}
      />
      <ListRow
        title="Track laps"
        detail={best ? `Best ${formatLap(best.lap_ms)} at ${best.track}` : "Add laps from your lap timer"}
        onPress={() => router.push(`/garage/${vehicleId}/laps`)}
      />
      <ListRow
        title="Insurance mod list"
        detail="Every mod with date, fitter, cost and receipts, for your insurer"
        onPress={() => router.push(`/garage/${vehicleId}/insurance`)}
      />
    </Card>
  );
}

/** A public build's shared dyno results and best laps (numbers only; the owner chose to show each one). */
export function PublicProofCard({ vehicleId }: { vehicleId: string }) {
  const [dyno, setDyno] = useState<PublicDynoResult[]>([]);
  const [laps, setLaps] = useState<PublicTrackLap[]>([]);
  useEffect(() => {
    let alive = true;
    void proofService.publicDyno(vehicleId).then((r) => alive && r.ok && setDyno(r.data));
    void proofService.publicLaps(vehicleId).then((r) => alive && r.ok && setLaps(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  if (!dyno.length && !laps.length) return null;
  // the best lap per track
  const best = [...new Map([...laps].reverse().map((l) => [l.track, l])).values()].sort((a, b) => a.lap_ms - b.lap_ms);
  return (
    <Card style={{ gap: space.sm }}>
      {dyno.length ? (
        <>
          <SectionHeader>Dyno</SectionHeader>
          {dyno.slice(0, 3).map((d) => (
            <Text key={d.result_id}>
              {`${d.whp} whp${d.wtq !== null ? ` · ${d.wtq} lb-ft` : ""} · ${dynoLabel(d.dyno)}${d.shop ? ` at ${d.shop}` : ""} · ${d.measured_on}${d.has_sheet ? " · sheet on file" : ""}`}
            </Text>
          ))}
          <Text variant="caption" muted>
            {OWNER_REPORTED}
          </Text>
        </>
      ) : null}
      {best.length ? (
        <>
          <SectionHeader>Track laps</SectionHeader>
          {best.map((l) => (
            <Text
              key={l.lap_id}
            >{`${formatLap(l.lap_ms)} at ${l.track} · ${lapSourceLabel(l.source)} · ${l.driven_on}`}</Text>
          ))}
          <Text variant="caption" muted>
            Owner-reported from their lap timer.
          </Text>
        </>
      ) : null}
    </Card>
  );
}
