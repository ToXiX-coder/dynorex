import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { dayText } from "@/domain/when";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { RadioIcon } from "@/components/icons";

type Choice = "private" | "public";

const OPTIONS: { id: Choice | "friends_only"; label: string; detail: string; available: boolean }[] = [
  { id: "private", label: "Private", detail: "Only you can see new vehicles and builds.", available: true },
  {
    id: "public",
    label: "Public",
    detail: "Anyone can see new vehicles and builds (never your VIN).",
    available: true,
  },
  {
    id: "friends_only",
    label: "Friends only",
    detail: "Not available yet: Dynorex doesn't have accepted friendships, and following isn't the same thing.",
    available: false,
  },
];

export default function PrivacySettings() {
  const { status, profile, refreshProfile } = useAuth();
  const [saved, setSaved] = useState(false);
  const [blocked, setBlocked] = useState<{ blocked_id: string; created_at: string }[] | null>(null);
  const save = useAction(profileService.setDefaultVisibility);
  const unblock = useAction(profileService.unblock);

  const loadBlocked = useCallback(async () => {
    const r = await profileService.listBlocked();
    setBlocked(r.ok ? r.data : []);
  }, []);

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    void profileService.listBlocked().then((r) => {
      if (alive) setBlocked(r.ok ? r.data : []);
    });
    return () => {
      alive = false;
    };
  }, [status]);

  if (status !== "signedIn" || !profile)
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );

  return (
    <Screen>
      <SectionHeader>Default visibility</SectionHeader>
      <Text variant="caption" muted>
        Applies to new vehicles and builds. You can change each one later. Going public needs a verified email.
      </Text>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {OPTIONS.map((o) => {
          const selected = profile.default_visibility === o.id;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !o.available }}
              accessibilityLabel={`${o.label}. ${o.detail}`}
              disabled={!o.available || save.busy}
              onPress={async () => {
                setSaved(false);
                const r = await save.run(o.id as Choice);
                if (r?.ok) {
                  setSaved(true);
                  await refreshProfile();
                }
              }}
              style={[styles.option, selected && styles.selected, !o.available && styles.unavailable]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <RadioIcon
                  on={selected}
                  color={selected ? color.accent : o.available ? color.text : color.disabledText}
                />
                <Text
                  variant="bodyStrong"
                  style={{ color: selected ? color.accent : o.available ? color.text : color.disabledText }}
                >
                  {o.label}
                </Text>
              </View>
              <Text variant="caption" muted>
                {o.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {save.error ? <InlineError kind={save.error.key} /> : null}
      {saved ? <InlineNotice title="Saved" /> : null}

      <SectionHeader>Blocked people</SectionHeader>
      <Text variant="caption" muted>
        Blocked accounts can&apos;t see your profile or builds, and you can&apos;t see theirs. They aren&apos;t told.
      </Text>
      {unblock.error ? <InlineError kind={unblock.error.key} /> : null}
      {blocked === null ? (
        <Text muted>Loading…</Text>
      ) : blocked.length === 0 ? (
        <Text muted>You haven&apos;t blocked anyone.</Text>
      ) : (
        blocked.map((b) => (
          <Card key={b.blocked_id} style={styles.row}>
            <Text style={{ flex: 1 }}>{`Blocked account · since ${dayText(b.created_at)}`}</Text>
            <Button
              title="Unblock"
              variant="secondary"
              onPress={async () => {
                const r = await unblock.run(b.blocked_id);
                if (r?.ok) await loadBlocked();
              }}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    option: {
      minHeight: touch.min,
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: border.regular,
      borderColor: color.surface,
      backgroundColor: color.surface,
      gap: space.xxs,
    },
    selected: { borderColor: color.accent },
    // not offered yet: a flat, quieter panel (the greyed text and "Not available yet" say why)
    unavailable: { borderColor: color.background, backgroundColor: color.background },
    row: { flexDirection: "row", alignItems: "center", gap: space.md },
  }),
);
