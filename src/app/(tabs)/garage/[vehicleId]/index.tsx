import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Animated, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { native } from "@/components/motion/Motion";
import { CategoryIcon, StatusChip, categoryLabel } from "@/components/build/BuildBits";
import { SignedImage } from "@/components/build/SignedImage";
import { EbikeSpecCard, SpecCard } from "@/components/build/SpecCard";
import { ebikeHeroStats, HeroHeader, heroStatsFrom } from "@/components/vehicle/HeroHeader";
import { emotoCurrent, kindDetail, kindOf, usesNhtsa } from "@/domain/vehicleKind";
import { PowerGauge } from "@/components/vehicle/PowerGauge";
import { isStock } from "@/domain/specRange";
import { VehicleArt } from "@/components/vehicle/VehicleArt";
import { Button } from "@/components/buttons/Button";
import { ToolButton, ToolRow } from "@/components/buttons/ToolButton";
import { ChatIcon, PencilIcon, ReceiptIcon, ShareIcon } from "@/components/icons";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError } from "@/components/feedback/Inline";
import { LastUpdated } from "@/components/feedback/OfflineBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { haptic } from "@/services/haptics";
import { honkLine, odometerBadge } from "@/domain/easterEggs";
import { formatMoney } from "@/domain/money";
import { dayText } from "@/domain/when";
import type { ModCategoryId, ModStatusId } from "@/domain/validation/build";
import { buildPath } from "@/domain/deepLinks";
import { buildService, PAGE_SIZE } from "@/features/garage/buildService";
import { BuildCardButton } from "@/features/garage/BuildCard";
import { OwnerGallery } from "@/features/garage/Gallery";
import { BuildRecordCard } from "@/features/record/BuildRecordCard";
import { MaintenanceCard } from "@/features/garage/MaintenanceBits";
import { PerfCard } from "@/features/garage/PerfBits";
import { RecallsCard, RecordsCard } from "@/features/garage/ProofBits";
import { PlusInsights } from "@/features/plus/PlusInsights";
import { ShareButton } from "@/features/social/ShareButton";
import { socialService } from "@/features/social/socialService";
import { useAction } from "@/hooks/useAction";
import { useFlags } from "@/providers/AppProviders";
import { useCachedLoad } from "@/hooks/useCachedLoad";
import type { ModRow, SpecEstimateRow, VehicleRow } from "@/services/supabase/database.types";
import { color, layout, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";

interface Detail {
  vehicle: VehicleRow | null;
  estimate: SpecEstimateRow | null;
  mods: ModRow[];
}

async function loadDetail(id: string) {
  const [v, e, m] = await Promise.all([
    buildService.getVehicle(id),
    buildService.specEstimate(id),
    buildService.listMods(id, 0),
  ]);
  if (!v.ok) return v;
  if (!e.ok) return e;
  if (!m.ok) return m;
  return { ok: true as const, data: { vehicle: v.data, estimate: e.data, mods: m.data } satisfies Detail };
}

/** Vehicle Detail: hero, specs (with the disclaimer), newest-first timeline, links to costs and editing. */
export default function VehicleDetail() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const flags = useFlags();
  const id = String(vehicleId);
  const { data, loading, error, refresh, staleLabel } = useCachedLoad<Detail>(`vehicle:${id}`, () => loadDetail(id));
  const [more, setMore] = useState<ModRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // drives the hero's parallax (on the native thread where there is one)
  const [scrollY] = useState(() => new Animated.Value(0));

  // come back from add/edit mod -> fresh numbers
  useFocusEffect(
    useCallback(() => {
      setMore([]);
      setPage(0);
      setHasMore(true);
      void refresh();
    }, [refresh]),
  );

  if (!data && loading) return <LoadingState label="Loading vehicle" />;
  if (!data && error)
    return (
      <View style={styles.pad}>
        <ErrorState kind={error.key} onAction={() => void refresh()} />
      </View>
    );
  if (data && !data.vehicle) {
    return (
      <View style={styles.pad}>
        <ErrorState kind="buildNotFound" onAction={() => router.replace("/garage")} />
      </View>
    );
  }

  const v = data!.vehicle!;
  const mods = [...data!.mods, ...more];
  const name = `${v.year} ${v.make} ${v.model}`;
  const canLoadMore = hasMore && data!.mods.length >= PAGE_SIZE;
  const odoBadge = odometerBadge(v.odometer === null ? null : Number(v.odometer), v.odometer_unit);
  const sold = Boolean(v.sold_at);
  const kind = kindOf(v);
  // D-74: an e-moto shows what its latest controller or battery mod set
  const current = kind === "ebike" ? { ...v, ...emotoCurrent(mods) } : v;

  return (
    <Animated.ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: color.background }}
      contentContainerStyle={{ paddingBottom: space.huge }}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: native })}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={color.accent} />}
    >
      <Stack.Screen options={{ title: v.nickname || name }} />
      <HeroHeader
        media={(style, artInset) =>
          v.hero_path ? (
            <SignedImage path={v.hero_path} alt={`Photo of ${name}`} style={style} />
          ) : (
            <VehicleArt
              make={v.make}
              model={v.model}
              year={v.year}
              seed={v.id}
              hint={v.nickname}
              kind={kind}
              style={style}
              inset={artInset}
              animate
            />
          )
        }
        // the mileage has its own row below (where it's updated), except on a sold car's read-only copy
        kicker={`${sold ? "Sold" : v.visibility === "public" ? "Public" : "Private"}${sold && v.odometer !== null ? ` · ${Number(v.odometer).toLocaleString()} ${v.odometer_unit}` : ""}${odoBadge ? ` · ${odoBadge}` : ""}`}
        title={v.nickname || `${v.make} ${v.model}`}
        subtitle={[`${name}${v.trim_level ? ` ${v.trim_level}` : ""}`, kindDetail(current)].filter(Boolean).join(" · ")}
        stats={kind === "ebike" ? ebikeHeroStats(current) : heroStatsFrom(data!.estimate)}
        honk={(tap) => honkLine(v.make, v.model, v.year, tap)}
        scrollY={scrollY}
      />

      <View style={styles.pad}>
        <LastUpdated label={staleLabel} />
        {error && data ? <InlineError kind={error.key} onAction={() => void refresh()} /> : null}
        {sold ? (
          <Card>
            <Text>{`Sold through a transfer. Your record of this car is read-only; the buyer has their own copy.`}</Text>
          </Card>
        ) : null}
        {sold ? null : (
          <MileageRow
            vehicleId={id}
            odometer={v.odometer === null ? null : Number(v.odometer)}
            unit={v.odometer_unit}
            onSaved={refresh}
          />
        )}
        {/* one main action; the rest wait in a quiet toolbar. A sold car's record is read-only, so no Add mod */}
        {sold ? null : <Button title="Add mod" fullWidth onPress={() => router.push(`/garage/${id}/mods/new`)} />}
        <ToolRow>
          <ToolButton
            icon={<ReceiptIcon color={color.text} />}
            label="Costs"
            onPress={() => router.push(`/garage/${id}/costs`)}
          />
          <ToolButton
            icon={<PencilIcon color={color.text} />}
            label="Edit"
            onPress={() => router.push(`/garage/${id}/edit`)}
          />
          <BuildCardButton
            vehicle={v}
            estimate={data!.estimate}
            mods={mods}
            trigger={(open) => <ToolButton icon={<ShareIcon color={color.text} />} label="Share card" onPress={open} />}
          />
          {flags.torqChat ? (
            <ToolButton
              icon={<ChatIcon color={color.text} />}
              label="Ask Torq"
              onPress={() => router.push({ pathname: "/torq", params: { vehicleId: id } })}
            />
          ) : null}
        </ToolRow>

        {/* the record is what a buyer weighs, so it sits right under the actions (D-68) */}
        <BuildRecordCard vehicleId={id} />

        <SectionHeader>Specs</SectionHeader>
        {kind === "ebike" ? (
          <EbikeSpecCard bike={current} estimate={data!.estimate} />
        ) : (
          <>
            {data!.estimate?.hp_status === "estimate" && data!.estimate.hp != null ? (
              <PowerGauge
                hp={Number(data!.estimate.hp)}
                stockHp={v.baseline_hp ? Number(v.baseline_hp) : null}
                stock={isStock(data!.estimate)}
              />
            ) : null}
            <SpecCard estimate={data!.estimate} />
          </>
        )}
        {v.baseline_lookup_label ? (
          <Text variant="caption" muted>
            {`Stock numbers: factory specs for the ${v.baseline_lookup_label}${v.baseline_looked_up.length < 4 ? " (where you left them blank)" : ""}. Your car may differ: edit the vehicle to use your own.`}
          </Text>
        ) : null}
        {/* NHTSA recalls and 0-60 runs cover cars and motorcycles, not e-bikes (D-71) */}
        {usesNhtsa(kind) ? <RecallsCard vehicleId={id} car={name} /> : null}
        <PerfCard vehicleId={id} kind={kind} />
        <RecordsCard vehicleId={id} />
        {/* each kind has its own job list in the log (D-72: chain lube, valve checks, battery care...) */}
        <MaintenanceCard
          vehicleId={id}
          odometer={v.odometer !== null && v.odometer_unit === "mi" ? Number(v.odometer) : null}
        />
        <SharingCard
          vehicleId={id}
          isPublic={v.visibility === "public"}
          title={v.nickname || name}
          onChanged={refresh}
        />
        <PlusInsights vehicleId={id} isPublic={v.visibility === "public"} refreshKey={data} />

        <OwnerGallery
          vehicleId={id}
          isPublic={v.visibility === "public"}
          heroPath={v.hero_path}
          onCoverChanged={() => void refresh()}
        />

        <SectionHeader>Build timeline</SectionHeader>
        {mods.length === 0 ? (
          sold ? (
            <Text muted>No mods were logged before the sale.</Text>
          ) : (
            <EmptyState
              expression="wrenching"
              message="Add your first mod to start your build story"
              action={{ title: "Add mod", onPress: () => router.push(`/garage/${id}/mods/new`) }}
            />
          )
        ) : (
          <View style={{ gap: space.sm }}>
            {mods.map((m) => (
              <ModRowView key={m.id} m={m} vehicleId={id} />
            ))}
            {canLoadMore ? (
              <Button
                title="Load more"
                variant="secondary"
                loading={loadingMore}
                onPress={async () => {
                  setLoadingMore(true);
                  const next = page + 1;
                  const r = await buildService.listMods(id, next);
                  setLoadingMore(false);
                  if (!r.ok) return;
                  setMore((x) => [...x, ...r.data]);
                  setPage(next);
                  if (r.data.length < PAGE_SIZE) setHasMore(false);
                }}
              />
            ) : null}
          </View>
        )}
      </View>
    </Animated.ScrollView>
  );
}

/**
 * The one sharing switch for a vehicle and its build page. The server checks a verified email and a
 * username before anything goes public. Lists what a public page shows and never shows.
 */
function SharingCard({
  vehicleId,
  isPublic,
  title,
  onChanged,
}: {
  vehicleId: string;
  isPublic: boolean;
  title: string;
  onChanged: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const publish = useAction(socialService.setBuildPublic);
  const change = async (makePublic: boolean) => {
    const r = await publish.run(vehicleId, makePublic);
    setConfirm(false);
    if (r?.ok) await onChanged();
  };
  return (
    <Card>
      <SectionHeader>Sharing</SectionHeader>
      <Text>{isPublic ? "Public: anyone with the link can see this build." : "Private: only you can see it."}</Text>
      <Text variant="caption" muted>
        A public page shows the vehicle, build name, photos, specs estimate and mods (name, category, brand, status, date).
        Never your VIN, odometer, costs, notes or location.
      </Text>
      {publish.error ? <InlineError kind={publish.error.key} /> : null}
      {isPublic ? (
        <View style={styles.actions}>
          <Button title="View public page" variant="secondary" onPress={() => router.push(buildPath(vehicleId))} />
          <ShareButton vehicleId={vehicleId} title={title} />
          <Button title="Make private" variant="secondary" loading={publish.busy} onPress={() => void change(false)} />
        </View>
      ) : (
        <Button title="Make public" loading={publish.busy} onPress={() => setConfirm(true)} />
      )}
      <ConfirmModal
        visible={confirm}
        kind="confirmPublish"
        busy={publish.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void change(true)}
      />
    </Card>
  );
}

/**
 * D-68: the odometer in two taps, so mileage reminders and the record stay current. Only forward: a lower reading
 * is almost always a typo here, and the edit screen is where a real mistake gets corrected.
 */
function MileageRow({
  vehicleId,
  odometer,
  unit,
  onSaved,
}: {
  vehicleId: string;
  odometer: number | null;
  unit: "mi" | "km";
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useAction(buildService.setOdometer);
  const submit = async () => {
    const n = Number(value.replace(/[,\s]/g, ""));
    if (!value.trim() || !Number.isInteger(n) || n < 0 || n > 2_000_000)
      return setProblem("Use a whole number up to 2,000,000");
    if (odometer !== null && n < odometer)
      return setProblem(`That's lower than the ${odometer.toLocaleString()} ${unit} on file. Fix a mistake with Edit.`);
    setProblem(null);
    const r = await save.run(vehicleId, n);
    if (!r?.ok) return;
    haptic.success();
    setEditing(false);
    await onSaved();
  };
  if (!editing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Odometer ${odometer !== null ? `${odometer.toLocaleString()} ${unit}` : "not set"}. Update mileage`}
        onPress={() => {
          setValue(odometer !== null ? String(odometer) : "");
          setProblem(null);
          setEditing(true);
        }}
        style={withPress({ minHeight: touch.min })}
      >
        <Card style={styles.mileage}>
          <Text variant="caption" muted>
            Odometer
          </Text>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {odometer !== null ? `${odometer.toLocaleString()} ${unit}` : "Not set"}
          </Text>
          <Text variant="label" accent>
            Update
          </Text>
        </Card>
      </Pressable>
    );
  }
  return (
    <Card style={{ gap: space.sm }}>
      <TextField
        label={`Odometer now (${unit})`}
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        maxLength={9}
        autoFocus
        error={problem ?? undefined}
        onSubmitEditing={() => void submit()}
      />
      {save.error ? <InlineError kind={save.error.key} /> : null}
      <View style={styles.actions}>
        <Button title="Save" loading={save.busy} onPress={() => void submit()} />
        <Button title="Cancel" variant="secondary" disabled={save.busy} onPress={() => setEditing(false)} />
      </View>
    </Card>
  );
}

function ModRowView({ m, vehicleId }: { m: ModRow; vehicleId: string }) {
  const date = dayText(m.installed_on ?? m.created_at);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${m.name}, ${categoryLabel(m.category)}, ${m.status.replace("_", " ")}, ${date}`}
      accessibilityHint="Opens the mod. Edit and delete are there."
      onPress={() => router.push(`/garage/${vehicleId}/mods/${m.id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={styles.modRow}>
        <CategoryIcon id={m.category as ModCategoryId} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <View style={styles.dateChip}>
            <Text variant="caption">{date}</Text>
          </View>
          <Text variant="title">{m.name}</Text>
          <View style={styles.meta}>
            <StatusChip status={m.status as ModStatusId} />
            {m.cost_minor !== null && m.currency ? (
              <Text variant="caption">{formatMoney(Number(m.cost_minor), m.currency)}</Text>
            ) : null}
          </View>
          {m.notes ? (
            <Text variant="caption" muted numberOfLines={2}>
              {m.notes}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pad: { padding: layout.screenGutter, gap: space.lg, backgroundColor: color.background },
    actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
    modRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
    mileage: { flexDirection: "row", alignItems: "center", gap: space.md },
    dateChip: {
      alignSelf: "flex-start",
      backgroundColor: color.background,
      paddingHorizontal: space.sm,
      borderRadius: 4,
    },
    meta: { flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" },
  }),
);
