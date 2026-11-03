import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { InlineError } from "@/components/feedback/Inline";
import { LoadMore } from "@/components/feedback/LoadMore";
import { EmptyState } from "@/components/feedback/States";
import { RouteTrace } from "@/components/line/RouteTrace";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { formatDistance, formatDuration } from "@/domain/routes";
import { useAuth } from "@/features/auth/AuthProvider";
import { lineService, type MyRoute, type RouteMode } from "@/features/line/lineService";
import { PendingDrives } from "@/features/line/PendingDrivesCard";
import { usePaged } from "@/hooks/usePaged";
import { useFlags } from "@/providers/AppProviders";
import type { PublicRoute } from "@/services/supabase/database.types";
import { space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";

/** Line hub: record a drive, your drives, and public routes (top rated, new, near you). */
export default function Line() {
  const flags = useFlags();
  if (!flags.line) {
    return (
      <ComingSoon
        title="Line"
        lines={["Record and share drives", "Discover routes rated by owners", "Plan group drives"]}
      />
    );
  }
  return <LineHub />;
}

function LineHub() {
  const { status, user } = useAuth();
  const signed = status === "signedIn";
  const [mode, setMode] = useState<RouteMode>("top");
  const [usage, setUsage] = useState<{ used: number; monthly_limit: number | null } | null>(null);

  const fetchRoutes = useCallback((p: number) => lineService.discover(mode, p), [mode]);
  const routes = usePaged<PublicRoute>(fetchRoutes, routeKey);
  const fetchMine = useCallback(
    (p: number) => (signed ? lineService.myRoutes(p) : Promise.resolve({ ok: true as const, data: [] as MyRoute[] })),
    [signed],
  );
  const mine = usePaged<MyRoute>(fetchMine, myKey);
  const refreshUsage = useCallback(() => {
    if (signed) void lineService.usage().then((r) => r.ok && setUsage(r.data));
  }, [signed]);
  useFocusEffect(refreshUsage);
  const { reload: reloadMine } = mine;
  const onUploaded = useCallback(() => {
    reloadMine();
    refreshUsage();
  }, [reloadMine, refreshUsage]);

  return (
    <Screen
      onRefresh={() => {
        routes.reload();
        mine.reload();
        refreshUsage();
      }}
    >
      {signed ? (
        <Card featured>
          <Text variant="section">Record a drive</Text>
          <Text muted>Private until you share it. Shared drives hide where you start and stop.</Text>
          {usage && usage.monthly_limit !== null ? (
            <Text variant="caption">
              {`${usage.used} of ${usage.monthly_limit} drives this month (Free, deleted drives count)`}
            </Text>
          ) : null}
          <Button title="Start" onPress={() => router.push("/line/record")} />
        </Card>
      ) : (
        <Text muted>Sign in to record your own drives.</Text>
      )}

      {signed && user ? <PendingDrives userId={user.id} onUploaded={onUploaded} /> : null}

      {mine.items?.length ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader>Your drives</SectionHeader>
          {mine.items.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="link"
              accessibilityLabel={`${r.title}, ${formatDistance(r.distance_m)}, ${r.visibility === "public" ? "shared" : "private"}`}
              onPress={() => router.push(`/route/${r.id}`)}
              style={withPress({ minHeight: touch.min })}
            >
              <Card>
                <Text variant="title">{r.title}</Text>
                <Text variant="caption" muted>
                  {`${formatDistance(r.distance_m)} · ${formatDuration(r.duration_s)} · ${r.visibility === "public" ? "Shared" : "Private"}`}
                </Text>
              </Card>
            </Pressable>
          ))}
          <LoadMore
            hasMore={mine.hasMore}
            loading={mine.loadingMore}
            onPress={() => void mine.loadMore()}
            label="More of your drives"
          />
        </View>
      ) : null}

      <SectionHeader>Routes</SectionHeader>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        {(
          [
            ["top", "Top rated"],
            ["new", "New"],
            ["nearby", "Near me"],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} selected={mode === id} onPress={() => setMode(id)} />
        ))}
      </View>
      {routes.error ? <InlineError kind={routes.error.key} onAction={routes.reload} /> : null}
      {routes.items && routes.items.length === 0 ? (
        <EmptyState
          message={mode === "nearby" ? "Nothing near you yet" : "No shared routes yet"}
          detail={
            mode === "nearby" ? "Turn on Nearby in Discover to see routes around you." : "Record a drive and share it."
          }
        />
      ) : null}
      {(routes.items ?? []).map((r) => (
        <RouteCard key={r.route_id} r={r} />
      ))}
      <LoadMore hasMore={routes.hasMore} loading={routes.loadingMore} onPress={() => void routes.loadMore()} />
    </Screen>
  );
}
const routeKey = (r: PublicRoute) => r.route_id;
const myKey = (r: MyRoute) => r.id;
function RouteCard({ r }: { r: PublicRoute }) {
  const rating = r.rating_avg ? `Rated ${Number(r.rating_avg).toFixed(1)} (${r.rating_count})` : "No ratings yet";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${r.title} by @${r.owner_username}, ${formatDistance(r.distance_m)}, ${rating}`}
      onPress={() => router.push(`/route/${r.route_id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card>
        <RouteTrace points={r.points} height={110} label={`Shape of ${r.title}`} />
        <Text variant="title">{r.title}</Text>
        <Text
          variant="caption"
          muted
        >{`@${r.owner_username} · ${formatDistance(r.distance_m)} · ${formatDuration(r.duration_s)}`}</Text>
        <Text variant="caption">{rating}</Text>
      </Card>
    </Pressable>
  );
}
