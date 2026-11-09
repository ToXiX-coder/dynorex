import { Stack, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { IconButton } from "@/components/buttons/IconButton";
import { Card } from "@/components/cards/Card";
import { GetAppBanner } from "@/components/feedback/GetAppBanner";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { SearchIcon } from "@/components/icons";
import { BuildCard } from "@/components/social/BuildCard";
import { Text } from "@/components/Text";
import { kindOf, kindPlural, kindNoun, VEHICLE_KINDS, type VehicleKind } from "@/domain/vehicleKind";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { NearbySection } from "@/features/social/NearbySection";
import { FEED_PAGE, socialService, type DiscoverMode } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import { useOnline } from "@/hooks/useNetwork";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";
import type { PublicBuild } from "@/services/supabase/database.types";
import { color, layout, space } from "@/theme/tokens";

type Mode = DiscoverMode | "nearby";

/**
 * dynorex.app/discover. Public builds only, ranked on the server (the app picks a mode, never the
 * ranking). Viewable without an account. Nearby is opt-in and behind its flag. Results are not
 * stored offline, so a build that goes private disappears on the next load.
 */
export default function Discover() {
  const { status } = useAuth();
  const flags = useFlags();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>("trending");
  const [builds, setBuilds] = useState<PublicBuild[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // D-71: show one kind of vehicle; none picked shows everything, as before
  const [only, setOnly] = useState<VehicleKind | null>(null);
  const shown = builds?.filter((b) => !only || kindOf(b) === only) ?? null;
  const media = usePublicMedia((shown ?? []).filter((b) => b.has_hero).map((b) => b.vehicle_id));

  useEffect(() => {
    analytics.track("discover_opened", {});
  }, []);

  const apply = useCallback((r: Awaited<ReturnType<typeof socialService.discover>>) => {
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setBuilds(r.data);
    setPage(0);
    setHasMore(r.data.length >= FEED_PAGE);
  }, []);
  const load = (m: DiscoverMode) => {
    setBusy(true);
    void socialService.discover(m, 0).then(apply);
  };
  const choose = (m: Mode) => {
    setMode(m);
    if (m === "nearby") return;
    setBuilds(null);
    load(m);
  };

  // first page of Trending on open; later modes load from the chip press
  useEffect(() => {
    let alive = true;
    void socialService.discover("trending", 0).then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [apply]);

  const modes: { id: Mode; label: string; show: boolean }[] = [
    { id: "trending", label: "Trending", show: true },
    { id: "new", label: "New", show: true },
    { id: "for_you", label: "For you", show: status === "signedIn" },
    { id: "nearby", label: "Nearby", show: flags.discoverNearby },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.pad}
      refreshControl={
        mode === "nearby" ? undefined : (
          <RefreshControl
            refreshing={busy && builds !== null}
            onRefresh={() => load(mode as DiscoverMode)}
            tintColor={color.accent}
          />
        )
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton label="Search" onPress={() => router.push("/search")}>
              <SearchIcon color={color.text} />
            </IconButton>
          ),
        }}
      />
      <GetAppBanner />
      <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Sort builds">
        {modes
          .filter((m) => m.show)
          .map((m) => (
            <Chip key={m.id} label={m.label} selected={mode === m.id} onPress={() => choose(m.id)} />
          ))}
      </View>
      {mode === "nearby" ? null : (
        <View style={styles.modes} accessibilityLabel="Show only">
          {VEHICLE_KINDS.map((k) => (
            <Chip
              key={k.id}
              label={kindPlural(k.id)}
              selected={only === k.id}
              onPress={() => setOnly((cur) => (cur === k.id ? null : k.id))}
            />
          ))}
        </View>
      )}
      {flags.buildOfTheWeek ? (
        <Card featured>
          <Text variant="section">Build of the Week</Text>
          <Button title="See this week's pick" variant="secondary" onPress={() => router.push("/discover/botw")} />
        </Card>
      ) : null}

      {mode === "nearby" ? (
        <NearbySection onFallback={() => choose("trending")} />
      ) : builds === null && !error ? (
        <LoadingState label="Loading builds" />
      ) : builds === null && error ? (
        <ErrorState kind={online === false ? "offline" : error.key} onAction={() => load(mode as DiscoverMode)} />
      ) : builds && builds.length === 0 ? (
        <EmptyState message="Nothing to discover yet" detail="Public builds show up here once owners share them." />
      ) : (
        <View style={{ gap: space.md }}>
          {error ? (
            <InlineError kind={online === false ? "offline" : error.key} onAction={() => load(mode as DiscoverMode)} />
          ) : null}
          {mode === "for_you" ? (
            <Text variant="caption" muted>
              Builds from owners with the same build goal as you come first.
            </Text>
          ) : null}
          {shown!.length === 0 && only ? (
            <Text muted>
              {`No ${only === "motorcycle" ? "motorcycle" : kindNoun(only)} builds in this list yet.${hasMore ? " Load more to look further." : ""}`}
            </Text>
          ) : null}
          {shown!.map((b) => (
            <BuildCard key={b.build_id} build={b} heroUrl={media.heroes[b.vehicle_id]} />
          ))}
          {hasMore ? (
            <Button
              title="Load more"
              variant="secondary"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                const next = page + 1;
                const r = await socialService.discover(mode as DiscoverMode, next);
                setBusy(false);
                if (!r.ok) return setError(r.error);
                setBuilds((x) => [...(x ?? []), ...r.data]);
                setPage(next);
                if (r.data.length < FEED_PAGE) setHasMore(false);
              }}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: layout.screenGutter, gap: space.lg, paddingBottom: space.huge },
  modes: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
