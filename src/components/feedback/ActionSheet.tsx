import { useEffect, useRef } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/Text";
import { color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export type SheetAction = { label: string; hint?: string; destructive?: boolean; onPress: () => void };

/**
 * A bottom sheet of secondary actions (the "⋯" menu), so screens keep one clear primary button and tuck
 * things like Mute, Report and Block away the way phone apps do. Tapping outside or Cancel closes it.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  // on a phone, the tap that opened the menu can land a second time on the backdrop that just appeared under it
  const openedAt = useRef(0);
  useEffect(() => {
    if (visible) openedAt.current = Date.now();
  }, [visible]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={() => Date.now() - openedAt.current > 400 && onClose()}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}
          accessibilityViewIsModal
          onPress={() => {}}
          accessible={false}
        >
          <View style={styles.grabber} />
          {title ? (
            <Text variant="caption" muted style={{ textAlign: "center" }}>
              {title}
            </Text>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityHint={a.hint}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.row, a.destructive && styles.destructive, pressed && styles.pressed]}
            >
              <Text variant="bodyStrong">{a.label}</Text>
              {a.hint ? (
                <Text variant="caption" muted>
                  {a.hint}
                </Text>
              ) : null}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.row, styles.cancel, pressed && styles.pressed]}
          >
            <Text variant="bodyStrong" style={{ textAlign: "center" }}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.md,
      paddingBottom: space.xl,
      gap: space.xs,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: color.border,
      marginBottom: space.sm,
    },
    row: {
      minHeight: touch.min,
      justifyContent: "center",
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      gap: 2,
    },
    // red text fails contrast on this background, so destructive rows get a red bar instead
    destructive: { borderLeftWidth: 4, borderLeftColor: color.danger },
    cancel: { marginTop: space.xs, backgroundColor: color.background },
    pressed: { backgroundColor: color.background },
  }),
);
