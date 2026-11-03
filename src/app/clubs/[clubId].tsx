import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ActionSheet, type SheetAction } from "@/components/feedback/ActionSheet";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { isUuid, shareUrl, userPath } from "@/domain/deepLinks";
import { formatEventTime } from "@/domain/events";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { communityService } from "@/features/paddock/communityService";
import { PostCard } from "@/features/paddock/PostCard";
import { ClubCrest } from "@/components/paddock/ClubCrest";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { useGoToSignIn } from "@/features/social/FollowButton";
import { useFlags } from "@/providers/AppProviders";
import { BuildCard } from "@/components/social/BuildCard";
import type {
  ClubMember,
  ClubStatus,
  PublicBuild,
  PublicClub,
  PublicEvent,
  PublicPost,
} from "@/services/supabase/database.types";
import { color, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { backOr } from "@/components/navigation/stackOptions";

type Loaded = {
  club: PublicClub | null;
  posts: PublicPost[];
  events: PublicEvent[];
  status: ClubStatus;
  liked: string[];
  members: ClubMember[];
  requests: { username: string; created_at: string }[];
  builds: PublicBuild[];
};

/**
 * dynorex.app/clubs/:clubId. Public clubs: anyone reads posts, and joining is instant. Private (invite-only)
 * clubs: listed with their name, but posts, members and chat are for members, and the owner or a moderator
 * approves join requests. Owners promote moderators; staff remove members and posts. Club events stay public.
 */
export default function ClubScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const id = String(clubId ?? "");
  const { status: auth } = useAuth();
  const flags = useFlags();
  const goToSignIn = useGoToSignIn();
  const signed = auth === "signedIn";
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberMenu, setMemberMenu] = useState<ClubMember | null>(null);
  const [reload, setReload] = useState(0);

  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    if (!isUuid(id)) return null;
    const [c, p, e, s, b] = await Promise.all([
      communityService.club(id),
      communityService.clubPosts(id, 0),
      communityService.clubEvents(id),
      signed ? communityService.clubStatus(id) : Promise.resolve(null),
      communityService.clubBuilds(id),
    ]);
    const status: ClubStatus = s && s.ok ? s.data : "none";
    const inClub = status === "owner" || status === "moderator" || status === "member";
    const staff = status === "owner" || status === "moderator";
    const postList = p.ok ? p.data : [];
    const [l, m, r] = await Promise.all([
      signed && postList.length ? communityService.myLikes(postList.map((x) => x.post_id)) : Promise.resolve(null),
      inClub ? communityService.members(id) : Promise.resolve(null),
      staff ? communityService.joinRequests(id) : Promise.resolve(null),
    ]);
    return {
      club: c.ok ? c.data : null,
      posts: postList,
      events: e.ok ? e.data : [],
      status,
      liked: l && l.ok ? l.data : [],
      members: m && m.ok ? m.data : [],
      requests: r && r.ok ? r.data : [],
      builds: b.ok ? b.data : [],
    };
  }, [id, signed]);

  useEffect(() => {
    let alive = true;
    void fetchAll().then((s) => alive && setData(s));
    return () => {
      alive = false;
    };
  }, [fetchAll, reload]);

  if (data === undefined) return <LoadingState label="Loading club" />;
  if (data === null || data.club === null)
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => backOr()} />
      </Screen>
    );

  const { club, status } = data;
  const owner = status === "owner";
  const staff = owner || status === "moderator";
  const inClub = staff || status === "member";
  const isPrivate = club.visibility === "private";
  const refresh = () => setReload((n) => n + 1);
  const act = async (fn: () => Promise<{ ok: true } | { ok: false; error: MappedError }>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (done) setNotice(done);
    refresh();
  };

  const memberActions: SheetAction[] = memberMenu
    ? [
        { label: "View profile", onPress: () => router.push(userPath(memberMenu.username)) },
        ...(owner && memberMenu.role === "member"
          ? [
              {
                label: "Make moderator",
                hint: "Can approve requests and remove members and posts.",
                onPress: () => void act(() => communityService.setMemberRole(id, memberMenu.username, "moderator")),
              },
            ]
          : []),
        ...(owner && memberMenu.role === "moderator"
          ? [
              {
                label: "Remove moderator role",
                onPress: () => void act(() => communityService.setMemberRole(id, memberMenu.username, "member")),
              },
            ]
          : []),
        ...((owner && memberMenu.role !== "owner") || (status === "moderator" && memberMenu.role === "member")
          ? [
              {
                label: "Remove from club",
                destructive: true,
                onPress: () => void act(() => communityService.removeMember(id, memberMenu.username)),
              },
            ]
          : []),
      ]
    : [];

  return (
    <Screen onRefresh={refresh}>
      <ScreenMenu
        title={club.name}
        label="Club options"
        actions={[
          ...(owner
            ? [
                {
                  label: isPrivate ? "Make club public" : "Make club invite-only",
                  hint: isPrivate
                    ? "Anyone can join and read posts."
                    : "New members need approval; posts become members-only.",
                  onPress: () =>
                    void act(() => communityService.setClubVisibility(id, isPrivate ? "public" : "private")),
                },
              ]
            : []),
          ...(inClub && !owner
            ? [{ label: "Leave club", onPress: () => void act(() => communityService.leaveClub(id)) }]
            : []),
          ...(owner ? [{ label: "Delete club", destructive: true, onPress: () => setConfirmDelete(true) }] : []),
          ...(signed && !owner
            ? [{ label: "Report this club", hint: "Tell Dynorex about a problem.", onPress: () => setReporting(true) }]
            : []),
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <ClubCrest name={club.name} size={84} />
        <Text variant="display" style={{ flex: 1 }}>
          {club.name}
        </Text>
      </View>
      <Text variant="caption">
        {`${club.members_count} member${club.members_count === 1 ? "" : "s"} · ${isPrivate ? "invite-only · " : ""}started by @${club.owner_username}${
          staff ? ` · you're ${owner ? "the owner" : "a moderator"}` : ""
        }`}
      </Text>
      {club.description ? <Text>{club.description}</Text> : null}
      {error ? <InlineError kind={error.key} /> : null}
      {notice ? <InlineNotice title={notice} /> : null}

      {!signed ? (
        <Button
          title={isPrivate ? "Sign in to ask to join" : "Sign in to join"}
          variant="secondary"
          onPress={goToSignIn}
        />
      ) : status === "none" ? (
        <Button
          title={isPrivate ? "Ask to join" : "Join club"}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            const r = await communityService.joinClub(id);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            // a request shows as the "Request sent" card below once the status refreshes
            refresh();
          }}
        />
      ) : status === "requested" ? (
        <InlineNotice title="Request sent" body="A club owner or moderator will let you in.">
          <Button
            title="Cancel request"
            variant="secondary"
            disabled={busy}
            onPress={() => void act(() => communityService.cancelJoinRequest(id))}
          />
        </InlineNotice>
      ) : (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            title="Club chat"
            onPress={() =>
              router.push({ pathname: "/chat/[type]/[roomId]", params: { type: "club", roomId: id, title: club.name } })
            }
          />
          <Button
            title="Post"
            variant="secondary"
            onPress={() => router.push({ pathname: "/paddock/post", params: { clubId: id } })}
          />
          <Button
            title="Invite your crew"
            variant="secondary"
            onPress={async () => {
              // the club's own page: a public club opens to Join, an invite-only one to Ask to join
              const url = shareUrl(`/clubs/${id}`);
              try {
                await Share.share({ message: `Join ${club.name} on Dynorex: ${url}`, url, title: club.name });
              } catch {
                setNotice(`Copy the invite link: ${url}`);
              }
            }}
          />
          {flags.paddock ? (
            <Button
              title="Host an event"
              variant="secondary"
              onPress={() => router.push({ pathname: "/paddock/new", params: { clubId: id } })}
            />
          ) : null}
        </View>
      )}

      {staff && data.requests.length ? (
        <>
          <SectionHeader>{`Join requests (${data.requests.length})`}</SectionHeader>
          {data.requests.map((r) => (
            <Card key={r.username} style={{ gap: space.xs }}>
              <Text variant="bodyStrong">{`@${r.username}`}</Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button
                  title="Let in"
                  disabled={busy}
                  onPress={() => void act(() => communityService.answerJoinRequest(id, r.username, true))}
                />
                <Button
                  title="Decline"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void act(() => communityService.answerJoinRequest(id, r.username, false))}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {data.events.length || inClub ? (
        <>
          <SectionHeader>Club calendar</SectionHeader>
          {inClub ? (
            <>
              <Text variant="caption" muted>
                {data.events.length
                  ? "Members get a heads-up when a new meet is posted here. Use Host an event to add one."
                  : "No meets planned yet. Use Host an event and members get a heads-up."}
              </Text>
            </>
          ) : null}
          {data.events.map((e) => (
            <Pressable
              key={e.event_id}
              accessibilityRole="link"
              accessibilityLabel={`${e.kind === "drive" ? "Group drive" : "Meet"}: ${e.title}, ${formatEventTime(e.starts_at, e.ends_at)}`}
              onPress={() => router.push(`/events/${e.event_id}`)}
              style={withPress({ minHeight: touch.min })}
            >
              <Card>
                <Text variant="title">{e.title}</Text>
                <Text variant="caption">{formatEventTime(e.starts_at, e.ends_at)}</Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      {data.builds.length ? (
        <>
          <SectionHeader>Members&apos; builds</SectionHeader>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {data.builds.map((b) => (
              <View key={b.build_id} style={{ width: 260 }}>
                <BuildCard build={b} compact />
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHeader>Posts</SectionHeader>
      {isPrivate && !inClub ? (
        <Text muted>Posts in this club are for members.</Text>
      ) : data.posts.length === 0 ? (
        <Text muted>No posts yet.</Text>
      ) : null}
      {data.posts.map((p) => (
        <View key={p.post_id} style={{ gap: space.xxs }}>
          <PostCard post={p} liked={data.liked.includes(p.post_id)} canLike={signed} onChanged={refresh} />
          {staff && p.author_username !== club.owner_username ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Take down this post by @${p.author_username}`}
              onPress={() => void act(() => communityService.removeClubPost(p.post_id), "Post taken down")}
              style={{ alignSelf: "flex-end", minHeight: touch.min, justifyContent: "center" }}
            >
              <Text variant="caption" style={{ color: color.textMuted }}>
                Take down
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {inClub && data.members.length ? (
        <>
          <SectionHeader>{`Members (${data.members.length})`}</SectionHeader>
          {data.members.map((m) => (
            <Pressable
              key={m.username}
              accessibilityRole="button"
              accessibilityLabel={`@${m.username}, ${m.role}. Options`}
              onPress={() => setMemberMenu(m)}
              style={withPress({ minHeight: touch.min, justifyContent: "center" })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text>{`@${m.username}`}</Text>
                <Text variant="caption" style={m.role === "member" ? undefined : { color: color.accent }}>
                  {m.role === "owner" ? "Owner" : m.role === "moderator" ? "Moderator" : "Member"}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      <ActionSheet
        visible={memberMenu !== null}
        title={memberMenu ? `@${memberMenu.username}` : ""}
        actions={memberActions}
        onClose={() => setMemberMenu(null)}
      />
      <ReportSheet visible={reporting} target={{ type: "club", id }} onClose={() => setReporting(false)} />
      <ConfirmModal
        visible={confirmDelete}
        kind="deleteClub"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const r = await communityService.deleteClub(id);
          if (!r.ok) return setError(r.error);
          router.replace("/paddock");
        }}
      />
    </Screen>
  );
}
