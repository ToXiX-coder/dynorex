import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { native, usePressSpring } from "@/components/motion/Motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { color, motion, radius, space, touch } from "@/theme/tokens";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

/**
 * Selectable chip. Selected = a solid ink fill with the label knocked out (a change of fill, not just of colour, so
 * it reads without colour vision), like a segmented control. Springs on press and gives a small pop when it becomes
 * selected (static with reduced motion). `action` makes it a plain one-tap button (a suggestion), never "checked".
 */
export function Chip({
  label,
  selected = false,
  onPress,
  action = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  action?: boolean;
}) {
  const spring = usePressSpring(0.97);
  const reduced = useReducedMotion();
  const [pop] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!selected || reduced) return;
    pop.setValue(1.08);
    Animated.timing(pop, { toValue: 1, duration: motion.fast, useNativeDriver: native }).start();
  }, [selected, reduced, pop]);
  return (
    <AnimatedPressable
      accessibilityRole={action ? "button" : "checkbox"}
      accessibilityState={action ? undefined : { checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={spring.onPressIn}
      onPressOut={spring.onPressOut}
      style={[
        styles.chip,
        selected && styles.selected,
        { transform: [{ scale: Animated.multiply(spring.scale, pop) }] },
      ]}
    >
      <Text variant="label" style={{ color: selected ? color.background : color.text }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = themed(() =>
  StyleSheet.create({
    chip: {
      minHeight: touch.min,
      paddingHorizontal: space.md,
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: color.surface,
    },
    selected: { backgroundColor: color.text },
  }),
);
