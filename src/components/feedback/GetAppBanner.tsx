import { Linking, Platform, StyleSheet, View } from "react-native";
import { config } from "@/services/config";
import { border, color, radius, space } from "@/theme/tokens";
import { Button } from "../buttons/Button";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/**
 * Web fallback for shared links opened without the app: a download prompt. Shown only on web and only
 * when real store URLs are configured, so it never points at a listing that doesn't exist.
 */
export function GetAppBanner() {
  if (Platform.OS !== "web" || (!config.appStoreUrl && !config.playStoreUrl)) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text variant="bodyStrong">Get the Dynorex app</Text>
      <Text variant="caption" muted>
        Follow builds and log your own.
      </Text>
      <View style={styles.row}>
        {config.appStoreUrl ? (
          <Button title="App Store" variant="secondary" onPress={() => void Linking.openURL(config.appStoreUrl!)} />
        ) : null}
        {config.playStoreUrl ? (
          <Button title="Google Play" variant="secondary" onPress={() => void Linking.openURL(config.playStoreUrl!)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: {
      borderWidth: border.hairline,
      borderColor: color.accent,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.xs,
    },
    row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  }),
);
