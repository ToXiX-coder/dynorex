import { Stack } from "expo-router";
import { stackOptions } from "@/components/navigation/stackOptions";

export default function GarageStack() {
  return (
    <Stack screenOptions={stackOptions("/garage")}>
      <Stack.Screen name="index" options={{ title: "Garage" }} />
      <Stack.Screen name="new" options={{ title: "Add vehicle" }} />
      <Stack.Screen name="wishlist" options={{ title: "Wishlist" }} />
      <Stack.Screen name="claim" options={{ title: "Take over a record" }} />
      <Stack.Screen name="[vehicleId]/record/index" options={{ title: "Build Record" }} />
      <Stack.Screen name="[vehicleId]/record/[entryType]/[entryId]" options={{ title: "Record entry" }} />
      <Stack.Screen name="[vehicleId]/index" options={{ title: "Vehicle" }} />
      <Stack.Screen name="[vehicleId]/edit" options={{ title: "Edit vehicle" }} />
      <Stack.Screen name="[vehicleId]/costs" options={{ title: "Costs" }} />
      <Stack.Screen name="[vehicleId]/maintenance" options={{ title: "Maintenance" }} />
      <Stack.Screen name="[vehicleId]/runs" options={{ title: "Performance" }} />
      <Stack.Screen name="[vehicleId]/run" options={{ title: "Time a run" }} />
      <Stack.Screen name="[vehicleId]/dyno" options={{ title: "Dyno log" }} />
      <Stack.Screen name="[vehicleId]/laps" options={{ title: "Track laps" }} />
      <Stack.Screen name="[vehicleId]/insurance" options={{ title: "Insurance mod list" }} />
      <Stack.Screen name="[vehicleId]/mods/new" options={{ title: "Add mod" }} />
      <Stack.Screen name="[vehicleId]/mods/[modId]/index" options={{ title: "Mod" }} />
      <Stack.Screen name="[vehicleId]/mods/[modId]/edit" options={{ title: "Edit mod" }} />
    </Stack>
  );
}
