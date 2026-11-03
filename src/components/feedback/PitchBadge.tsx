import { router, usePathname } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resetDemo } from "@/demo/services";
import { config } from "@/services/config";
import { border, color, radius, space } from "@/theme/tokens";
import { Button } from "../buttons/Button";
import { Text } from "../Text";
import { themed } from "@/theme/themed";
import { HOME } from "@/components/navigation/stackOptions";
import { startTour } from "@/features/tour/Tour";
import { showTorqBubble } from "@/features/torq/TorqBubble";

/**
 * Always-visible marker in pitch mode, so nobody mistakes the sample data for real users or real
 * purchases. Tap for what pitch mode is, to take the guided tour, and to reset the sample data between demos.
 */
export function PitchBadge() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // forms keep their Save button just above the tab bar, right where the pill floats: step aside there, like Torq
  if (!config.demoMode || !showTorqBubble(path)) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pitch mode, sample data. Opens details"
        onPress={() => setOpen(true)}
        style={[styles.pill, { bottom: insets.bottom + 76 }]}
      >
        <Text style={styles.pillText}>PITCH MODE · SAMPLE DATA</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text variant="title" accessibilityRole="header">
              Pitch mode
            </Text>
            <Text>
              Sign-in is off and everything runs on made-up sample data stored on this device. No server, no real users,
              no real purchases: buying Dynorex+ here charges nothing.
            </Text>
            <Text variant="caption" muted>
              Pitch mode only exists in development and staging builds. Real builds always require an account.
            </Text>
            <View style={styles.row}>
              <Button title="Close" variant="secondary" onPress={() => setOpen(false)} />
              <Button
                title="Take the tour"
                variant="secondary"
                onPress={() => {
                  setOpen(false);
                  startTour();
                }}
              />
              <Button
                title="Reset sample data"
                onPress={() => {
                  resetDemo();
                  setOpen(false);
                  router.replace(HOME);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pill: {
      position: "absolute",
      // bottom left: the bottom right belongs to the Ask Torq bubble
      left: space.sm,
      backgroundColor: color.background,
      borderWidth: border.regular,
      borderColor: color.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      opacity: 0.92,
    },
    pillText: { color: color.accent, fontSize: 11, lineHeight: 14, fontWeight: "800" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: space.lg },
    sheet: { backgroundColor: color.surface, borderRadius: radius.xl, padding: space.xl, gap: space.md },
    row: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end", flexWrap: "wrap" },
  }),
);
