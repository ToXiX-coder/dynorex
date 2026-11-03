import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { buildService } from "@/features/garage/buildService";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { VehicleFormView } from "@/features/garage/VehicleFormView";
import { useAction } from "@/hooks/useAction";
import { pickPhoto } from "@/services/media/photos";
import type { VehicleRow } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

export default function EditVehicle() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [vehicle, setVehicle] = useState<VehicleRow | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoError, setPhotoError] = useState<ErrorKey | null>(null);
  const save = useAction(buildService.updateVehicle);
  const del = useAction(buildService.deleteVehicle);
  const uploads = usePhotoUploads();

  useEffect(() => {
    void buildService.getVehicle(id).then((r) => setVehicle(r.ok ? r.data : null));
  }, [id]);

  if (vehicle === undefined) return <LoadingState label="Loading vehicle" />;
  if (vehicle === null)
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => router.replace("/garage")} />
      </Screen>
    );

  return (
    <Screen>
      <VehicleFormView
        initial={vehicle}
        submitLabel="Save changes"
        busy={save.busy}
        error={save.error?.key ?? null}
        onSubmit={async (v) => {
          setSaved(false);
          const { data_source: _d, nhtsa_make_id: _m, nhtsa_model_id: _n, ...form } = v;
          const r = await save.run(id, form);
          if (r?.ok) setSaved(true);
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text variant="label">Hero photo</Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {(["library", "camera"] as const).map((src) => (
              <Button
                key={src}
                title={src === "library" ? (vehicle.hero_path ? "Replace photo" : "Choose photo") : "Take photo"}
                variant="secondary"
                disabled={uploads.busy}
                onPress={async () => {
                  setPhotoError(null);
                  const r = await pickPhoto(src);
                  if (!r.ok) return setPhotoError(r.error.key);
                  if (r.data) void uploads.add(r.data, { kind: "hero", vehicleId: id });
                }}
              />
            ))}
          </View>
          {photoError ? <InlineError kind={photoError} /> : null}
          <UploadList
            items={uploads.items}
            onRetry={uploads.retry}
            onCancel={uploads.cancel}
            onDismiss={uploads.dismiss}
          />
        </View>
      </VehicleFormView>
      {saved ? <InlineNotice title="Saved" /> : null}
      {del.error ? <InlineError kind={del.error.key} /> : null}
      <Button title="Delete vehicle" variant="destructive" onPress={() => setConfirmDelete(true)} />
      <ConfirmModal
        visible={confirmDelete}
        kind="deleteVehicle"
        busy={del.busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const r = await del.run(id);
          setConfirmDelete(false);
          if (r?.ok) router.replace("/garage");
        }}
      />
    </Screen>
  );
}
