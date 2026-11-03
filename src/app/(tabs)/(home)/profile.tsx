import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { ChevronIcon } from "@/components/icons";
import { Text } from "@/components/Text";
import { Badges } from "@/components/social/Badges";
import { DriverBadge } from "@/components/social/DriverBadge";
import { parseGear } from "@/domain/gear";
import { BUILD_GOALS } from "@/domain/onboarding";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { PlusBadge } from "@/components/social/PlusBadge";
import { subscriptionService } from "@/features/plus/subscriptionService";
import { profileService } from "@/features/profiles/profileService";
import { withPress } from "@/theme/press";
import { color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/** Your own profile. Reputation is calculated on the server; nobody can edit it. */
export default function MyProfile() {
  const { status, profile } = useAuth();
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);

  useEffect(() => {
    if (status !== "signedIn") return;
    void profileService.myFollowCounts().then((r) => r.ok && setCounts(r.data));
  }, [status]);

  // Dynorex+ badge: whatever the server says right now (re-checked when you come back from the paywall)
  const [plus, setPlus] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (status !== "signedIn") return;
      let alive = true;
      void subscriptionService.mySubscription().then((r) => alive && r.ok && setPlus(r.data.plus));
      return () => {
        alive = false;
      };
    }, [status]),
  );

  if (status !== "signedIn") {
    return (
      <Screen>
        <SignInPrompt message="Sign in to see your profile" />
      </Screen>
    );
  }
  if (!profile) return <LoadingState label="Loading your profile" />;

  const goal = BUILD_GOALS.find((g) => g.id === profile.build_goal);
  const details = [
    profile.general_location,
    profile.years_experience === null ? null : `${profile.years_experience} years wrenching`,
  ].filter(Boolean);

  return (
    <Screen>
      <View style={styles.header}>
        <DriverBadge gear={parseGear(profile.driver_gear, profile.build_goal)} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="display" numberOfLines={2} style={{ fontSize: 20, lineHeight: 26 }}>
            {profile.display_name || `@${profile.username}`}
          </Text>
          {profile.display_name ? <Text muted>@{profile.username}</Text> : null}
          <View style={styles.tags}>
            {plus ? <PlusBadge /> : null}
            {goal ? (
              <View style={styles.tag}>
                <Text variant="caption">{`Goal: ${goal.label}`}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {profile.bio ? <Text>{profile.bio}</Text> : null}
      {profile.username ? <Badges username={profile.username} /> : null}
      {details.length ? (
        <Text variant="caption" muted>
          {details.join(" · ")}
        </Text>
      ) : null}

      <Card style={styles.stats}>
        <Stat
          value={counts ? String(counts.followers) : "…"}
          label="Followers"
          onPress={() => router.push("/following?tab=followers")}
        />
        <View style={styles.divider} />
        <Stat
          value={counts ? String(counts.following) : "…"}
          label="Following"
          onPress={() => router.push("/following")}
        />
        <View style={styles.divider} />
        <View
          style={styles.stat}
          accessible
          accessibilityLabel={`Reputation ${profile.reputation}, calculated by Dynorex`}
        >
          <Text variant="title">{String(profile.reputation)}</Text>
          <Text variant="caption" muted>
            Reputation
          </Text>
        </View>
      </Card>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button title="Edit profile" fullWidth onPress={() => router.push("/profile-edit")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Settings" variant="secondary" fullWidth onPress={() => router.push("/settings")} />
        </View>
      </View>

      <Card style={{ padding: 0, gap: 0 }}>
        <MenuRow title="Kit out your driver" detail="Helmet, jacket, gear for your kind of build" href="/driver" />
        <MenuRow title="Your garage" href="/garage" />
        <MenuRow title="Your year in the garage" detail="A card of what you got done, to share" href="/wrapped" />
        <MenuRow title="Saved" detail="Builds, events, drives, posts, parts and shops you saved" href="/saved" />
        <MenuRow title="Tools" detail="Tire size, wheel offset, gearing and more" href="/tools" />
        {profile.username ? (
          <MenuRow title="Your public profile" detail="What other people see" href={`/u/${profile.username}`} />
        ) : null}
        <MenuRow
          title={plus ? "Dynorex+" : "Get Dynorex+"}
          detail={plus ? "Manage your membership" : "Unlimited builds, advanced stats, all Torq stickers"}
          href={plus ? "/settings/subscription" : "/plus?source=profile"}
          accent={!plus}
          last
        />
      </Card>
    </Screen>
  );
}

function Stat({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label.toLowerCase()}`}
      onPress={onPress}
      style={withPress(styles.stat)}
    >
      <Text variant="title">{value}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </Pressable>
  );
}

function MenuRow({
  title,
  detail,
  href,
  accent,
  last,
}: {
  title: string;
  detail?: string;
  href: Href;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={() => router.push(href)}
      style={withPress([styles.menuRow, !last && styles.menuDivider])}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" accent={accent}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronIcon color={accent ? color.accent : color.textMuted} />
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: space.md },
    tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: space.xxs },
    tag: {
      alignSelf: "flex-start",
      backgroundColor: color.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 2,
    },
    stats: { flexDirection: "row", alignItems: "center", paddingVertical: space.md },
    stat: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xxs, minHeight: touch.min },
    divider: { width: 1, alignSelf: "stretch", backgroundColor: color.hairline },
    actions: { flexDirection: "row", gap: space.sm },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      minHeight: 56,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    menuDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  }),
);
