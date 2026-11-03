import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { SectionHeader } from "@/components/SectionHeader";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { sampleUri } from "@/demo/sampleMedia";
import type { ErrorKey } from "@/domain/copy/errors";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { pickPhoto } from "@/services/media/photos";
import type { PublicEventPhoto } from "@/services/supabase/database.types";
import { color, radius, space, touch } from "@/theme/tokens";
import { albumService } from "./albumService";

/**
 * A meet's photo album. Anyone who can see the event sees it; the host and people who went add photos from an
 * hour before the start until a week after (the server decides). Photos are re-saved on the phone first, so no
 * location data rides along. The uploader or the host can take one down.
 */
export function EventAlbum({ eventId, title }: { eventId: string; title: string }) {
  const { status } = useAuth();
  const [photos, setPhotos] = useState<PublicEventPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [canAdd, setCanAdd] = useState(false);
  const [removable, setRemovable] = useState<string[]>([]);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const uploads = usePhotoUploads(refresh);
  const signedIn = status === "signedIn";

  useEffect(() => {
    let alive = true;
    void albumService.photos(eventId).then(async (r) => {
      if (!alive || !r.ok) return;
      setPhotos(r.data);
      const u = await albumService.urls(r.data.map((p) => p.photo_id));
      // pitch mode's sample pictures come back as "sample:" paths (real URLs pass through unchanged)
      if (alive && u.ok) setUrls(Object.fromEntries(Object.entries(u.data).map(([k, v]) => [k, sampleUri(v)])));
    });
    if (signedIn) {
      void albumService.canAdd(eventId).then((r) => alive && r.ok && setCanAdd(r.data));
      void albumService.removable(eventId).then((r) => alive && r.ok && setRemovable(r.data));
    }
    return () => {
      alive = false;
    };
  }, [eventId, reload, signedIn]);

  if (!photos.length && !canAdd) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>Photos</SectionHeader>
      <Text variant="caption" muted>
        {photos.length
          ? `${photos.length} photo${photos.length === 1 ? "" : "s"} from people who went.`
          : "No photos yet. Add yours: everyone who can see this meet will see them."}
      </Text>
      {photos.length ? (
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <View key={p.photo_id} style={styles.cell}>
              <PublicImage
                uri={urls[p.photo_id]}
                alt={`${title}, photo ${i + 1} of ${photos.length}, by @${p.owner_username}`}
                style={styles.img}
              />
              {removable.includes(p.photo_id) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  hitSlop={8}
                  onPress={async () => {
                    const r = await albumService.remove(p.photo_id);
                    if (r.ok) refresh();
                  }}
                  style={styles.remove}
                >
                  <Text style={{ color: color.text, fontWeight: "800" }}>×</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {canAdd ? (
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
                if (r.data) void uploads.add(r.data, { kind: "event", eventId });
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
});
