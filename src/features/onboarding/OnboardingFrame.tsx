import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { InlineError, ProgressDots } from "@/components/feedback/Inline";
import { Torq } from "@/components/mascot/Torq";
import type { TorqExpression } from "@/components/mascot/art";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { ONBOARDING_STEPS } from "@/domain/onboarding";
import { useAuth } from "@/features/auth/AuthProvider";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import { analytics } from "@/services/analytics";
import { space, touch } from "@/theme/tokens";

/**
 * Shared layout for the three onboarding steps: progress dots, Torq in the corner, Skip top-right.
 * Skip saves "skipped at step N" on the server and creates nothing else.
 */
export function OnboardingFrame({
  step,
  torq,
  children,
}: {
  step: 1 | 2 | 3;
  torq: TorqExpression;
  children: ReactNode;
}) {
  const { refreshProfile } = useAuth();
  const skip = useAction(profileService.skipOnboarding);
  const title = ONBOARDING_STEPS[step - 1]!.title;

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View style={styles.top}>
        <ProgressDots step={step} total={3} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip setup"
          accessibilityHint="You can finish this later from your profile"
          onPress={async () => {
            const r = await skip.run(step);
            if (r?.ok) {
              analytics.track("onboarding_skipped", { step_skipped: step });
              await refreshProfile();
            }
          }}
          style={styles.skip}
          disabled={skip.busy}
        >
          <Text variant="label" muted>
            {skip.busy ? "Skipping…" : "Skip"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
        <Torq expression={torq} size={80} />
      </View>
      {skip.error ? <InlineError kind={skip.error.key} /> : null}
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skip: { minHeight: touch.min, minWidth: touch.min, alignItems: "flex-end", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
});
