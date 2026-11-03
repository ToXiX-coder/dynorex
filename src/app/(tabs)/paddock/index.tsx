import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { InlineError } from "@/components/feedback/Inline";
import { LoadMore } from "@/components/feedback/LoadMore";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { formatEventTime, spotsLeft } from "@/domain/events";
import { useAuth } from "@/features/auth/AuthProvider";
import { communityService, type FeedMode } from "@/features/paddock/communityService";
import { eventService } from "@/features/paddock/eventService";
import { PostCard } from "@/features/paddock/PostCard";
import { ClubCrest } from "@/components/paddock/ClubCrest";
import { EventPoster } from "@/components/paddock/EventPoster";
import { EventsMap } from "@/components/paddock/EventsMap";
import { Appear } from "@/components/motion/Motion";
import { Shop } from "@/features/paddock/shop/ShopSection";
import { Services } from "@/features/paddock/services/ServicesSection";
import { usePaged } from "@/hooks/usePaged";
import { useFlags } from "@/providers/AppProviders";
import type { MyClub, PublicClub, PublicEvent, PublicPost } from "@/services/supabase/database.types";
import { space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";

type Section = "events" | "feed" | "clubs" | "shop" | "services";

/** Paddock hub: events and group drives, the community feed, clubs, and the Shop (parts marketplace, D-56). */
export default function Paddock() {
  const flags = useFlags();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(
    (params.section === "shop" || params.section === "services") && flags.marketplace ? params.section : "events",
  );
  const [refreshKey, setRefreshKey] = useState(0);
  if (!flags.paddock) {
    return <ComingSoon title="Paddock" lines={["Car meets and events", "Clubs and forums", "A parts shop"]} />;
  }
  return (
    <Screen onRefresh={() => setRefreshKey((n) => n + 1)}>
      {/* one row that scrolls sideways, so no section ends up alone on a second line */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={{ gap: space.xs }}
      >
        {(
          [
            ["events", "Events"],
            ["feed", "Feed"],
            ["clubs", "Clubs"],
            ...(flags.marketplace
              ? ([
                  ["shop", "Shop"],
                  ["services", "Services"],
                ] as const)
              : []),
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} selected={section === id} onPress={() => setSection(id)} />
        ))}
      </ScrollView>
      {section === "events" ? (
        <Events refreshKey={refreshKey} />
      ) : section === "feed" ? (
        <Feed refreshKey={refreshKey} />
      ) : section === "shop" ? (
        <Shop refreshKey={refreshKey} />
      ) : section === "services" ? (
        <Services refreshKey={refreshKey} />
      ) : (
        <Clubs refreshKey={refreshKey} />
      )}
    </Screen>
  );
}

function Events({ refreshKey }: { refreshKey: number }) {
  const { status } = useAuth();
  // refreshKey: pull-to-refresh makes a new fetcher, which reloads page 0
  const fetch = useCallback((p: number) => (void refreshKey, eventService.upcoming(p)), [refreshKey]);
  const { items: events, error, reload, hasMore, loadingMore, loadMore } = usePaged<PublicEvent>(fetch, eventKey);
  const [view, setView] = useState<"list" | "map">("list");
  const onMap = (events ?? []).filter((e) => e.place_lat !== null && e.place_lng !== null).slice(0, 9);
  return (
    <>
      {status === "signedIn" ? (
        <Button title="Create an event" onPress={() => router.push("/paddock/new")} />
      ) : (
        <Text muted>Sign in to RSVP or host a meet.</Text>
      )}
      <Text variant="caption" muted>
        To plan a group drive, open a shared route in Line and tap &quot;Plan a group drive&quot;.
      </Text>
      <SectionHeader>Upcoming</SectionHeader>
      <View style={{ flexDirection: "row", gap: space.xs }} accessibilityRole="tablist">
        <Chip label="List" selected={view === "list"} onPress={() => setView("list")} />
        <Chip label="Map" selected={view === "map"} onPress={() => setView("map")} />
      </View>
      {view === "map" ? (
        onMap.length ? (
          <>
            <EventsMap
              pins={onMap.map((e) => ({ lat: e.place_lat!, lng: e.place_lng! }))}
              label={`Map of ${onMap.length} upcoming events. The numbered list below matches the pins.`}
            />
            {onMap.map((e, i) => (
              <Pressable
                key={e.event_id}
                accessibilityRole="link"
                accessibilityLabel={`Pin ${i + 1}: ${e.title}, ${formatEventTime(e.starts_at, e.ends_at)}, ${e.location_text}`}
                onPress={() => router.push(`/events/${e.event_id}`)}
                style={withPress({ minHeight: touch.min, justifyContent: "center" })}
              >
                <Text>
                  <Text accent>{`${i + 1}  `}</Text>
                  {`${e.title} · ${formatEventTime(e.starts_at, e.ends_at)}`}
                </Text>
              </Pressable>
            ))}
            <Text variant="caption" muted>
              Events show on the map when the host picked a place from the suggestions.
            </Text>
          </>
        ) : (
          <Text muted>None of these events have a map spot yet.</Text>
        )
      ) : null}
      {error ? <InlineError kind={error.key} onAction={reload} /> : null}
      {events === null && !error ? <LoadingState label="Loading events" /> : null}
      {events && events.length === 0 ? (
        <EmptyState message="No events yet" detail="Host the first meet in your area." />
      ) : null}
      {(view === "map" ? [] : (events ?? [])).map((e, i) => {
        const left = spotsLeft(e);
        const kind = e.kind === "drive" ? "Group drive" : "Meet";
        return (
          <Appear key={e.event_id} index={i}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${kind}: ${e.title}, ${formatEventTime(e.starts_at, e.ends_at)}, ${e.location_text}, ${e.going_count} going`}
              onPress={() => router.push(`/events/${e.event_id}`)}
              style={withPress({ minHeight: touch.min })}
            >
              <Card style={{ padding: space.sm }}>
                <EventPoster startsAt={e.starts_at} kind={e.kind} />
                <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs, gap: space.xxs }}>
                  <Text variant="title">{e.title}</Text>
                  <Text variant="caption" muted>{`${e.location_text} · hosted by @${e.organizer_username}`}</Text>
                  <Text variant="caption">
                    {`${e.going_count} going${left === null ? "" : left === 0 ? " · Full" : ` · ${left} spots left`}`}
                  </Text>
                </View>
              </Card>
            </Pressable>
          </Appear>
        );
      })}
      <LoadMore hasMore={hasMore} loading={loadingMore} onPress={() => void loadMore()} />
    </>
  );
}

function Feed({ refreshKey }: { refreshKey: number }) {
  const { status } = useAuth();
  const signed = status === "signedIn";
  const [mode, setMode] = useState<FeedMode>(signed ? "following" : "all");
  const [liked, setLiked] = useState<string[]>([]);
  const fetch = useCallback((p: number) => (void refreshKey, communityService.feed(mode, p)), [mode, refreshKey]);
  const { items: posts, error, reload, hasMore, loadingMore, loadMore } = usePaged<PublicPost>(fetch, postKey);
  useEffect(() => {
    if (!signed || !posts?.length) return;
    let alive = true;
    void communityService.myLikes(posts.map((p) => p.post_id)).then((r) => alive && r.ok && setLiked(r.data));
    return () => {
      alive = false;
    };
  }, [posts, signed]);
  return (
    <>
      {signed ? (
        <Button title="New post" onPress={() => router.push("/paddock/post")} />
      ) : (
        <Text muted>Sign in to post, comment and like.</Text>
      )}
      {signed ? (
        <View style={{ flexDirection: "row", gap: space.xs }}>
          <Chip label="Following" selected={mode === "following"} onPress={() => setMode("following")} />
          <Chip label="Everyone" selected={mode === "all"} onPress={() => setMode("all")} />
        </View>
      ) : null}
      {error ? <InlineError kind={error.key} onAction={reload} /> : null}
      {posts === null && !error ? <LoadingState label="Loading posts" /> : null}
      {posts && posts.length === 0 ? (
        <EmptyState
          message="Nothing here yet"
          detail={mode === "following" ? "Follow people or join a club to fill your feed." : "Be the first to post."}
        />
      ) : null}
      {(posts ?? []).map((p) => (
        <PostCard key={p.post_id} post={p} liked={liked.includes(p.post_id)} canLike={signed} onChanged={reload} />
      ))}
      <LoadMore hasMore={hasMore} loading={loadingMore} onPress={() => void loadMore()} />
    </>
  );
}

function Clubs({ refreshKey }: { refreshKey: number }) {
  const { status } = useAuth();
  const signed = status === "signedIn";
  const [mine, setMine] = useState<MyClub[]>([]);
  const fetch = useCallback((p: number) => (void refreshKey, communityService.clubs(p)), [refreshKey]);
  const { items: all, error, reload, hasMore, loadingMore, loadMore } = usePaged<PublicClub>(fetch, clubKey);
  useFocusEffect(
    useCallback(() => {
      if (signed) void communityService.myClubs().then((r) => r.ok && setMine(r.data));
    }, [signed]),
  );
  const mineIds = new Set(mine.map((c) => c.club_id));
  const others = (all ?? []).filter((c) => !mineIds.has(c.club_id));
  const row = (id: string, name: string, detail: string) => (
    <Pressable
      key={id}
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${detail}`}
      onPress={() => router.push(`/clubs/${id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <ClubCrest name={name} size={48} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="title">{name}</Text>
          <Text variant="caption" muted>
            {detail}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
  return (
    <>
      {signed ? (
        <Button title="Start a club" onPress={() => router.push("/paddock/club-new")} />
      ) : (
        <Text muted>Sign in to join or start a club.</Text>
      )}
      {error ? <InlineError kind={error.key} onAction={reload} /> : null}
      {all === null && !error ? <LoadingState label="Loading clubs" /> : null}
      {mine.length ? (
        <>
          <SectionHeader>Your clubs</SectionHeader>
          {mine.map((c) =>
            row(
              c.club_id,
              c.name,
              `${c.members_count} member${c.members_count === 1 ? "" : "s"}${c.role === "owner" ? " · you run it" : ""}`,
            ),
          )}
        </>
      ) : null}
      {all ? (
        <>
          <SectionHeader>Discover clubs</SectionHeader>
          {others.length === 0 && !hasMore ? (
            <EmptyState message="No other clubs yet" detail="Start one for your crew." />
          ) : null}
          {others.map((c) =>
            row(
              c.club_id,
              c.name,
              `${c.members_count} member${c.members_count === 1 ? "" : "s"} · ${c.visibility === "private" ? "invite-only · " : ""}started by @${c.owner_username}`,
            ),
          )}
          <LoadMore hasMore={hasMore} loading={loadingMore} onPress={() => void loadMore()} />
        </>
      ) : null}
    </>
  );
}

const eventKey = (e: PublicEvent) => e.event_id;
const postKey = (p: PublicPost) => p.post_id;
const clubKey = (c: PublicClub) => c.club_id;
