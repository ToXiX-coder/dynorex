import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { color, radius, space } from "@/theme/tokens";
import { LogoMark } from "../mascot/Torq";
import { Text } from "../Text";
import { VehicleArt } from "../vehicle/VehicleArt";
import type { VehicleKind } from "@/domain/vehicleKind";
import { themed } from "@/theme/themed";

export type ArtSource = {
  make: string;
  model: string;
  year?: number | null;
  seed: string;
  hint?: string | null;
  inset?: number;
  animate?: boolean;
  /** D-71 */
  kind?: VehicleKind;
};

/**
 * A public photo from a signed URL (see usePublicMedia). No URL yet or a failed load shows a stable box,
 * never a broken-image icon: the car's illustration when `art` is given (with "Loading photo…" or
 * "Photo couldn't load" on top when a photo should exist), otherwise a quiet brand mark.
 */
export function PublicImage({
  uri,
  alt,
  style,
  expected = true,
  art,
}: {
  uri: string | undefined;
  alt: string;
  style: StyleProp<ImageStyle>;
  expected?: boolean;
  art?: ArtSource;
}) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    const status = expected ? (failed ? "Photo couldn't load" : "Loading photo…") : null;
    if (art) {
      return (
        <View
          style={[style as object, { overflow: "hidden" }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={status ? `${alt}: ${status.replace("…", "")}` : `${alt}: illustration, no photo yet`}
        >
          <VehicleArt {...art} label={false} style={StyleSheet.absoluteFill} />
          {status ? (
            <View style={styles.status}>
              <Text variant="caption">{status}</Text>
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <View
        style={[style as object, styles.box]}
        accessible={expected}
        accessibilityLabel={status ? `${alt}: ${status}` : undefined}
      >
        {status ? (
          <Text variant="caption" muted>
            {status}
          </Text>
        ) : (
          // no photo yet: a quiet brand mark instead of an empty box
          <View style={{ opacity: 0.25 }}>
            <LogoMark size={64} />
          </View>
        )}
      </View>
    );
  }
  return (
    <Image
      // cached by the photo's address without the link's expiring token, so a new link doesn't download it again
      source={{ uri, cacheKey: `public:${uri.split("?")[0]}` }}
      style={style}
      contentFit="cover"
      transition={reduced ? 0 : 180}
      accessible
      accessibilityLabel={alt}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: { backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
    status: {
      position: "absolute",
      left: space.sm,
      bottom: space.sm,
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      borderRadius: radius.sm,
    },
  }),
);
