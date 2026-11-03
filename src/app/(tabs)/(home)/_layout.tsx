import { Stack } from "expo-router";
import { HOME, stackOptions } from "@/components/navigation/stackOptions";

export default function HomeStack() {
  return (
    <Stack screenOptions={stackOptions(HOME)}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="discover/index" options={{ title: "Discover Builds" }} />
      <Stack.Screen name="discover/botw" options={{ title: "Build of the Week" }} />
      <Stack.Screen name="search" options={{ title: "Search" }} />
      <Stack.Screen name="inbox" options={{ title: "Notifications" }} />
      <Stack.Screen name="following" options={{ title: "Following" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="profile-edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="driver" options={{ title: "Your driver" }} />
      <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
      <Stack.Screen name="settings/account" options={{ title: "Account" }} />
      <Stack.Screen name="settings/privacy" options={{ title: "Privacy and safety" }} />
      <Stack.Screen name="settings/notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="settings/appearance" options={{ title: "Appearance" }} />
      <Stack.Screen name="settings/subscription" options={{ title: "Dynorex+" }} />
      <Stack.Screen name="settings/data" options={{ title: "Your data" }} />
      <Stack.Screen name="settings/about" options={{ title: "About and legal" }} />
    </Stack>
  );
}
