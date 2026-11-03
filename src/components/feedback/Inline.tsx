import { router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from "react-native";
import { ERROR_COPY, type ErrorKey } from "@/domain/copy/errors";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Button } from "../buttons/Button";
import { AlertIcon, CheckIcon } from "../icons";
import { Appear, Shake } from "../motion/Motion";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/**
 * Compact error for forms: red marker + Bone text (red text is too low-contrast), announced to
 * screen readers. Uses the spec copy; never shows raw codes.
 */
export function InlineError({ kind, onAction: given }: { kind: ErrorKey; onAction?: (action: string) => void }) {
  const c = ERROR_COPY[kind];
  // Plan limits and Plus-only refusals always offer the way out: the paywall.
  const upsell =
    kind === "planLimitVehicles" ||
    kind === "planLimitMods" ||
    kind === "planLimitRoutes" ||
    kind === "planLimitListings" ||
    kind === "paywall";
  const onAction =
    given ?? (upsell ? () => router.push(`/plus?source=${kind === "paywall" ? "feature" : "limit"}`) : undefined);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${c.title}. ${c.body}`);
  }, [c.title, c.body]);
  return (
    <Shake trigger={kind}>
      <View style={styles.box} accessibilityLiveRegion="polite">
        <View style={styles.bar} {...a11yHidden} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="bodyStrong">{c.title}</Text>
          <Text variant="caption">{c.body}</Text>
          {onAction && c.actions[0] ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button title={c.actions[0]} variant="secondary" onPress={() => onAction(c.actions[0]!)} />
            </View>
          ) : null}
        </View>
      </View>
    </Shake>
  );
}

/**
 * Same layout for good news ("Check your email", "Saved"): lime marker and a check, never colour alone.
 * `headsUp` is for something to know or fix that isn't an error ("Location is off", "Unsaved drive found"):
 * a neutral marker and an alert mark, so it never looks like a success.
 */
export function InlineNotice({
  title,
  body,
  children,
  headsUp = false,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  headsUp?: boolean;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility([title, body].filter(Boolean).join(". "));
  }, [title, body]);
  return (
    <Appear rise={6}>
      <View style={styles.box} accessibilityLiveRegion="polite">
        <View style={[styles.bar, { backgroundColor: headsUp ? color.textMuted : color.accent }]} {...a11yHidden} />
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={styles.titleRow}>
            {headsUp ? <AlertIcon color={color.text} /> : <CheckIcon color={color.accent} />}
            <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
              {title}
            </Text>
          </View>
          {body ? <Text variant="caption">{body}</Text> : null}
          {children}
        </View>
      </View>
    </Appear>
  );
}

/**
 * Confirmation modal for destructive actions: Card surface, gray handle, explicit title, Cancel, and a
 * red Delete (or other verb) button. Focus starts on the title for screen readers.
 */
export function ConfirmModal({
  visible,
  kind,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  kind: ErrorKey;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const c = ERROR_COPY[kind];
  const destructive = "destructive" in c && c.destructive;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} {...a11yHidden} />
          <Text variant="title" accessibilityRole="header">
            {c.title}
          </Text>
          <Text>{c.body}</Text>
          {children}
          <View style={styles.actions}>
            <Button title={c.actions[1] ?? "Cancel"} variant="secondary" onPress={onCancel} disabled={busy} />
            <Button
              title={confirmLabel ?? c.actions[0] ?? "OK"}
              variant={destructive ? "destructive" : "primary"}
              onPress={onConfirm}
              loading={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Lime progress dots with a text equivalent ("Step 2 of 3"). */
export function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: step }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i < step ? styles.dotOn : styles.dotOff, i === step - 1 && styles.dotCurrent]}
        />
      ))}
    </View>
  );
}

export function TextLink({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={styles.link}>
      <Text variant="label" accent style={{ textDecorationLine: "underline" }}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: {
      flexDirection: "row",
      gap: space.md,
      backgroundColor: color.surface,
      borderRadius: radius.md,
      padding: space.md,
    },
    bar: { width: 4, borderRadius: 2, backgroundColor: color.danger },
    titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.xl,
      gap: space.md,
    },
    handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: color.handle },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, flexWrap: "wrap" },
    dots: { flexDirection: "row", gap: space.sm, alignItems: "center" },
    dot: { height: 10, borderRadius: 5 },
    dotOn: { width: 10, backgroundColor: color.accent },
    dotOff: { width: 10, borderWidth: border.regular, borderColor: color.border },
    dotCurrent: { width: 24 },
    link: { minHeight: touch.min, justifyContent: "center" },
  }),
);
