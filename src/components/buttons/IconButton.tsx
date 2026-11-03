import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color, radius, touch } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/** 44x44 icon-only button with a required accessible label and an optional count badge. */
export function IconButton({
  label,
  onPress,
  children,
  badge,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  badge?: number;
}) {
  const shown = badge && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown ? `${label}, ${shown} unread` : label}
      onPress={onPress}
      style={styles.btn}
      hitSlop={6}
    >
      {children}
      {shown ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{shown}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    btn: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: 4,
      right: 2,
      minWidth: 18,
      height: 18,
      borderRadius: radius.pill,
      backgroundColor: color.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    badgeText: { fontSize: 11, lineHeight: 14, fontWeight: "800", color: color.onAccent },
  }),
);
