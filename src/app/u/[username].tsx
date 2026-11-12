import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { IconButton } from "@/components/buttons/IconButton";
import { ActionSheet } from "@/components/feedback/ActionSheet";
import { MoreIcon } from "@/components/icons";
import { DriverBadge } from "@/components/social/DriverBadge";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { GetAppBanner } from "@/components/feedback/GetAppBanner";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { Badges } from "@/components/social/Badges";
import { ERROR_COPY } from "@/domain/copy/errors";
import { parseGear } from "@/domain/gear";
import { BUILD_GOALS } from "@/domain/onboarding";
import { useAuth } from "@/features/auth/AuthProvider";
import { profileService, type PublicProfile } from "@/features/profiles/profileService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { BuildCard } from "@/components/social/BuildCard";
import { PlusBadge } from "@/components/social/PlusBadge";
import { FollowButton } from "@/features/social/FollowButton";
import { socialService } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import type { PublicBuild } from "@/services/supabase/database.types";
import { useAction } from "@/hooks/useAction";
import { color, space } from "@/theme/tokens";
import { backOr } from "@/components/navigation/stackOptions";
import { PageMeta } from "@/components/seo/PageMeta";
import { metaDescription } from "@/domain/seo";

/**
 * dynorex.app/u/:username. Reads only the public_profiles and public_builds views, which already hide
 * blocked, unnamed, hidden and deleted accounts. "Not found" looks identical for all of those, so nothing
 * leaks. Viewable without an account.
 */
export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { status, user } = useAuth();
  const [state, setState] = useState<"loading" | "missing" | "error" | PublicProfile>("loading");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedDone, setBlockedDone] = useState(false);
  const [reload, setReload] = useState(0);
  const [menu, setMenu] = useState(false);
  const [builds, setBuilds] = useState<PublicBuild[]>([]);
  const block = useAction(profileService.block);
  const mute = useAction(profileService.mute);

  useEffect(() => {
    let alive = true;
    void profileService.getPublic(String(username ?? "")).then((r) => {
      if (!alive) return;
      if (!r.ok) return setState(r.error.key === "notConnected" ? "missing" : "error");
      setState(r.data ?? "missing");
    });
    void socialService.publicBuildsBy(String(username ?? "").toLowerCase()).then((r) => {
      if (alive && r.ok) setBuilds(r.data);
    });
    return () => {
      alive = false;
    };
  }, [username, reload]);

  const media = usePublicMedia(builds.filter((b) => b.has_hero).map((b) => b.vehicle_id));

  if (state === "loading") return <LoadingState label="Loading profile" />;
  if (state === "missing")
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => backOr()} />
      </Screen>
    );
  if (state === "error")
    return (
      <Screen>
        <ErrorState
          kind="server"
          onAction={() => {
            setState("loading");
            setReload((n) => n + 1);
          }}
        />
      </Screen>
    );

  const p = state;
  const isMe = user?.id === p.user_id;
  const canAct = status === "signedIn" && !isMe && !blockedDone;
  const goal = BUILD_GOALS.find((g) => g.id === p.build_goal);

  return (
    <Screen>
      <PageMeta
        title={p.display_name ? `${p.display_name} (@${p.username})` : `@${p.username}`}
        description={metaDescription(`@${p.username}'s garage and builds on Dynorex.`, p.bio)}
      />
      <Stack.Screen options={{ title: `@${p.username}` }} />
      <View style={styles.header}>
        <DriverBadge gear={parseGear(p.driver_gear, p.build_goal)} size={72} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="heading" numberOfLines={2}>
            {p.display_name || `@${p.username}`}
          </Text>
          {p.display_name ? <Text muted>@{p.username}</Text> : null}
          {p.plus_member ? <PlusBadge /> : null}
        </View>
      </View>
      <View style={styles.stats}>
        <Stat value={Number(p.followers_count)} label={Number(p.followers_count) === 1 ? "follower" : "followers"} />
        <Stat value={Number(p.following_count)} label="following" />
        <Stat value={builds.length} label={builds.length === 1 ? "build" : "builds"} />
        <Stat value={p.reputation} label="reputation" />
      </View>
      {p.bio ? <Text>{p.bio}</Text> : null}
      <Badges username={p.username} />
      {goal || p.general_location ? (
        <Text variant="caption" muted>
          {[goal ? `Goal: ${goal.label}` : null, p.general_location].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      {p.business_badge ? <Text variant="caption">Business account (granted by Dynorex staff)</Text> : null}
      <GetAppBanner />
      {!isMe && !blockedDone ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <FollowButton target={{ kind: "user", userId: p.user_id }} label={`@${p.username}`} />
          </View>
          {canAct ? (
            <IconButton label={`More options for @${p.username}`} onPress={() => setMenu(true)}>
              <MoreIcon color={color.text} />
            </IconButton>
          ) : null}
        </View>
      ) : null}
      {notice ? <InlineNotice title={notice} /> : null}
      {blockedDone ? (
        <>
          <InlineNotice headsUp title={ERROR_COPY.blocked.title} body={ERROR_COPY.blocked.body} />
          <Button title="Go Back" onPress={() => backOr()} />
        </>
      ) : null}
      {block.error ? <InlineError kind={block.error.key} /> : null}
      {mute.error ? <InlineError kind={mute.error.key} /> : null}
      <ActionSheet
        visible={menu}
        title={`@${p.username}`}
        onClose={() => setMenu(false)}
        actions={[
          {
            label: "Mute",
            hint: "Hides their content from you. They aren't told.",
            onPress: async () => {
              const r = await mute.run(p.user_id);
              if (r?.ok) setNotice("Muted. You won't see their content.");
            },
          },
          { label: "Report", hint: "Tell Dynorex about a problem.", onPress: () => setReporting(true) },
          {
            label: "Block",
            hint: "Neither of you can see or follow the other.",
            destructive: true,
            onPress: () => setConfirmBlock(true),
          },
        ]}
      />
      <ConfirmModal
        visible={confirmBlock}
        kind="confirmBlock"
        busy={block.busy}
        onCancel={() => setConfirmBlock(false)}
        onConfirm={async () => {
          const r = await block.run(p.user_id);
          setConfirmBlock(false);
          if (r?.ok) setBlockedDone(true);
        }}
      />
      <SectionHeader>Builds</SectionHeader>
      {builds.length === 0 ? (
        <Text muted>No public builds yet.</Text>
      ) : (
        builds.map((b) => <BuildCard key={b.build_id} build={b} heroUrl={media.heroes[b.vehicle_id]} />)
      )}
      <ReportSheet visible={reporting} target={{ type: "user", id: p.user_id }} onClose={() => setReporting(false)} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="title">{String(value)}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  stats: { flexDirection: "row", paddingVertical: space.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
