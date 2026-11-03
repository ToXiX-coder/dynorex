import { router, type Href } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { BackIcon } from "@/components/icons";
import { color, FONT, touch } from "@/theme/tokens";

/**
 * The Home tab. Not "/": the welcome screen, (auth)/index, also lives at "/", and once signed in that
 * screen is guarded, so replace("/") matches it and does nothing. Use "/" only to hand off to the gate.
 */
export const HOME = "/(tabs)/(home)" as const;

/** Back through history when there is any, otherwise to `fallback` (a screen opened from a link has none). */
export const backOr = (fallback: Href = HOME) => (router.canGoBack() ? router.back() : router.replace(fallback));

/**
 * There is always a way back, including on a screen opened from another tab, a notification or a link:
 * back through history when there is any, otherwise to the stack's home (`fallback`).
 */
export function HeaderBack({ fallback, tint = color.text }: { fallback: Href; tint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => backOr(fallback)}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
    >
      <BackIcon color={tint} />
    </Pressable>
  );
}

/** Read on every navigation, so headers follow the current theme. */
export const baseStackOptions = () =>
  ({
    headerStyle: { backgroundColor: color.background },
    headerTintColor: color.text,
    headerTitleStyle: { fontFamily: FONT.header, fontSize: 16 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: color.background },
    // the same push from the right on iOS and Android (Android's default is a fade)
    animation: "slide_from_right",
  }) as const;

/**
 * Stack `screenOptions`: every screen except the stack's starting screens (`homes`) gets the same back
 * button, so it looks the same everywhere and still works when the screen was opened from a link.
 */
export function stackOptions(fallback: Href, homes: readonly string[] = ["index"]) {
  return ({ route }: { route: { name: string } }) =>
    homes.includes(route.name)
      ? baseStackOptions()
      : { ...baseStackOptions(), headerLeft: () => <HeaderBack fallback={fallback} /> };
}

const styles = StyleSheet.create({
  back: { minWidth: touch.min, minHeight: touch.min, justifyContent: "center" },
});
