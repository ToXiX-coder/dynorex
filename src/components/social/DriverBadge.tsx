import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { driverQuip, gearDescription, type Gear } from "@/domain/gear";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import { color, radius, space } from "@/theme/tokens";
import { Driver } from "./Driver";
import { themed } from "@/theme/themed";

/**
 * Your driver in a lime-rimmed badge. The easter egg: tap them and they hop and say something in character
 * (full kits have their own lines). With reduced motion they just talk.
 */
export function DriverBadge({
  gear,
  size = 76,
  bubble = "right",
}: {
  gear: Gear;
  size?: number;
  /** where the speech bubble pops up: beside the badge (headers) or under it (centered layouts) */
  bubble?: "right" | "below";
}) {
  const reduced = useReducedMotion();
  const [hop] = useState(() => new Animated.Value(0));
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const quip = open && taps > 0 ? driverQuip(gear, taps - 1) : null;

  // the bubble fades out on its own a few seconds after the last tap
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 3500);
    return () => clearTimeout(t);
  }, [open, taps]);

  const poke = () => {
    haptic.tap();
    setTaps((t) => t + 1);
    setOpen(true);
    if (reduced) return;
    hop.setValue(0);
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(hop, { toValue: 0, friction: 3, tension: 160, useNativeDriver: true }),
    ]).start();
  };

  return (
    // above its siblings, so the speech bubble isn't drawn under the name beside it
    <View style={{ zIndex: 10, elevation: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gearDescription(gear)}
        accessibilityHint="Say hi to your driver"
        onPress={poke}
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.12] }) },
              { rotate: hop.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-6deg"] }) },
            ],
          }}
        >
          <Driver gear={gear} size={size - 4} />
        </Animated.View>
      </Pressable>
      {quip ? (
        <View style={bubble === "right" ? styles.bubble : styles.bubbleBelow} accessibilityLiveRegion="polite">
          <View style={bubble === "right" ? styles.tail : styles.tailUp} />
          <Text variant="caption" style={{ color: color.onAccent, fontWeight: "700" }}>
            {quip}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    ring: {
      overflow: "hidden",
      backgroundColor: color.surface,
      borderWidth: 2,
      borderColor: color.accent,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    bubble: {
      position: "absolute",
      top: -6,
      left: "88%",
      width: 170,
      backgroundColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      zIndex: 2,
    },
    bubbleBelow: {
      position: "absolute",
      top: "100%",
      marginTop: space.sm,
      alignSelf: "center",
      width: 200,
      backgroundColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      zIndex: 2,
      alignItems: "center",
    },
    tailUp: {
      position: "absolute",
      top: -5,
      left: 95,
      width: 10,
      height: 10,
      backgroundColor: color.accent,
      transform: [{ rotate: "45deg" }],
    },
    tail: {
      position: "absolute",
      left: -5,
      top: 12,
      width: 10,
      height: 10,
      backgroundColor: color.accent,
      transform: [{ rotate: "45deg" }],
    },
  }),
);
