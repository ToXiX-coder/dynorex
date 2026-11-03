import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import { type BuildGoalId } from "@/domain/onboarding";
import { useAuth } from "@/features/auth/AuthProvider";
import { GoalGrid } from "@/features/onboarding/GoalGrid";
import { OnboardingFrame } from "@/features/onboarding/OnboardingFrame";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import { analytics } from "@/services/analytics";

/** Step 3: "What's the goal?" One choice required (Just Browsing counts). Saved to the profile. */
export default function StepGoal() {
  const { profile, refreshProfile } = useAuth();
  const [goal, setGoal] = useState<BuildGoalId | null>((profile?.build_goal as BuildGoalId | null) ?? null);
  const finish = useAction(profileService.completeOnboarding);

  return (
    <OnboardingFrame step={3} torq="wrenching">
      <Text muted>Pick one. It shapes what you see in Discover, and you can change it later.</Text>
      <GoalGrid value={goal} onChange={setGoal} />
      {finish.error ? <InlineError kind={finish.error.key} /> : null}
      <Button
        title="Finish"
        disabled={!goal}
        loading={finish.busy}
        onPress={async () => {
          if (!goal) return;
          const r = await finish.run(goal);
          if (r?.ok) {
            analytics.track("onboarding_completed", { build_goal_selected: goal });
            await refreshProfile();
          }
        }}
      />
    </OnboardingFrame>
  );
}
