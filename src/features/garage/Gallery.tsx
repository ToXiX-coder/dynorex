import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SignedImage } from "@/components/build/SignedImage";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { SectionHeader } from "@/components/SectionHeader";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { sampleUri } from "@/demo/sampleMedia";
import type { ErrorKey } from "@/domain/copy/errors";
import { pickPhoto } from "@/services/media/photos";
import { haptic } from "@/services/haptics";
import { a11yHidden } from "@/utils/a11y";
import type { VehiclePhotoRow } from "@/services/supabase/database.types";
import { color, radius, space, touch } from "@/theme/tokens";
import { maintenanceService } from "./maintenanceService";
import { usePhotoUploads } from "./usePhotoUploads";

const MAX = 24;

/**
 * The owner's photo gallery for a car (up to 24). Photos go through the checked upload pipeline (re-saved on the
 * phone so location data is dropped); they're public only when the build is public.
 */
export function OwnerGallery({
  vehicleId,
  isPublic,
  heroPath = null,
  onCoverChanged,
}: {
  vehicleId: string;
  isPublic: boolean;
  /** the car's current cover, to mark which photo it is (D-68) */
  heroPath?: string | null;
  onCoverChanged?: () => void;
}) {
  const [photos, setPhotos] = useState<VehiclePhotoRow[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const uploads = usePhotoUploads(refresh);

  useEffect(() => {
    let alive = true;
    void maintenanceService.gallery(vehicleId).then((r) => alive && r.ok && setPhotos(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId, reload]);

  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>Gallery</SectionHeader>
      <Text variant="caption" muted>
        {`${photos.length} of ${MAX} photos · ${isPublic ? "shown on your public build" : "private until you share the build"}`}
      </Text>
      <View style={styles.grid}>
        {photos.map((p) => (
          <View key={p.id} style={styles.cell}>
            <SignedImage
              path={p.storage_path}
              alt={p.storage_path === heroPath ? "Gallery photo, the cover" : "Gallery photo"}
              style={styles.img}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove this photo"
              hitSlop={8}
              onPress={async () => {
                const r = await maintenanceService.removePhoto(p.id);
                if (!r.ok) return;
                refresh();
                // removing the cover photo takes the cover with it
                if (p.storage_path === heroPath) onCoverChanged?.();
              }}
              style={styles.remove}
            >
              <Text style={{ color: color.text, fontWeight: "800" }}>×</Text>
            </Pressable>
            {/* D-68: any gallery photo can be the car's cover */}
            {p.storage_path === heroPath ? (
              <View style={[styles.cover, { backgroundColor: color.accent }]} {...a11yHidden}>
                <Text variant="caption" style={{ color: color.onAccent, fontWeight: "800" }}>
                  Cover
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use this photo as the cover"
                hitSlop={6}
                onPress={async () => {
                  setError(null);
                  const r = await maintenanceService.setCover(p.id);
                  if (!r.ok) return setError(r.error.key);
                  haptic.success();
                  onCoverChanged?.();
                }}
                style={styles.cover}
              >
                <Text variant="caption" style={{ color: color.text, fontWeight: "800" }}>
                  Set cover
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
      {photos.length < MAX ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {(["library", "camera"] as const).map((src) => (
            <Button
              key={src}
              title={src === "library" ? "Add photos" : "Take photo"}
              variant="secondary"
              disabled={uploads.busy}
              onPress={async () => {
                setError(null);
                const r = await pickPhoto(src);
                if (!r.ok) return setError(r.error.key);
                if (r.data) void uploads.add(r.data, { kind: "gallery", vehicleId });
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

/** A public build's gallery, with 5-minute signed URLs checked by the server for this viewer. */
export function PublicGallery({ vehicleId, title }: { vehicleId: string; title: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void maintenanceService.publicGallery(vehicleId).then(async (r) => {
      if (!alive || !r.ok || !r.data.length) return;
      const list = r.data.map((p) => p.photo_id);
      setIds(list);
      const u = await maintenanceService.publicGalleryUrls(list);
      // pitch mode's sample pictures come back as "sample:" paths (real URLs pass through unchanged)
      if (alive && u.ok) setUrls(Object.fromEntries(Object.entries(u.data).map(([k, v]) => [k, sampleUri(v)])));
    });
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  if (!ids.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>Gallery</SectionHeader>
      <View style={styles.grid}>
        {ids.map((id, i) => (
          <View key={id} style={styles.cell}>
            <PublicImage uri={urls[id]} alt={`${title}, photo ${i + 1} of ${ids.length}`} style={styles.img} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  cell: { width: "32%", aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden" },
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
  cover: {
    position: "absolute",
    left: 2,
    bottom: 2,
    minHeight: touch.min - 12,
    paddingHorizontal: space.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
});
