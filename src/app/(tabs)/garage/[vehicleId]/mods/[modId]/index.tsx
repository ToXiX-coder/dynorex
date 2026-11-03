import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CategoryIcon, StatusChip, categoryLabel } from "@/components/build/BuildBits";
import { SignedImage } from "@/components/build/SignedImage";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { formatMoney } from "@/domain/money";
import { dayText } from "@/domain/when";
import { SPEC_DISCLAIMER, type SpecDeltas, type SpecField } from "@/domain/specs";
import { MOD_STATUSES, type ModCategoryId, type ModStatusId } from "@/domain/validation/build";
import { buildService } from "@/features/garage/buildService";
import { Receipts } from "@/features/garage/Receipts";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { useAction } from "@/hooks/useAction";
import { analytics } from "@/services/analytics";
import { haptic } from "@/services/haptics";
import { pickPhoto } from "@/services/media/photos";
import type { ModPhotoRow, ModRow } from "@/services/supabase/database.types";
import { radius, space } from "@/theme/tokens";

const DELTA_NAMES: Record<SpecField, string> = {
  hp: "Power",
  torque: "Torque",
  weight: "Weight",
  zero_to_sixty: "0–60",
};

/** Mod Detail: everything about one mod, before/after photos, quick status change, edit and delete. */
export default function ModDetail() {
  const { vehicleId, modId } = useLocalSearchParams<{ vehicleId: string; modId: string }>();
  const vid = String(vehicleId);
  const mid = String(modId);
  const [mod, setMod] = useState<ModRow | null | undefined>(undefined);
  const [photos, setPhotos] = useState<ModPhotoRow[]>([]);
  const [loadError, setLoadError] = useState<ErrorKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoError, setPhotoError] = useState<ErrorKey | null>(null);
  const del = useAction(buildService.deleteMod);
  const setStatus = useAction(buildService.setModStatus);
  const delPhoto = useAction(buildService.deletePhoto);

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([buildService.getMod(mid), buildService.modPhotos(mid)]);
    if (!m.ok) return setLoadError(m.error.key);
    setLoadError(null);
    setMod(m.data);
    if (p.ok) setPhotos(p.data);
  }, [mid]);

  const uploads = usePhotoUploads(() => void load());
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loadError && mod === undefined)
    return (
      <Screen>
        <ErrorState kind={loadError} onAction={() => void load()} />
      </Screen>
    );
  if (mod === undefined) return <LoadingState label="Loading mod" />;
  if (mod === null)
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => router.back()} />
      </Screen>
    );

  const d = mod.spec_deltas as SpecDeltas;
  const deltaLines = (Object.keys(DELTA_NAMES) as SpecField[])
    .filter((f) => d?.[f])
    .map((f) => `${DELTA_NAMES[f]}: ${d[f]!.delta > 0 ? "+" : ""}${d[f]!.delta} ${d[f]!.unit}`);
  const byRole = (r: ModPhotoRow["role"]) => photos.filter((p) => p.role === r);

  return (
    <Screen>
      <Stack.Screen options={{ title: mod.name }} />
      <View style={styles.head}>
        <CategoryIcon id={mod.category as ModCategoryId} size={36} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="heading">{mod.name}</Text>
          <Text muted>{categoryLabel(mod.category)}</Text>
          <StatusChip status={mod.status as ModStatusId} />
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <Text variant="label">Change status</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Status">
          {MOD_STATUSES.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={mod.status === s.id}
              onPress={async () => {
                if (mod.status === s.id || setStatus.busy) return;
                const old = mod.status;
                // optimistic (D-67): the chip moves at once and moves back if the server refuses
                setMod({ ...mod, status: s.id });
                haptic.select();
                const r = await setStatus.run(mod.id, s.id);
                if (r?.ok) {
                  analytics.track("mod_status_changed", { old_status: old, new_status: s.id });
                  void load();
                } else {
                  setMod((m) => (m ? { ...m, status: old } : m));
                  haptic.warning();
                }
              }}
            />
          ))}
        </View>
        {setStatus.error ? <InlineError kind={setStatus.error.key} /> : null}
      </View>

      <Card>
        <Row k="Brand" v={mod.brand} />
        <Row k="Part number" v={mod.part_number} />
        <Row
          k="Cost"
          v={mod.cost_minor !== null && mod.currency ? formatMoney(Number(mod.cost_minor), mod.currency) : null}
        />
        <Row k="Installed" v={mod.installed_on ? dayText(mod.installed_on) : null} />
        <Row
          k="Mileage when fitted"
          v={mod.installed_odometer != null ? `${Number(mod.installed_odometer).toLocaleString()} mi` : null}
        />
        <Row k="Status changed" v={dayText(mod.status_changed_at)} />
        <Row k="Added" v={dayText(mod.created_at)} />
      </Card>

      {deltaLines.length ? (
        <Card>
          <Text variant="label">Spec changes (your numbers)</Text>
          {deltaLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
          <Text variant="caption" muted>
            {mod.status === "complete" ? "Counted in the current estimate." : "Not counted until this mod is Complete."}
          </Text>
          <Text variant="caption" muted>
            {SPEC_DISCLAIMER}
          </Text>
        </Card>
      ) : null}

      {mod.notes ? (
        <Card>
          <Text variant="label">Notes</Text>
          <Text>{mod.notes}</Text>
        </Card>
      ) : null}

      <SectionHeader>Photos</SectionHeader>
      {(["before", "after", "gallery"] as const).map((role) =>
        byRole(role).length ? (
          <View key={role} style={{ gap: space.xs }}>
            <Text variant="label">{role === "before" ? "Before" : role === "after" ? "After" : "More"}</Text>
            {byRole(role).map((p) => (
              <View key={p.id} style={{ gap: space.xs }}>
                <SignedImage path={p.storage_path} alt={`${role} photo of ${mod.name}`} style={styles.photo} />
                <Button
                  title="Remove photo"
                  variant="secondary"
                  onPress={async () => {
                    const r = await delPhoto.run(p.id);
                    if (r?.ok) void load();
                  }}
                />
              </View>
            ))}
          </View>
        ) : null,
      )}
      {photos.length === 0 ? <Text muted>No photos yet.</Text> : null}
      <View style={styles.row}>
        {(["before", "after"] as const).map((role) => (
          <Button
            key={role}
            title={role === "before" ? "Add before photo" : "Add after photo"}
            variant="secondary"
            onPress={async () => {
              setPhotoError(null);
              const r = await pickPhoto("library");
              if (!r.ok) return setPhotoError(r.error.key);
              if (r.data) void uploads.add(r.data, { kind: "mod", modId: mod.id, role });
            }}
          />
        ))}
      </View>
      {photoError ? <InlineError kind={photoError} /> : null}
      {delPhoto.error ? <InlineError kind={delPhoto.error.key} /> : null}
      <UploadList items={uploads.items} onRetry={uploads.retry} onCancel={uploads.cancel} onDismiss={uploads.dismiss} />

      <Card>
        <Receipts vehicleId={vid} item={{ modId: mid }} />
      </Card>

      <Button title="Edit mod" onPress={() => router.push(`/garage/${vid}/mods/${mid}/edit`)} />
      {del.error ? <InlineError kind={del.error.key} /> : null}
      <Button title="Delete mod" variant="destructive" onPress={() => setConfirmDelete(true)} />
      <ConfirmModal
        visible={confirmDelete}
        kind="deleteMod"
        busy={del.busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const r = await del.run(mod.id);
          setConfirmDelete(false);
          if (r?.ok) router.back();
        }}
      />
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <View style={styles.kv} accessible accessibilityLabel={`${k}: ${v}`}>
      <Text muted>{k}</Text>
      <Text>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "center" },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  kv: { flexDirection: "row", justifyContent: "space-between", minHeight: 28, alignItems: "center", gap: space.md },
  photo: { width: "100%", height: 220, borderRadius: radius.md },
});
