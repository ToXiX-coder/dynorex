import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { earnedBadges } from "@/domain/achievements";
import { savesService } from "@/features/social/savesService";
import { color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * Badges earned from activity (counted by the server; only yes/no comes back). Each one says what was done, not how fast a car
 * is. Shows nothing until there's at least one.
 */
export function Badges({ username }: { username: string }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void savesService.achievements(username).then((r) => alive && r.ok && setIds(r.data));
    return () => {
      alive = false;
    };
  }, [username]);
  const badges = earnedBadges(ids);
  if (!badges.length) return null;
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Badges: ${badges.map((b) => `${b.label}, ${b.detail}`).join("; ")}`}
      accessible
    >
      {badges.map((b) => (
        // a plain tonal tag: the words say what was done, no symbol needed
        <View key={b.id} style={styles.badge}>
          <Text variant="caption" style={{ color: color.text }}>
            {b.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
    badge: {
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: color.surfaceRaised,
    },
  }),
);
