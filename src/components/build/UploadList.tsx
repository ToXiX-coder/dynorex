import { Image, StyleSheet, View } from "react-native";
import { ERROR_COPY } from "@/domain/copy/errors";
import type { UploadItem } from "@/features/garage/usePhotoUploads";
import { color, radius, space } from "@/theme/tokens";
import { Button } from "../buttons/Button";
import { ProgressBar } from "../feedback/States";
import { Text } from "../Text";
import { themed } from "@/theme/themed";
import { FieldError } from "@/components/forms/TextField";

/** Per-photo progress, server check, and retry/remove for failures. */
export function UploadList({
  items,
  onRetry,
  onCancel,
  onDismiss,
}: {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      {items.map((it) => (
        <View key={it.id} style={styles.row}>
          <Image source={{ uri: it.photo.uri }} style={styles.thumb} accessibilityIgnoresInvertColors alt="" />
          <View style={{ flex: 1, gap: space.xs }}>
            {it.state === "uploading" ? <ProgressBar value={it.progress} label="Uploading" /> : null}
            {it.state === "checking" ? <Text variant="caption">Checking the photo…</Text> : null}
            {it.state === "done" ? (
              <Text variant="caption" accent>
                Saved
              </Text>
            ) : null}
            {it.state === "failed" ? (
              <FieldError message={`${ERROR_COPY[it.error ?? "uploadFailed"].title}. ${ERROR_COPY[it.error ?? "uploadFailed"].body}`} />
            ) : null}
            <View style={styles.actions}>
              {it.state === "uploading" ? (
                <Button title="Cancel" variant="secondary" onPress={() => onCancel(it.id)} />
              ) : null}
              {it.state === "failed" ? (
                <Button title="Retry" variant="secondary" onPress={() => onRetry(it.id)} />
              ) : null}
              {it.state === "failed" || it.state === "done" ? (
                <Button
                  title={it.state === "done" ? "OK" : "Remove"}
                  variant="secondary"
                  onPress={() => onDismiss(it.id)}
                />
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: space.md,
      backgroundColor: color.surface,
      borderRadius: radius.md,
      padding: space.sm,
    },
    thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: color.background },
    actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  }),
);
