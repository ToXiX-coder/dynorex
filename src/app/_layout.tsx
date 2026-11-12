import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { getLoadedFonts, useFonts } from "expo-font";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { PitchBadge } from "@/components/feedback/PitchBadge";
import { RobotsForPath } from "@/components/seo/PageMeta";
import { BrandSplash } from "@/components/mascot/BrandSplash";
import { TourCard } from "@/features/tour/Tour";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { AppProviders } from "@/providers/AppProviders";
import { mark } from "@/services/monitoring/perf";
import { startMonitoring } from "@/services/monitoring/sentry";
import { HOME, stackOptions } from "@/components/navigation/stackOptions";
import { FONT, FONT_FILES } from "@/theme/fonts";
import { Themed, ThemeProvider } from "@/theme/ThemeProvider";

startMonitoring();
void SplashScreen.preventAutoHideAsync().catch(() => {});

// True in iOS and Android builds that have the brand fonts built in, so nothing waits for them to load.
const FONTS_BUILT_IN = (() => {
  if (Platform.OS === "web") return false;
  try {
    const loaded = getLoadedFonts();
    return Object.values(FONT).every((f) => loaded.includes(f));
  } catch {
    return false;
  }
})();

// Gate screens and the tabs are starting points; every other root screen opened from a link gets a way back home.
const screenOptions = stackOptions(HOME, [
  "(tabs)",
  "(auth)",
  "onboarding",
  "verify-email",
  "username",
  "auth/callback",
]);

/**
 * One protected group per gate (welcome -> verify -> username -> onboarding -> app). Only the
 * current gate's screens exist, so a deep link can't skip a step. These guards are UX only; the
 * database enforces access.
 */
function RootNavigator() {
  const { gate } = useAuth();
  // Brand fonts are built into store builds (D-67); elsewhere they load behind BrandSplash, and after 2 s the app
  // goes on regardless (system font fallback).
  const [fontsLoaded, fontError] = useFonts(FONTS_BUILT_IN ? {} : FONT_FILES);
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 2000);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = FONTS_BUILT_IN || fontsLoaded || Boolean(fontError) || fontTimeout;
  // the app-open intro (tachometer redlines into the logo) plays once per launch; a tap skips it
  const [introDone, setIntroDone] = useState(false);
  const appReady = gate !== "loading" && fontsReady;
  const showApp = appReady && introDone;

  useEffect(() => {
    // The native splash hands over to BrandSplash immediately.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => {
    if (gate !== "loading") mark("shell_ready");
  }, [gate]);
  useEffect(() => {
    if (showApp) mark("content_visible");
  }, [showApp]);

  return (
    <>
      {/* The app builds and starts loading underneath the intro (D-67), so its screens are ready when it lifts. */}
      {appReady ? (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden={!showApp}
          importantForAccessibility={showApp ? "auto" : "no-hide-descendants"}
        >
          <Themed>
            <AppStack gate={gate} />
            {showApp ? <TourCard /> : null}
          </Themed>
        </View>
      ) : null}
      <IntroCover lifted={showApp}>
        <BrandSplash onIntroDone={() => setIntroDone(true)} />
      </IntroCover>
      <PitchBadge />
    </>
  );
}

/** Keeps the intro on top until the app is ready and the intro is over, then fades it away. */
function IntroCover({ lifted, children }: { lifted: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!lifted || reduced) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    }).start(() => setGone(true));
  }, [lifted, reduced, opacity]);
  // reduced motion: no fade, it just goes
  if (gone || (lifted && reduced)) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={lifted ? "none" : "auto"}>
      {children}
    </Animated.View>
  );
}

/** The app's screens, in the person's theme (the intro above always uses the brand colours). */
function AppStack({ gate }: { gate: ReturnType<typeof useAuth>["gate"] }) {
  return (
    <>
      <RobotsForPath />
      <Stack screenOptions={screenOptions}>
        <Stack.Protected guard={gate === "welcome"}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === "verify"}>
          <Stack.Screen name="verify-email" options={{ title: "Verify email" }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === "username"}>
          <Stack.Screen name="username" options={{ title: "Pick a username", headerBackVisible: false }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === "onboarding"}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={gate === "app"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ presentation: "modal", animation: "slide_from_bottom", title: "Add" }} />
          <Stack.Screen
            name="plus"
            options={{ presentation: "modal", animation: "slide_from_bottom", title: "Dynorex+" }}
          />
          <Stack.Screen name="torq" options={{ title: "Ask Torq" }} />
          <Stack.Screen name="offers/[offerId]" options={{ title: "Offer chat" }} />
          <Stack.Screen name="requests/[requestId]" options={{ title: "Request" }} />
          <Stack.Screen name="chat/[type]/[roomId]" options={{ title: "Chat" }} />
          <Stack.Screen name="saved" options={{ title: "Saved" }} />
          <Stack.Screen name="wrapped" options={{ title: "Your year" }} />
          <Stack.Screen name="drive/[eventId]" options={{ title: "Live drive" }} />
        </Stack.Protected>
        {/* Public pages: open to everyone, signed in or not. They read only public projections. */}
        <Stack.Screen name="u/[username]" options={{ title: "Profile" }} />
        <Stack.Screen name="build/[vehicleId]/index" options={{ title: "Build" }} />
        <Stack.Screen name="build/[vehicleId]/mod/[modId]" options={{ title: "Mod" }} />
        <Stack.Screen name="build/[vehicleId]/mods" options={{ headerShown: false }} />
        <Stack.Screen name="v/[vehicleId]" options={{ headerShown: false }} />
        <Stack.Screen name="route/[routeId]" options={{ title: "Route" }} />
        <Stack.Screen name="events/[eventId]" options={{ title: "Event" }} />
        <Stack.Screen name="clubs/[clubId]" options={{ title: "Club" }} />
        <Stack.Screen name="posts/[postId]" options={{ title: "Post" }} />
        <Stack.Screen name="listings/[listingId]" options={{ title: "Listing" }} />
        <Stack.Screen name="business/[businessId]" options={{ title: "Shop" }} />
        <Stack.Screen name="tools" options={{ title: "Tools" }} />
        <Stack.Screen name="history/[token]" options={{ title: "Build Record" }} />
        <Stack.Screen name="confirm/[token]" options={{ title: "Confirm a job" }} />
        <Stack.Screen name="support" options={{ title: "Help" }} />
        <Stack.Screen name="account-deletion" options={{ title: "Delete account" }} />
        {/* Links from email and OAuth must open whatever the current gate is. */}
        <Stack.Screen name="auth/callback" options={{ title: "Signing in", headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ title: "New password" }} />
        <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <ThemeProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </AppProviders>
  );
}
