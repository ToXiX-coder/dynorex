import { Stack } from "expo-router";
import { stackOptions } from "@/components/navigation/stackOptions";

export default function PaddockStack() {
  return (
    <Stack screenOptions={stackOptions("/paddock")}>
      <Stack.Screen name="index" options={{ title: "Paddock" }} />
      <Stack.Screen name="new" options={{ title: "Create event" }} />
      <Stack.Screen name="post" options={{ title: "New post" }} />
      <Stack.Screen name="club-new" options={{ title: "Start a club" }} />
      <Stack.Screen name="sell" options={{ title: "Sell a part" }} />
      <Stack.Screen name="my-shop" options={{ title: "Your shop" }} />
      <Stack.Screen name="business" options={{ title: "Your business" }} />
      <Stack.Screen name="requests" options={{ title: "Service requests" }} />
    </Stack>
  );
}
