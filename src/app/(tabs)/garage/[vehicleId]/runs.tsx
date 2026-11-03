import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { ESTIMATE_LABEL, modImpact } from "@/domain/perf";
import type { MappedError } from "@/features/auth/errors";
import { buildService } from "@/features/garage/buildService";
import { BestNumbers, FitmentCard, ModImpactList, QUALITY_TEXT, secs } from "@/features/garage/PerfBits";
import { perfService } from "@/features/garage/perfService";
import type { ModRow, PerfRunRow, VehicleRow } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

const DISCLAIMER = "Estimates based on user-reported data. Dynorex is not responsible for accuracy.";

/**
 * A car's performance runs (D-60): best numbers, what each completed mod changed, and every run with a switch
 * to show it on the public build. Private to the owner until a run is shared.
 */
export default function Runs() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [runs, setRuns] = useState<PerfRunRow[] | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [error, setError] = useState<MappedError | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    void Promise.all([buildService.getVehicle(id), perfService.list(id), buildService.listMods(id, 0)]).then(
      ([v, r, m]) => {
        if (v.ok) setVehicle(v.data);
        if (m.ok) setMods(m.data);
        if (!r.ok) return setError(r.error);
        setError(null);
        setRuns(r.data);
      },
    );
  }, [id]);
  useFocusEffect(load);

  if (runs === null && !error) return <LoadingState label="Loading runs" />;
  const isPublic = vehicle?.visibility === "public";
  const impacts = modImpact(
    mods.map((m) => ({ id: m.id, name: m.name, installed_on: m.installed_on, status: m.status })),
    (runs ?? []).map((r) => ({ ...r, zero_sixty_s: r.zero_sixty_s === null ? null : Number(r.zero_sixty_s) })),
  );

  const toggleShare = async (r: PerfRunRow) => {
    const res = await perfService.setShared(r.id, !r.shared);
    if (!res.ok) return setError(res.error);
    load();
  };
  const remove = async (r: PerfRunRow) => {
    setConfirmId(null);
    const res = await perfService.remove(r.id);
    if (!res.ok) return setError(res.error);
    load();
  };

  return (
    <Screen onRefresh={load}>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {runs && runs.length ? <BestNumbers runs={runs} /> : null}
      <Button title="Time a run" fullWidth onPress={() => router.push(`/garage/${id}/run`)} />
      <Text variant="caption" muted>
        {`${ESTIMATE_LABEL} ${DISCLAIMER}`}
      </Text>

      <SectionHeader>What each mod changed</SectionHeader>
      <Card>
        <ModImpactList impacts={impacts} />
      </Card>

      {vehicle ? (
        <FitmentCard
          car={vehicle}
          title="What other owners run"
          hideNames={mods.map((m) => m.name)}
          empty="No other public builds of this car yet."
        />
      ) : null}

      <SectionHeader>Runs</SectionHeader>
      {runs && runs.length === 0 ? (
        <EmptyState
          expression="wrenching"
          message="No runs yet"
          detail="Find a closed course or private lot, come to a full stop, and let the phone time you."
          action={{ title: "Time a run", onPress: () => router.push(`/garage/${id}/run`) }}
        />
      ) : null}
      {(runs ?? []).map((r) => (
        <Card key={r.id} style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="bodyStrong">
              {new Date(r.ran_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </Text>
            {r.shared && isPublic ? (
              <Text variant="caption" accent>
                On your public build
              </Text>
            ) : null}
          </View>
          <Text variant="body">
            {[
              r.zero_sixty_s !== null ? `0–60 ${secs(r.zero_sixty_s)}` : null,
              r.quarter_s !== null ? `¼ mile ${secs(r.quarter_s)} @ ${Number(r.trap_mph).toFixed(0)} mph` : null,
              r.est_whp !== null ? `~${r.est_whp} whp` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
          <Text variant="caption" muted>
            {QUALITY_TEXT[r.quality]}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
            {isPublic ? (
              <Chip label="Show on public build" selected={r.shared} onPress={() => void toggleShare(r)} />
            ) : null}
            <Button
              title={confirmId === r.id ? "Tap again to delete" : "Delete"}
              variant={confirmId === r.id ? "destructive" : "secondary"}
              onPress={() => (confirmId === r.id ? void remove(r) : setConfirmId(r.id))}
            />
          </View>
        </Card>
      ))}
      {!isPublic && runs?.length ? (
        <Text variant="caption" muted>
          Make this build public to show runs on it. Runs stay private until you choose to show one.
        </Text>
      ) : null}
    </Screen>
  );
}
