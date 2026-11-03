import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { color, font } from "@/ui/theme";
import { SessionProvider } from "@/ui/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: color.paper },
            headerTintColor: color.accent,
            headerTitleStyle: { fontFamily: font.serif, color: color.ink },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: color.paper },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Buildmark" }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
          <Stack.Screen name="claim" options={{ title: "Take over a record" }} />
          <Stack.Screen name="car/new" options={{ title: "Add a car" }} />
          <Stack.Screen name="car/[carId]/index" options={{ title: "Record" }} />
          <Stack.Screen name="car/[carId]/add" options={{ title: "Log work" }} />
          <Stack.Screen name="car/[carId]/entry/[entryId]" options={{ title: "Entry" }} />
          <Stack.Screen name="car/[carId]/share" options={{ title: "Share and sell" }} />
          <Stack.Screen name="r/[token]" options={{ title: "Build record" }} />
          <Stack.Screen name="c/[token]" options={{ title: "Confirm work" }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
