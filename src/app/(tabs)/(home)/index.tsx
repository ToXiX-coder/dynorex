import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { EggBubble, useEggBubble } from "@/components/feedback/EggBubble";
import { garageGreeting, LOGO_TAPS_TO_ROAR, ROARS } from "@/domain/easterEggs";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/services/haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusChip } from "@/components/build/BuildBits";
import { ListGroup } from "@/components/lists/ListGroup";
import { SignedImage } from "@/components/build/SignedImage";
import { VehicleArt } from "@/components/vehicle/VehicleArt";
import { kindOf } from "@/domain/vehicleKind";
import { Avatar } from "@/components/social/Avatar";
import { Driver } from "@/components/social/Driver";
import { parseGear } from "@/domain/gear";
import { Button } from "@/components/buttons/Button";
import { IconButton } from "@/components/buttons/IconButton";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice, TextLink } from "@/components/feedback/Inline";
import { LastUpdated } from "@/components/feedback/OfflineBanner";
import { EmptyState } from "@/components/feedback/States";
import { BellIcon, ProfileIcon, SearchIcon } from "@/components/icons";
import { LogoMark, LogoWordmark } from "@/components/mascot/Torq";
import { BuildCard } from "@/components/social/BuildCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { modPath } from "@/domain/deepLinks";
import { whenText } from "@/domain/when";
import type { ModStatusId } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { FirstBuildChecklist } from "@/features/garage/FirstBuild";
import { socialService } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import { useCachedLoad } from "@/hooks/useCachedLoad";
import { backendConfigured } from "@/services/config";
import type { FeedItem, PublicBuild } from "@/services/supabase/database.types";
import { color, layout, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * Home: your garage (cached, works offline), updates from builds and people you follow, and a taste of
 * Discover. Each section loads on its own, so one failing never blanks the others. Other people's
 * content (feed, Discover) is never stored offline.
 */
export default function Home() {
  const { status, profile, exitGuest } = useAuth();
  const signedIn = status === "signedIn";
  const garage = useCachedLoad<VehicleCard[]>(signedIn ? "garage" : null, () =>
    signedIn ? buildService.listVehicles(0) : Promise.resolve({ ok: true as const, data: [] }),
  );
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [feedError, setFeedError] = useState<MappedError | null>(null);
  const [trending, setTrending] = useState<PublicBuild[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const media = usePublicMedia(trending.filter((b) => b.has_hero).map((b) => b.vehicle_id));
  // easter egg: "Cars & Coffee o'clock" and friends, by local time (worked out once per visit)
  const [greeting] = useState(() => garageGreeting(new Date()));

  const loadSocial = useCallback(async () => {
    const [t, f, u] = await Promise.all([
      socialService.discover("trending", 0),
      signedIn ? socialService.homeFeed(0) : Promise.resolve(null),
      signedIn ? socialService.unreadCount() : Promise.resolve(null),
    ]);
    if (t.ok) setTrending(t.data.slice(0, 5));
    if (f) {
      if (f.ok) {
        setFeed(f.data);
        setFeedError(null);
      } else setFeedError(f.error);
    }
    if (u?.ok) setUnread(u.data);
  }, [signedIn]);

  useFocusEffect(
    useCallback(() => {
      if (backendConfigured()) void loadSocial();
    }, [loadSocial]),
  );

  const refreshAll = async () => {
    setRefreshing(true);
    setRefreshed(false);
    await Promise.all([garage.refresh(), loadSocial()]);
    setRefreshing(false);
    setRefreshed(true);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: color.background }}>
      <View style={styles.header}>
        <LogoRoar />
        <View style={styles.headerRight}>
          <IconButton label="Search" onPress={() => router.push("/search")}>
            <SearchIcon color={color.text} />
          </IconButton>
          <IconButton label="Notifications" badge={unread} onPress={() => router.push("/inbox")}>
            <BellIcon color={color.text} />
          </IconButton>
          <IconButton label="Your profile" onPress={() => router.push("/profile")}>
            {signedIn && profile ? (
              // your little driver, dressed for your build goal (or however you kitted them out)
              <View style={styles.driverChip}>
                <Driver gear={parseGear(profile.driver_gear, profile.build_goal)} size={36} />
              </View>
            ) : (
              <ProfileIcon color={color.text} />
            )}
          </IconButton>
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refreshAll()} tintColor={color.accent} />
        }
      >
        {refreshed ? <InlineNotice title="Up to date" /> : null}

        {/* ------------------------------------------------ Your Garage */}
        <View style={{ gap: space.sm }}>
          <SectionHeader>Your garage</SectionHeader>
          {greeting ? (
            <Text variant="caption" muted>
              {greeting}
            </Text>
          ) : null}
          {signedIn ? (
            <>
              <LastUpdated label={garage.staleLabel} />
              {garage.error && garage.data ? <InlineError kind={garage.error.key} /> : null}
              {garage.data && garage.data.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {garage.data.map((v) => (
                    <GarageCard key={v.id} v={v} />
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add a vehicle"
                    onPress={() => router.push("/garage/new")}
                    style={[styles.vCard, styles.addCard]}
                  >
                    <Text variant="title" accent>
                      + Add
                    </Text>
                  </Pressable>
                </ScrollView>
              ) : garage.data ? (
                <Card>
                  <EmptyState
                    expression="neutral"
                    message={profile?.username ? `Welcome, @${profile.username}` : "Welcome"}
                    detail="Add your first vehicle to start a build."
                    action={{ title: "Add vehicle", onPress: () => router.push("/garage/new") }}
                  />
                </Card>
              ) : garage.error ? (
                <InlineError kind={garage.error.key} onAction={() => void garage.refresh()} />
              ) : (
                <Text muted>Loading your garage…</Text>
              )}
            </>
          ) : (
            <Card>
              <EmptyState
                expression="neutral"
                message="No vehicles yet"
                detail={
                  backendConfigured()
                    ? "Sign in to start your garage."
                    : "This build isn't connected to a Dynorex server yet."
                }
              />
              <Button title="Sign in or create account" onPress={exitGuest} />
            </Card>
          )}
        </View>

        {signedIn && garage.data ? <FirstBuildChecklist cars={garage.data} /> : null}

        {/* ------------------------------------------------ Build Updates */}
        <View style={{ gap: space.sm }}>
          <SectionHeader>Build updates</SectionHeader>
          {!signedIn ? (
            <Text muted>Sign in and follow builds to see their latest mods here.</Text>
          ) : feedError ? (
            <InlineError kind={feedError.key} onAction={() => void loadSocial()} />
          ) : feed === null ? (
            <Text muted>Loading updates…</Text>
          ) : feed.length === 0 ? (
            <Card>
              <Text>Follow builds and people to see their new mods here.</Text>
              <Button title="Find builds" variant="secondary" onPress={() => router.push("/discover")} />
            </Card>
          ) : (
            // one grouped panel, not a card per update
            <ListGroup>
              {feed.map((f) => (
                <FeedRow key={f.mod_id} f={f} />
              ))}
            </ListGroup>
          )}
        </View>

        {/* ------------------------------------------------ Discover */}
        <View style={{ gap: space.sm }}>
          <SectionHeader right={<TextLink title="See all" onPress={() => router.push("/discover")} />}>
            Discover builds
          </SectionHeader>
          <Text variant="caption" muted>
            Trending public builds from other owners.
          </Text>
          {trending.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
              {trending.map((b) => (
                <BuildCard key={b.build_id} build={b} heroUrl={media.heroes[b.vehicle_id]} compact />
              ))}
            </ScrollView>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The brand mark. Easter egg: tap it five times in a row and Torq roars (the logo shakes). */
function LogoRoar() {
  const reduced = useReducedMotion();
  const bubble = useEggBubble();
  const [shake] = useState(() => new Animated.Value(0));
  const [roars, setRoars] = useState(0);
  const taps = useRef({ n: 0, at: 0 });
  const onTap = () => {
    const now = Date.now();
    taps.current = { n: now - taps.current.at < 1500 ? taps.current.n + 1 : 1, at: now };
    if (taps.current.n < LOGO_TAPS_TO_ROAR) return;
    taps.current.n = 0;
    haptic.success();
    bubble.say(ROARS[roars % ROARS.length]!);
    setRoars((r) => r + 1);
    if (reduced) return;
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 1, -1, 0].map((to) => Animated.timing(shake, { toValue: to, duration: 60, useNativeDriver: true })),
    ).start();
  };
  return (
    <View>
      <Pressable onPress={onTap} accessible accessibilityRole="header" accessibilityLabel="Dynorex">
        <Animated.View
          style={[
            styles.brand,
            { transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] }) }] },
          ]}
        >
          <LogoMark size={50} />
          <LogoWordmark width={118} />
        </Animated.View>
      </Pressable>
      <EggBubble text={bubble.text} tail="top" style={styles.roar} />
    </View>
  );
}

function GarageCard({ v }: { v: VehicleCard }) {
  const name = `${v.year} ${v.make} ${v.model}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${v.nickname ? `${v.nickname}, ` : ""}${name}, ${v.visibility === "public" ? "public" : "private"}`}
      onPress={() => router.push(`/garage/${v.id}`)}
      style={styles.vCard}
    >
      {v.hero_path ? (
        <SignedImage path={v.hero_path} alt={`Photo of ${name}`} style={styles.vPhoto} />
      ) : (
        <VehicleArt
          make={v.make}
          model={v.model}
          year={v.year}
          seed={v.id}
          hint={v.nickname}
          kind={kindOf(v)}
          label={false}
          style={styles.vPhoto}
        />
      )}
      <View style={{ padding: space.sm, gap: space.xxs }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {v.nickname || name}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {v.nickname ? name : v.visibility === "public" ? "Public" : "Private"}
        </Text>
      </View>
    </Pressable>
  );
}

/** One update in the grouped list: who, what, on which build, when, and how far along. */
function FeedRow({ f }: { f: FeedItem }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`@${f.owner_username} added ${f.mod_name} to ${f.build_title}, ${whenText(f.created_at)}`}
      onPress={() => router.push(modPath(f.vehicle_id, f.mod_id))}
      style={({ pressed }) => [styles.feedRow, pressed && { backgroundColor: color.surfaceRaised }]}
    >
      <Avatar username={f.owner_username} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.feedTop}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {f.mod_name}
          </Text>
          <Text variant="caption" muted>
            {whenText(f.created_at)}
          </Text>
        </View>
        <Text variant="caption" muted numberOfLines={1}>
          {`@${f.owner_username} on ${f.build_title}`}
        </Text>
        <StatusChip status={f.status as ModStatusId} />
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
      // the logo's easter-egg bubble drops over the content below
      zIndex: 10,
      elevation: 10,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: space.sm },
    roar: { position: "absolute", top: "100%", marginTop: space.sm, left: 0, width: 220 },
    headerRight: { flexDirection: "row", gap: space.xxs },
    driverChip: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: color.surface,
      borderWidth: 1.5,
      borderColor: color.accent,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    pad: { padding: layout.screenGutter, gap: space.xl, paddingBottom: space.huge },
    hRow: { gap: space.sm, paddingRight: space.lg },
    vCard: { width: 180, borderRadius: radius.lg, backgroundColor: color.surface, overflow: "hidden" },
    vPhoto: { width: "100%", height: 100 },
    addCard: { alignItems: "center", justifyContent: "center", minHeight: 150, width: 120 },
    feedRow: {
      minHeight: touch.min + space.lg,
      flexDirection: "row",
      gap: space.md,
      alignItems: "flex-start",
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    feedTop: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  }),
);
