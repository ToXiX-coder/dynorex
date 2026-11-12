import { router } from "expo-router";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { PhaseNotice } from "@/components/feedback/States";
import { Text } from "@/components/Text";
import { OnboardingFrame } from "@/features/onboarding/OnboardingFrame";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";

/**
 * Step 2: "Show it off". Hero photos need private storage, compression and EXIF stripping, which ship
 * with the garage in Phase 3. Until then this step says so plainly instead of faking an upload.
 */
export default function StepPhoto() {
  const next = useAction(() => profileService.setOnboardingStep(2));
  return (
    <OnboardingFrame step={2} torq="success">
      <Text>Add a hero photo of your ride so your build looks the part.</Text>
      <PhaseNotice phase={3}>
        Photo uploads arrive with the garage update. You&apos;ll be able to add one from your vehicle page.
      </PhaseNotice>
      {next.error ? <InlineError kind={next.error.key} /> : null}
      <Button
        title="Continue"
        loading={next.busy}
        onPress={async () => {
          const r = await next.run();
          if (r?.ok) router.replace("/onboarding/goal");
        }}
      />
    </OnboardingFrame>
  );
}
