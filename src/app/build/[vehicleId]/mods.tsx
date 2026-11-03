import { Redirect, useLocalSearchParams } from "expo-router";
import { buildPath, isUuid } from "@/domain/deepLinks";

/** dynorex.app/build/:vehicleId/mods (the push spec's build-update link): the timeline is on the build page. */
export default function BuildModsLink() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId ?? "");
  return <Redirect href={buildPath(isUuid(id) ? id : "not-found")} />;
}
