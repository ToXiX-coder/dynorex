import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import type { DeltaInputs } from "@/domain/validation/build";
import { buildService } from "@/features/garage/buildService";
import { useVehicleKind } from "@/features/garage/useVehicleKind";
import { deltasFromMod, fieldsFromMod, ModFormView, type ModFields } from "@/features/mods/ModFormView";
import { useAction } from "@/hooks/useAction";

/** Edit Mod. Same form and order as Add; photos are managed on the mod page. Input is kept on errors. */
export default function EditMod() {
  const { vehicleId, modId } = useLocalSearchParams<{ vehicleId: string; modId: string }>();
  const mid = String(modId);
  const kind = useVehicleKind(String(vehicleId));
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");
  const [fields, setFields] = useState<ModFields>(fieldsFromMod(null));
  const [deltas, setDeltas] = useState<DeltaInputs>(deltasFromMod(null));
  const save = useAction(buildService.updateMod);

  useEffect(() => {
    void buildService.getMod(mid).then((r) => {
      if (!r.ok || !r.data) return setState("missing");
      setFields(fieldsFromMod(r.data));
      setDeltas(deltasFromMod(r.data));
      setState("ready");
    });
  }, [mid]);

  if (state === "loading") return <LoadingState label="Loading mod" />;
  if (state === "missing")
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => router.back()} />
      </Screen>
    );

  return (
    <ModFormView
      fields={fields}
      deltas={deltas}
      onFieldsChange={setFields}
      onDeltasChange={setDeltas}
      photosNote="Add or remove photos on the mod page."
      kind={kind}
      busy={save.busy}
      error={save.error ? (save.error.key === "server" ? "modSaveFailed" : save.error.key) : null}
      submitLabel="Save changes"
      onSubmit={async (form, d) => {
        const r = await save.run(mid, form, d);
        if (r?.ok) router.back();
      }}
    />
  );
}
