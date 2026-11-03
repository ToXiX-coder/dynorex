import { router, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { native } from "@/components/motion/Motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HomeIcon, PlusIcon, RoadIcon, SteeringIcon, WrenchIcon } from "@/components/icons";
import { OfflineBanner } from "@/components/feedback/OfflineBanner";
import { Text } from "@/components/Text";
import { OfflineSync } from "@/features/mods/OfflineSync";
import { NotificationRouter } from "@/features/notifications/NotificationRouter";
import { useAuth } from "@/features/auth/AuthProvider";
import { TorqBubble } from "@/features/torq/TorqBubble";
import { useFlags } from "@/providers/AppProviders";
import { haptic } from "@/services/haptics";
import { a11yHidden } from "@/utils/a11y";
import { color, FONT, radius, spring, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * The charged control in the middle of the bar: it squeezes and the plus turns a quarter on press-in, with a light
 * tap, then springs back. Interruptible, so fast double taps never stutter.
 */
function AddButton() {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  const go = (to: number) =>
    reduced ? v.setValue(0) : Animated.spring(v, { toValue: to, ...spring.snappy, useNativeDriver: native }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add something new"
      onPressIn={() => {
        haptic.tap();
        go(1);
      }}
      onPressOut={() => go(0)}
      onPress={() => router.push("/add")}
      style={styles.fabSlot}
    >
      <Animated.View
        style={[
          styles.fab,
          { transform: [{ skewX: "-12deg" }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) }] },
        ]}
      >
        <Animated.View
          style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}
        >
          <PlusIcon color={color.onAccent} size={20} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Five tabs, in order: Home | Build | [+] Add | Line | Paddock.
 * Each tab folder has its own Stack, so history is kept per tab.
 * Line and Paddock render gray with a "Soon" tag while their flags are off.
 */
function TabIcon({ Icon, focused, dimmed }: { Icon: typeof HomeIcon; focused: boolean; dimmed?: boolean }) {
  const c = dimmed ? color.disabledText : focused ? color.accent : color.text;
  const reduced = useReducedMotion();
  const on = focused && !dimmed;
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    if (reduced) return v.setValue(on ? 1 : 0);
    Animated.spring(v, { toValue: on ? 1 : 0, speed: 16, bounciness: 10, useNativeDriver: native }).start();
  }, [on, reduced, v]);
  return (
    <View style={styles.iconWrap}>
      {/* the active icon lifts and grows a touch */}
      <Animated.View
        style={{
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        }}
      >
        <Icon color={c} />
      </Animated.View>
      {dimmed && (
        <View style={styles.soon} {...a11yHidden}>
          <Text style={styles.soonText}>SOON</Text>
        </View>
      )}
      {/* active indicator bar: a shape cue, not colour alone; it grows out from the centre */}
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: color.accent, opacity: v, transform: [{ scaleX: v }, { skewX: "-20deg" }] },
        ]}
      />
    </View>
  );
}

export default function TabsLayout() {
  const flags = useFlags();
  const { status } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <OfflineBanner />
      <OfflineSync />
      <NotificationRouter />
      <Tabs
        // Back from a screen opened in another tab returns to the tab you came from, not the first tab.
        backBehavior="history"
        // a selection tick on every tab change, like a detent
        screenListeners={{ tabPress: () => haptic.select() }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: color.background, borderTopColor: color.hairline, minHeight: 64 },
          tabBarActiveTintColor: color.accent,
          tabBarInactiveTintColor: color.text,
          tabBarLabelStyle: { fontFamily: FONT.heading, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
          tabBarItemStyle: { minHeight: touch.min },
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{
            title: "Home",
            tabBarAccessibilityLabel: "Home",
            tabBarIcon: ({ focused }) => <TabIcon Icon={HomeIcon} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="garage"
          options={{
            title: "Build",
            tabBarAccessibilityLabel: "Build, your garage",
            tabBarIcon: ({ focused }) => <TabIcon Icon={WrenchIcon} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="add-placeholder"
          options={{
            title: "Add",
            tabBarAccessibilityLabel: "Add something new",
            tabBarButton: () => <AddButton />,
          }}
        />
        <Tabs.Screen
          name="line"
          options={{
            title: "Line",
            tabBarAccessibilityLabel: flags.line ? "Line" : "Line, coming soon",
            tabBarActiveTintColor: flags.line ? color.accent : color.disabledText,
            tabBarInactiveTintColor: flags.line ? color.text : color.disabledText,
            tabBarIcon: ({ focused }) => <TabIcon Icon={RoadIcon} focused={focused} dimmed={!flags.line} />,
          }}
        />
        <Tabs.Screen
          name="paddock"
          options={{
            title: "Paddock",
            tabBarAccessibilityLabel: flags.paddock ? "Paddock" : "Paddock, coming soon",
            tabBarActiveTintColor: flags.paddock ? color.accent : color.disabledText,
            tabBarInactiveTintColor: flags.paddock ? color.text : color.disabledText,
            tabBarIcon: ({ focused }) => <TabIcon Icon={SteeringIcon} focused={focused} dimmed={!flags.paddock} />,
          }}
        />
      </Tabs>
      {status === "signedIn" && flags.torqChat ? <TorqBubble /> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    iconWrap: { alignItems: "center", gap: 2 },
    soon: {
      position: "absolute",
      top: -6,
      left: 14,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: radius.sm,
      backgroundColor: color.background,
      paddingHorizontal: 2,
    },
    soonText: { fontSize: 8, lineHeight: 10, fontWeight: "800", color: color.textMuted },
    dot: { width: 18, height: 3, borderRadius: 2 },
    // compact: sits in the bar like the other tabs (the whole slot is the touch target)
    fabSlot: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: touch.min },
    fab: {
      width: 44,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: color.accent,
      alignItems: "center",
      justifyContent: "center",
      transform: [{ skewX: "-12deg" }],
      // a soft lime glow: still the one control that should feel charged
      shadowColor: color.accent,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
  }),
);
