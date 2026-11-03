import { StyleSheet, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/** Dynorex+ member badge. Shown only when the server says so (public_profiles.plus_member). */
export function PlusBadge() {
  return (
    <View style={styles.badge} accessible accessibilityLabel="Dynorex+ member">
      <Text variant="caption" style={{ color: color.onAccent, fontWeight: "800" }}>
        Dynorex+
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    // the one solid lime tag: membership is the badge worth noticing
    badge: {
      alignSelf: "flex-start",
      backgroundColor: color.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 2,
    },
  }),
);
