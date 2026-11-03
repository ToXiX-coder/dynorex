import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { usePressSpring } from "@/components/motion/Motion";
import { haptic } from "@/services/haptics";
import { color, radius, space, touch, type } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

export type ButtonVariant = "primary" | "secondary" | "destructive";

/**
 * Primary: Electric Lime with Asphalt text. Secondary: Bone outline. Destructive: Aggressive Red
 * with a large-text label (Bone on Red is 4.39:1, which passes only for large text).
 * Always at least 44x44, always labelled, announces busy/disabled state.
 */
export function Button({
  title,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  ...rest
}: Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const inactive = disabled || loading;
  const spring = usePressSpring(0.98);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={4}
      {...rest}
      onPressIn={(e) => {
        spring.onPressIn();
        // the main action of a screen answers with a light tap, so it feels like a real switch
        if (variant === "primary") haptic.tap();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring.onPressOut();
        rest.onPressOut?.(e);
      }}
      style={[
        styles.base,
        styles[variant],
        fullWidth && styles.full,
        inactive && styles.inactive,
        // springs down on press, with a slight dim (the same cue as before, now with motion)
        !inactive && {
          transform: [{ scale: spring.scale }],
          opacity: spring.scale.interpolate({ inputRange: [0.98, 1], outputRange: [0.85, 1], extrapolate: "clamp" }),
        },
      ]}
    >
      <View style={styles.row}>
        {loading && <ActivityIndicator color={variant === "primary" ? color.onAccent : color.text} />}
        <Text
          style={[
            variant === "destructive" ? type.buttonLarge : type.button,
            { color: variant === "primary" ? color.onAccent : variant === "destructive" ? color.onDanger : color.text },
          ]}
        >
          {title}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = themed(() =>
  StyleSheet.create({
    base: {
      minHeight: touch.min,
      minWidth: touch.min,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    primary: { backgroundColor: color.accent },
    // tonal: a raised fill reads as a button without an outline
    secondary: { backgroundColor: color.surfaceRaised },
    destructive: { backgroundColor: color.danger },
    full: { alignSelf: "stretch" },
    // Disabled must not look enabled: no fill colour, dashed outline, gray label via opacity.
    inactive: { opacity: 0.45 },
  }),
);
