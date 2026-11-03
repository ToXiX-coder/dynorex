import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ERROR_COPY } from "@/domain/copy/errors";
import { useOnline } from "@/hooks/useNetwork";
import { color, space } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/**
 * Persistent red banner while offline (spec 15). Bone text on red, at large-text size so the
 * contrast passes. Disappears by itself when the connection comes back.
 */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online !== false) return null;
  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + space.xs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={`${ERROR_COPY.offline.title}. Showing saved data.`}
    >
      <Text style={styles.text}>{ERROR_COPY.offline.title}</Text>
    </View>
  );
}

/** Gray "Last updated 3 hours ago" for cached content. */
export function LastUpdated({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Text variant="caption" muted>
      {`Last updated ${label}`}
    </Text>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: { backgroundColor: color.danger, paddingBottom: space.xs, alignItems: "center" },
    text: { color: color.onDanger, fontSize: 18, lineHeight: 22, fontWeight: "800" },
  }),
);
