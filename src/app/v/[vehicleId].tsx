import { Redirect, useLocalSearchParams } from "expo-router";
import { buildPath, isUuid } from "@/domain/deepLinks";

/** dynorex.app/v/:vehicleId: a vehicle's public page is its build page (one build per vehicle). */
export default function VehicleLink() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId ?? "");
  // anything that isn't an id goes to the build page's own "not found"
  return <Redirect href={buildPath(isUuid(id) ? id : "not-found")} />;
}
