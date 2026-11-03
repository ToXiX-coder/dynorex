import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SignedImage } from "@/components/build/SignedImage";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { pickPhoto } from "@/services/media/photos";
import type { ReceiptRow } from "@/services/supabase/database.types";
import { color, radius, space, touch } from "@/theme/tokens";
import { receiptsFor, recordsService, type ReceiptFor } from "./recordsService";
import { usePhotoUploads } from "./usePhotoUploads";

const MAX = 4;

/**
 * Receipts on one mod or one maintenance record: up to 4 photos, private to you. They count toward "receipt on
 * file" on a service-history link, but the pictures themselves are never shown to anyone else.
 */
export function Receipts({ vehicleId, item }: { vehicleId: string; item: ReceiptFor }) {
  const [all, setAll] = useState<ReceiptRow[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const uploads = usePhotoUploads(refresh);

  useEffect(() => {
    let alive = true;
    void recordsService.receipts(vehicleId).then((r) => alive && r.ok && setAll(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId, reload]);

  const mine = receiptsFor(all, item);
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">Receipts</Text>
      <Text variant="caption" muted>
        {mine.length
          ? `${mine.length} of ${MAX} · private to you`
          : "Snap the receipt so your records are backed up. Private to you."}
      </Text>
      {mine.length ? (
        <View style={styles.row}>
          {mine.map((r, i) => (
            <View key={r.id} style={styles.cell}>
              <SignedImage path={r.storage_path} alt={`Receipt ${i + 1}`} style={styles.img} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove receipt ${i + 1}`}
                hitSlop={8}
                onPress={async () => {
                  const res = await recordsService.removeReceipt(r.id);
                  if (res.ok) refresh();
                }}
                style={styles.remove}
              >
                <Text style={{ color: color.text, fontWeight: "800" }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {mine.length < MAX ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {(["camera", "library"] as const).map((src) => (
            <Button
              key={src}
              title={src === "camera" ? "Snap receipt" : "Choose photo"}
              variant="secondary"
              disabled={uploads.busy}
              onPress={async () => {
                setError(null);
                const r = await pickPhoto(src);
                if (!r.ok) return setError(r.error.key);
                if (r.data) void uploads.add(r.data, { kind: "receipt", vehicleId, ...item });
              }}
            />
          ))}
        </View>
      ) : null}
      {error ? <InlineError kind={error} /> : null}
      <UploadList items={uploads.items} onRetry={uploads.retry} onCancel={uploads.cancel} onDismiss={uploads.dismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  cell: { width: 72, height: 96, borderRadius: radius.sm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  remove: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: touch.min - 12,
    minHeight: touch.min - 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
});
