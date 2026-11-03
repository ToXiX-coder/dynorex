import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Driver } from "@/components/social/Driver";
import { DriverBadge } from "@/components/social/DriverBadge";
import { Text } from "@/components/Text";
import {
  goalGear,
  HEADGEAR,
  OUTFITS,
  parseGear,
  PROPS,
  serializeGear,
  type Gear,
  type HeadId,
  type OutfitId,
  type PropId,
} from "@/domain/gear";
import { BUILD_GOALS, type BuildGoalId } from "@/domain/onboarding";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import { haptic } from "@/services/haptics";
import { withPress } from "@/theme/press";
import { border, color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * Kit out your driver: the little car person on your profile button. Pick what you're into and they dress
 * for it; then swap any piece. "For you" marks what your interest suggests. Saved only when the server confirms.
 */
export default function DriverScreen() {
  const { status, profile, refreshProfile } = useAuth();
  const [goal, setGoal] = useState<BuildGoalId | null>(() => (profile?.build_goal as BuildGoalId | null) ?? null);
  const [gear, setGear] = useState<Gear>(() => parseGear(profile?.driver_gear, profile?.build_goal));
  const [saved, setSaved] = useState(false);
  const save = useAction(profileService.updateDriver);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );
  if (!profile) return <LoadingState label="Loading your driver" />;

  const suggested = goalGear(goal);
  const matchesGoal = serializeGear(gear, goal) === null;
  const change = (g: Gear) => {
    haptic.select();
    setSaved(false);
    setGear(g);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <DriverBadge gear={gear} size={132} bubble="below" />
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          Tap your driver to say hi.
        </Text>
      </View>

      <SectionHeader>What you&apos;re into</SectionHeader>
      <Text variant="caption" muted>
        Your driver dresses for it. It also tunes your &quot;For you&quot; builds in Discover.
      </Text>
      <View style={styles.wrap}>
        {BUILD_GOALS.map((g) => (
          <Chip
            key={g.id}
            label={g.label}
            selected={goal === g.id}
            onPress={() => {
              // still wearing the old interest's kit? re-dress for the new one; a custom kit stays
              const wasAuto = serializeGear(gear, goal) === null;
              setGoal(g.id);
              if (wasAuto) change(goalGear(g.id));
              else setSaved(false);
            }}
          />
        ))}
      </View>

      <Slot
        title="Headgear"
        items={HEADGEAR}
        current={gear.head}
        suggested={suggested.head}
        render={(id) => ({ ...gear, head: id as HeadId })}
        onPick={(id) => change({ ...gear, head: id as HeadId })}
      />
      <Slot
        title="Outfit"
        items={OUTFITS}
        current={gear.outfit}
        suggested={suggested.outfit}
        render={(id) => ({ ...gear, outfit: id as OutfitId })}
        onPick={(id) => change({ ...gear, outfit: id as OutfitId })}
      />
      <Slot
        title="In hand"
        items={PROPS}
        current={gear.prop}
        suggested={suggested.prop}
        render={(id) => ({ ...gear, prop: id as PropId })}
        onPick={(id) => change({ ...gear, prop: id as PropId })}
      />

      {save.error ? <InlineError kind={save.error.key} /> : null}
      {saved ? <InlineNotice title="Saved" /> : null}
      <Button
        title="Save driver"
        loading={save.busy}
        onPress={async () => {
          const r = await save.run({ build_goal: goal, driver_gear: serializeGear(gear, goal) });
          if (r?.ok) {
            haptic.success();
            setSaved(true);
            await refreshProfile();
          }
        }}
      />
      {matchesGoal ? null : (
        <Button title="Match my interest" variant="secondary" onPress={() => change(goalGear(goal))} />
      )}
    </Screen>
  );
}

function Slot({
  title,
  items,
  current,
  suggested,
  render,
  onPick,
}: {
  title: string;
  items: readonly { id: string; label: string }[];
  current: string;
  suggested: string;
  render: (id: string) => Gear;
  onPick: (id: string) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>{title}</SectionHeader>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {items.map((it) => {
          const on = it.id === current;
          const forYou = it.id === suggested;
          return (
            <Pressable
              key={it.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${it.label}${forYou ? ", suggested for your interest" : ""}`}
              onPress={() => onPick(it.id)}
              style={withPress([styles.tile, on && styles.tileOn])}
            >
              <View style={styles.tileArt}>
                <Driver gear={render(it.id)} size={60} />
              </View>
              <Text
                variant="caption"
                numberOfLines={2}
                style={{ color: on ? color.accent : color.text, textAlign: "center" }}
              >
                {it.label}
              </Text>
              {forYou ? (
                <View style={styles.forYou}>
                  <Text style={styles.forYouText}>FOR YOU</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    hero: { alignItems: "center", gap: space.sm, paddingVertical: space.sm },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    tile: {
      width: 100,
      alignItems: "center",
      gap: space.xxs,
      padding: space.xs,
      paddingBottom: space.sm,
      borderRadius: radius.md,
      backgroundColor: color.surface,
      borderWidth: border.hairline,
      borderColor: color.hairline,
    },
    tileOn: { borderColor: color.accent, borderWidth: border.regular },
    tileArt: {
      width: 64,
      height: 64,
      borderRadius: 32,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "flex-end",
      backgroundColor: color.background,
    },
    forYou: {
      position: "absolute",
      top: 4,
      right: 4,
      backgroundColor: color.accent,
      borderRadius: radius.sm,
      paddingHorizontal: 4,
      transform: [{ skewX: "-12deg" }],
    },
    forYouText: { fontSize: 9, lineHeight: 12, fontWeight: "800", color: color.onAccent, letterSpacing: 0.5 },
  }),
);
