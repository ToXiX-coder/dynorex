import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { buildPath } from "@/domain/deepLinks";
import { socialService } from "@/features/social/socialService";
import { useFlags } from "@/providers/AppProviders";

type Pick = { title: string; vehicle_id: string; owner_username: string; week_start: string } | null;

/**
 * dynorex.app/discover/botw. Build of the Week is switched off (flag and server setting) until its
 * anti-fraud rules and weekly owner are in place; until then this is an honest teaser.
 */
export default function BuildOfTheWeek() {
  const flags = useFlags();
  const [pick, setPick] = useState<Pick | undefined>(undefined);

  useEffect(() => {
    if (!flags.buildOfTheWeek) return;
    void socialService.buildOfTheWeek().then((r) => setPick(r.ok ? (r.data as Pick) : null));
  }, [flags.buildOfTheWeek]);

  if (!flags.buildOfTheWeek) {
    return (
      <ComingSoon
        title="Build of the Week"
        lines={[
          "A weekly pick of one standout public build",
          "Switches on once the selection and anti-cheating rules are ready",
        ]}
      />
    );
  }
  if (pick === undefined) return <LoadingState label="Loading Build of the Week" />;
  if (!pick)
    return (
      <Screen>
        <EmptyState message="No pick this week" detail="Check back soon." />
      </Screen>
    );
  return (
    <Screen>
      <Text variant="caption" muted>{`Week of ${pick.week_start}`}</Text>
      <Text variant="display">{pick.title}</Text>
      <Text muted>{`@${pick.owner_username}`}</Text>
      <EmptyState
        expression="neutral"
        message="This week's pick"
        action={{ title: "Open the build", onPress: () => router.push(buildPath(pick.vehicle_id)) }}
      />
    </Screen>
  );
}
