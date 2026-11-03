import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { ERROR_COPY } from "@/domain/copy/errors";
import type { DeltaInputs } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import { buildService } from "@/features/garage/buildService";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { useVehicleKind } from "@/features/garage/useVehicleKind";
import { drafts } from "@/features/mods/drafts";
import {
  deltasFromMod,
  fieldsFromMod,
  ModFormView,
  type ModFields,
  type PendingPhoto,
} from "@/features/mods/ModFormView";
import { fillFromReceipt } from "@/features/mods/receiptFill";
import { ReceiptScanCard } from "@/features/mods/ReceiptScanCard";
import { useAction } from "@/hooks/useAction";
import { useOnline } from "@/hooks/useNetwork";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";

/** True when the form is exactly as a new one opens (so there's nothing worth keeping as a draft). */
const isBlank = (f: ModFields, d: DeltaInputs) =>
  JSON.stringify(f) === JSON.stringify(fieldsFromMod(null)) && JSON.stringify(d) === JSON.stringify(deltasFromMod(null));

/**
 * Add Mod. Every change is kept as a draft on the phone, so nothing typed is lost on a failed save or
 * a crash. Offline, Save queues the draft and it's sent when the connection is back. The draft's
 * client_ref means a retry or replay can never create two mods.
 */
export default function AddMod() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const vid = String(vehicleId);
  const kind = useVehicleKind(vid);
  const { user } = useAuth();
  const flags = useFlags();
  const online = useOnline();
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [fields, setFields] = useState<ModFields>(fieldsFromMod(null));
  const [deltas, setDeltas] = useState<DeltaInputs>(deltasFromMod(null));
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [queued, setQueued] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const clientRef = useRef<string>("");
  const save = useAction(buildService.createMod);
  const uploads = usePhotoUploads();

  // restore an unsent draft for this vehicle, or start a new one
  useEffect(() => {
    if (!user) return;
    void drafts.openFor(user.id, vid).then((d) => {
      if (d) {
        clientRef.current = d.clientRef;
        const f = { ...fieldsFromMod(null), ...(d.fields as Partial<ModFields>) };
        setFields(f);
        setDeltas(d.deltas as DeltaInputs);
        // an untouched form isn't worth announcing
        setRestored(!isBlank(f, d.deltas as DeltaInputs));
      } else {
        clientRef.current = drafts.newRef();
      }
      setReady(true);
    });
  }, [user, vid]);

  // autosave (debounced)
  useEffect(() => {
    if (!ready || !user) return;
    const t = setTimeout(() => {
      // nothing typed (or all of it cleared again): no draft to keep
      if (isBlank(fields, deltas)) return void drafts.remove(user.id, clientRef.current);
      void drafts.save(user.id, {
        clientRef: clientRef.current,
        vehicleId: vid,
        fields,
        deltas,
        queued: false,
        updatedAt: Date.now(),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [fields, deltas, ready, user, vid]);

  if (!ready) return <LoadingState label="Opening the form" />;

  if (queued) {
    return (
      <Screen>
        <InlineNotice title={ERROR_COPY.savedOffline.title} body={ERROR_COPY.savedOffline.body} />
        {photos.length ? (
          <Text variant="caption" muted>
            Add the photos once it has synced; they need a connection.
          </Text>
        ) : null}
        <Button title="Back to vehicle" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (savedId) {
    const allDone = uploads.items.every((i) => i.state === "done" || i.state === "failed");
    return (
      <Screen>
        <InlineNotice title="Mod saved" />
        <UploadList
          items={uploads.items}
          onRetry={uploads.retry}
          onCancel={uploads.cancel}
          onDismiss={uploads.dismiss}
        />
        <Button
          title={allDone ? "Open mod" : "Open mod (uploads continue)"}
          onPress={() => router.replace(`/garage/${vid}/mods/${savedId}`)}
        />
      </Screen>
    );
  }

  return (
    <ModFormView
      kind={kind}
      header={
        <>
          {restored ? <InlineNotice title="Draft restored" body="We kept what you typed last time." /> : null}
          {flags.receiptScan ? (
            <ReceiptScanCard
              onScanned={(r, photo) => {
                const next = fillFromReceipt(fields, r);
                setFields(next.fields);
                setPhotos((p) => [...p, { photo, role: "receipt" }]);
                return next.filled;
              }}
            />
          ) : null}
        </>
      }
      fields={fields}
      deltas={deltas}
      onFieldsChange={setFields}
      onDeltasChange={setDeltas}
      photos={photos}
      onPhotosChange={setPhotos}
      photosNote="Photos upload after the mod is saved, with progress."
      busy={save.busy}
      // the spec's own copy: "Couldn't save that mod. Something went wrong. Your draft is saved — try again."
      error={save.error ? (save.error.key === "server" ? "modSaveFailed" : save.error.key) : null}
      submitLabel="Save mod"
      onSubmit={async (form, d) => {
        if (!user) return;
        if (online === false) {
          await drafts.save(user.id, {
            clientRef: clientRef.current,
            vehicleId: vid,
            fields,
            deltas,
            queued: true,
            updatedAt: Date.now(),
          });
          setQueued(true);
          return;
        }
        const r = await save.run(vid, form, d, clientRef.current);
        if (!r?.ok) return; // draft stays on the phone
        await drafts.remove(user.id, clientRef.current);
        analytics.track("mod_added", {
          category: form.category,
          status: form.status,
          has_photos: photos.some((p) => p.role !== "receipt"),
          has_cost: form.cost_minor !== null,
        });
        if (photos.some((p) => p.role === "receipt")) analytics.track("proof_logged", { kind: "receipt" });
        if (!photos.length) return router.replace(`/garage/${vid}/mods/${r.data}`);
        setSavedId(r.data);
        for (const p of photos)
          await uploads.add(
            p.photo,
            p.role === "receipt"
              ? { kind: "receipt", vehicleId: vid, modId: r.data }
              : { kind: "mod", modId: r.data, role: p.role },
          );
      }}
    />
  );
}
