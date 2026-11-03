import { a11yHidden } from "@/utils/a11y";
import { useId, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { border, color, radius, space, touch, type } from "@/theme/tokens";
import { AlertIcon } from "../icons";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/**
 * Labelled input. The label is always visible (never placeholder-only). Focus = lime border;
 * error = red border PLUS an alert-marked message in Bone text, announced to screen readers.
 */
export function TextField({
  label,
  hint,
  error,
  required,
  ...rest
}: TextInputProps & { label: string; hint?: string; error?: string | null; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  return (
    <View style={styles.wrap}>
      <Text variant="label" nativeID={`${id}-label`}>
        {label}
        {required ? (
          <Text variant="label" muted>
            {" "}
            (required)
          </Text>
        ) : null}
      </Text>
      <TextInput
        // one accessible name on both platforms (iOS ignores labelledBy; Android prefers it)
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityHint={[hint, error].filter(Boolean).join(". ") || undefined}
        placeholderTextColor={color.textMuted}
        selectionColor={color.accent}
        cursorColor={color.accent}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.focused, !!error && styles.error]}
        {...rest}
      />
      {hint && !error ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/** Shown beside a form's save button when fields further up need fixing. */
export const fixFieldsText = (n: number) =>
  n === 1 ? "One field above needs fixing." : `${n} fields above need fixing.`;

/** The message under a field with a problem: a red alert mark and Bone text, announced to screen readers. */
export function FieldError({ message }: { message: string }) {
  return (
    <View
      style={styles.errorRow}
      accessible
      accessibilityLabel={`Error: ${message}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.errorMark} {...a11yHidden}>
        <AlertIcon color={color.danger} size={14} />
      </View>
      <Text variant="caption" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    input: {
      ...type.body,
      minHeight: touch.min,
      color: color.text,
      backgroundColor: color.background,
      borderWidth: border.regular,
      borderColor: color.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    focused: { borderColor: color.accent, borderWidth: border.focus },
    error: { borderColor: color.danger, borderWidth: border.focus },
    errorRow: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
    // nudged down to sit on the caption's first line
    errorMark: { paddingTop: 2 },
  }),
);
