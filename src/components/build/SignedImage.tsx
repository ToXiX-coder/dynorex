import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { signedPhotoUrl } from "@/services/media/photos";
import { color } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

// Signed links last 5 minutes; reuse one for 4, then fetch a fresh one in the background (D-67).
const FRESH_MS = 4 * 60_000;
const links = new Map<string, { url: string; at: number }>();

/**
 * Shows a private photo through a 5-minute signed URL fetched for the signed-in owner. The photo is cached on the
 * phone under its storage path, not the link, so a new link never downloads it again: the second visit shows it at
 * once. Stable box while loading; a plain text fallback if it can't load (never a broken image icon).
 */
export function SignedImage({ path, alt, style }: { path: string | null; alt: string; style: StyleProp<ImageStyle> }) {
  const reduced = useReducedMotion();
  // what the last fetch for this path returned; ignored once the path changes
  const [got, setGot] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  const mine = got && got.path === path ? got : null;
  const url = mine?.url ?? (path ? (links.get(path)?.url ?? null) : null);
  const failed = mine?.failed ?? false;

  useEffect(() => {
    if (!path || isFresh(path)) return;
    let alive = true;
    void signedPhotoUrl(path).then((u) => {
      if (!alive) return;
      if (u) links.set(path, { url: u, at: Date.now() });
      setGot({ path, url: u, failed: !u });
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!path) return null;
  if (failed || !url) {
    return (
      <View
        style={[style as object, styles.box]}
        accessible
        accessibilityLabel={failed ? `${alt}: couldn't load` : `${alt}: loading`}
      >
        <Text variant="caption" muted>
          {failed ? "Photo couldn't load" : "Loading photo…"}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url, cacheKey: `photo:${path}` }}
      style={style}
      contentFit="cover"
      transition={reduced ? 0 : 180}
      accessible
      accessibilityLabel={alt}
      alt={alt}
      // an expired link is only a stand-in while a fresh one loads; only a fresh link's failure counts
      onError={() => isFresh(path) && setGot({ path, url, failed: true })}
    />
  );
}

/** Sign-out and account deletion: forget the links and wipe cached photos, so the next person on this phone sees none. */
export function forgetPhotos() {
  links.clear();
  void Image.clearMemoryCache().catch(() => {});
  void Image.clearDiskCache().catch(() => {});
}

function isFresh(path: string | null) {
  const known = path ? links.get(path) : undefined;
  return Boolean(known && Date.now() - known.at < FRESH_MS);
}

const styles = themed(() =>
  StyleSheet.create({
    box: { backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  }),
);
