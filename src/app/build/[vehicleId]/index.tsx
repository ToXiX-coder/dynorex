import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { CategoryIcon, StatusChip, categoryLabel } from "@/components/build/BuildBits";
import { EbikeSpecCard, SpecCard } from "@/components/build/SpecCard";
import { kindDetail, kindOf, timesZeroToSixty } from "@/domain/vehicleKind";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { GetAppBanner } from "@/components/feedback/GetAppBanner";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { PublicImage } from "@/components/social/PublicImage";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { ERROR_COPY } from "@/domain/copy/errors";
import { isUuid, modPath, userPath } from "@/domain/deepLinks";
import type { ModCategoryId, ModStatusId } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { StickerReactions } from "@/features/plus/StickerReactions";
import { subscriptionService } from "@/features/plus/subscriptionService";
import { profileService } from "@/features/profiles/profileService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { PublicGallery } from "@/features/garage/Gallery";
import { PublicPerfCard } from "@/features/garage/PerfBits";
import { PublicProofCard } from "@/features/garage/ProofBits";
import { FollowButton } from "@/features/social/FollowButton";
import { SaveButton } from "@/features/social/SaveButton";
import { ShareButton } from "@/features/social/ShareButton";
import { FEED_PAGE, socialService, type PublicBuildPage, type PublicMod } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import { useAction } from "@/hooks/useAction";
import { color, layout, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { ebikeHeroStats, HeroHeader, heroStatsFrom } from "@/components/vehicle/HeroHeader";
import { honkLine } from "@/domain/easterEggs";
import { PowerGauge } from "@/components/vehicle/PowerGauge";
import { isStock } from "@/domain/specRange";
import { dayText } from "@/domain/when";
import { themed } from "@/theme/themed";

type Loaded = Extract<PublicBuildPage, { status: "public" }>;

/**
 * dynorex.app/build/:vehicleId: the public build page. Everything on it comes from the server's
 * public projection, re-checked on every load: no VIN, odometer, costs, notes, private photos or
 * owner ids. Private, hidden, blocked and missing builds all show the same "Build not found";
 * a public build that was deleted says it no longer exists. Viewable without an account.
 */
export default function PublicBuildScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId ?? "");
  const { profile, status } = useAuth();
  const [state, setState] = useState<"loading" | "not_found" | "gone" | MappedError | Loaded>("loading");
  const [more, setMore] = useState<PublicMod[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const block = useAction(profileService.block);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchPage>>) => {
    if (!r.ok) return setState(r.error.key === "notConnected" ? "not_found" : r.error);
    setMore([]);
    setPage(0);
    setHasMore(r.data.status === "public" && r.data.mods.length >= FEED_PAGE);
    setState(r.data.status === "public" ? r.data : r.data.status);
  }, []);
  const load = useCallback(() => fetchPage(id).then(apply), [id, apply]);

  useEffect(() => {
    let alive = true;
    void fetchPage(id).then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [id, apply]);

  const loaded = typeof state === "object" && "build" in state ? state : null;
  const media = usePublicMedia(loaded?.build.has_hero ? [id] : []);
  const loadedBuild = loaded?.build.build_id;

  // Counts toward the owner's Dynorex+ analytics (signed-in viewers only; the server skips the owner).
  useEffect(() => {
    if (loadedBuild && status === "signedIn") void subscriptionService.recordView(id);
  }, [loadedBuild, status, id]);

  if (state === "loading") return <LoadingState label="Loading build" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/discover"));
  if (state === "not_found" || state === "gone")
    return (
      <View style={styles.pad}>
        <Stack.Screen options={{ title: "Build" }} />
        <ErrorState kind={state === "gone" ? "buildGone" : "buildNotFound"} onAction={back} />
      </View>
    );
  if (!loaded)
    return (
      <View style={styles.pad}>
        <ErrorState kind={(state as MappedError).key} onAction={() => void load()} />
      </View>
    );

  const b = loaded.build;
  const car = `${b.year} ${b.make} ${b.model}${b.trim_level ? ` ${b.trim_level}` : ""}`;
  const isMine = Boolean(profile?.username && profile.username === b.owner_username);
  const mods = [...loaded.mods, ...more];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: color.background }}
      contentContainerStyle={{ paddingBottom: space.huge }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={color.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <ScreenMenu
        title={b.title}
        label="Build options"
        actions={
          !isMine && status === "signedIn" && !blocked
            ? [
                {
                  label: "Report this build",
                  hint: "Tell Dynorex about a problem.",
                  onPress: () => setReporting(true),
                },
                {
                  label: `Block @${b.owner_username}`,
                  hint: "Neither of you can see or follow the other.",
                  destructive: true,
                  onPress: () => setConfirmBlock(true),
                },
              ]
            : []
        }
      />
      <HeroHeader
        media={(style, artInset) => (
          <PublicImage
            uri={media.heroes[id]}
            expected={b.has_hero}
            alt={`Photo of ${car}`}
            art={{
              make: b.make,
              model: b.model,
              year: b.year,
              seed: id,
              hint: b.title,
              inset: artInset,
              animate: true,
              kind: kindOf(b),
            }}
            style={style}
          />
        )}
        title={b.title}
        subtitle={[car, kindDetail(b)].filter(Boolean).join(" · ")}
        stats={kindOf(b) === "ebike" ? ebikeHeroStats(b) : heroStatsFrom(loaded.specs)}
        honk={(tap) => honkLine(b.make, b.model, b.year, tap)}
      />
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Owner @${b.owner_username}. Opens their profile`}
          onPress={() => router.push(userPath(b.owner_username))}
          style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text accent>{`@${b.owner_username}`}</Text>
        </Pressable>
        <Text variant="caption" muted>
          {`${Number(b.mods_count)} mods · ${Number(b.followers_count)} followers`}
        </Text>
      </View>

      <View style={styles.pad}>
        <GetAppBanner />
        {blocked ? (
          <InlineNotice headsUp title={ERROR_COPY.blocked.title} body={ERROR_COPY.blocked.body} />
        ) : (
          <View style={styles.actions}>
            {isMine ? (
              <Button title="Edit in your garage" onPress={() => router.push(`/garage/${id}`)} />
            ) : (
              <FollowButton target={{ kind: "build", buildId: b.build_id }} label={b.title} />
            )}
            <ShareButton vehicleId={id} title={b.title} />
            {!isMine ? <SaveButton kind="build" id={id} /> : null}
          </View>
        )}
        {b.description ? <Text>{b.description}</Text> : null}

        <SectionHeader>Specs</SectionHeader>
        {kindOf(b) === "ebike" ? (
          <EbikeSpecCard bike={b} estimate={loaded.specs} />
        ) : (
          <>
            {loaded.specs?.hp_status === "estimate" && loaded.specs.hp != null ? (
              <PowerGauge hp={Number(loaded.specs.hp)} stock={isStock(loaded.specs)} />
            ) : null}
            <SpecCard estimate={loaded.specs} />
          </>
        )}
        <StickerReactions buildId={b.build_id} isMine={isMine} />
        {timesZeroToSixty(kindOf(b)) ? <PublicPerfCard vehicleId={id} /> : null}
        <PublicProofCard vehicleId={id} />
        <PublicGallery vehicleId={id} title={b.title} />

        <SectionHeader>Build timeline</SectionHeader>
        {mods.length === 0 ? (
          <EmptyState expression="wrenching" message="No mods logged yet" detail="Check back soon." />
        ) : (
          <View style={{ gap: space.sm }}>
            {mods.map((m) => (
              <PublicModRow key={m.mod_id} m={m} vehicleId={id} />
            ))}
            {hasMore ? (
              <Button
                title="Load more"
                variant="secondary"
                loading={loadingMore}
                onPress={async () => {
                  setLoadingMore(true);
                  const next = page + 1;
                  const r = await socialService.publicMods(id, next);
                  setLoadingMore(false);
                  if (!r.ok) return;
                  setMore((x) => [...x, ...r.data]);
                  setPage(next);
                  if (r.data.length < FEED_PAGE) setHasMore(false);
                }}
              />
            ) : null}
          </View>
        )}

        {block.error ? <InlineError kind={block.error.key} /> : null}
      </View>

      <ReportSheet visible={reporting} target={{ type: "build", id: b.build_id }} onClose={() => setReporting(false)} />
      <ConfirmModal
        visible={confirmBlock}
        kind="confirmBlock"
        busy={block.busy}
        onCancel={() => setConfirmBlock(false)}
        onConfirm={async () => {
          // the owner's id comes from their public profile, never from the build projection
          const p = await profileService.getPublic(b.owner_username);
          const r = p.ok && p.data ? await block.run(p.data.user_id) : null;
          setConfirmBlock(false);
          if (r?.ok) setBlocked(true);
        }}
      />
    </ScrollView>
  );
}

/** Not-an-id links never reach the server; they get the same "not found" as anything private. */
async function fetchPage(id: string) {
  if (!isUuid(id)) return { ok: true as const, data: { status: "not_found" as const } satisfies PublicBuildPage };
  return socialService.publicBuild(id);
}

function PublicModRow({ m, vehicleId }: { m: PublicMod; vehicleId: string }) {
  const date = dayText(m.installed_on ?? m.created_at);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${m.name}, ${categoryLabel(m.category)}, ${m.status.replace("_", " ")}, ${date}`}
      onPress={() => router.push(modPath(vehicleId, m.mod_id))}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={styles.modRow}>
        <CategoryIcon id={m.category as ModCategoryId} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="caption" muted>
            {date}
          </Text>
          <Text variant="title">{m.name}</Text>
          <View style={styles.meta}>
            <StatusChip status={m.status as ModStatusId} />
            {m.brand ? <Text variant="caption">{m.brand}</Text> : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pad: { padding: layout.screenGutter, gap: space.lg, backgroundColor: color.background },
    overlay: { paddingHorizontal: layout.screenGutter, paddingTop: space.md, gap: space.xxs },
    actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "flex-start" },
    modRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
    meta: { flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" },
    safety: { gap: space.sm, paddingTop: space.lg },
  }),
);
