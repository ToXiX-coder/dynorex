import { Stack } from "expo-router";
import { stackOptions } from "@/components/navigation/stackOptions";

export default function LineStack() {
  return (
    <Stack screenOptions={stackOptions("/line")}>
      <Stack.Screen name="index" options={{ title: "Line" }} />
      <Stack.Screen name="record" options={{ title: "Record a drive" }} />
    </Stack>
  );
}
