import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { CategoryIcon, StatusChip, categoryLabel } from "@/components/build/BuildBits";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { GetAppBanner } from "@/components/feedback/GetAppBanner";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { buildPath, isUuid } from "@/domain/deepLinks";
import { dayText } from "@/domain/when";
import type { ModCategoryId, ModStatusId } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { socialService, type PublicMod, type PublicPhoto } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import { color, layout, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * dynorex.app/build/:vehicleId/mod/:modId: one public mod. Shows only public fields (no cost, notes or
 * spec inputs) and photos signed through the public media path. Anything not public is "not found".
 */
export default function PublicModScreen() {
  const { vehicleId, modId } = useLocalSearchParams<{ vehicleId: string; modId: string }>();
  const vid = String(vehicleId ?? "");
  const mid = String(modId ?? "");
  const { status } = useAuth();
  const [state, setState] = useState<"loading" | "missing" | MappedError | { mod: PublicMod; photos: PublicPhoto[] }>(
    "loading",
  );
  const [reporting, setReporting] = useState(false);

  const fetchMod = useCallback(
    async () => (isUuid(vid) && isUuid(mid) ? socialService.publicMod(vid, mid) : { ok: true as const, data: null }),
    [vid, mid],
  );
  const apply = useCallback((r: Awaited<ReturnType<typeof fetchMod>>) => {
    if (!r.ok) return setState(r.error.key === "notConnected" ? "missing" : r.error);
    setState(r.data ?? "missing");
  }, []);
  const load = () => fetchMod().then(apply);
  useEffect(() => {
    let alive = true;
    void fetchMod().then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [fetchMod, apply]);

  const loaded = typeof state === "object" && "mod" in state ? state : null;
  const media = usePublicMedia([], loaded?.photos.map((p) => p.photo_id) ?? []);

  if (state === "loading") return <LoadingState label="Loading mod" />;
  if (state === "missing")
    return (
      <View style={styles.pad}>
        <ErrorState kind="buildNotFound" onAction={() => router.replace(buildPath(vid))} />
      </View>
    );
  if (!loaded)
    return (
      <View style={styles.pad}>
        <ErrorState kind={(state as MappedError).key} onAction={() => void load()} />
      </View>
    );

  const { mod: m, photos } = loaded;
  const groups: { label: string; items: PublicPhoto[] }[] = [
    { label: "Before", items: photos.filter((p) => p.role === "before") },
    { label: "After", items: photos.filter((p) => p.role === "after") },
    { label: "More photos", items: photos.filter((p) => p.role === "gallery") },
  ].filter((g) => g.items.length > 0);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.pad}
    >
      <Stack.Screen options={{ title: m.name }} />
      <GetAppBanner />
      <View style={styles.head}>
        <CategoryIcon id={m.category as ModCategoryId} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="display">{m.name}</Text>
          <StatusChip status={m.status as ModStatusId} />
        </View>
      </View>
      <Card>
        <Row label="Category" value={categoryLabel(m.category)} />
        {m.brand ? <Row label="Brand" value={m.brand} /> : null}
        {m.part_number ? <Row label="Part number" value={m.part_number} /> : null}
        <Row label="Date" value={dayText(m.installed_on ?? m.created_at)} />
      </Card>
      {groups.map((g) => (
        <View key={g.label} style={{ gap: space.sm }}>
          <Text variant="heading" accessibilityRole="header">
            {g.label}
          </Text>
          {g.items.map((p, i) => (
            <PublicImage
              key={p.photo_id}
              uri={media.photos[p.photo_id]}
              alt={`${g.label} photo ${i + 1} of ${m.name}`}
              style={[styles.photo, p.width && p.height ? { aspectRatio: p.width / p.height } : null]}
            />
          ))}
        </View>
      ))}
      <Button title="See the whole build" variant="secondary" onPress={() => router.push(buildPath(vid))} />
      {status === "signedIn" ? (
        <Button title="Report this mod" variant="secondary" onPress={() => setReporting(true)} />
      ) : null}
      <ReportSheet visible={reporting} target={{ type: "mod", id: m.mod_id }} onClose={() => setReporting(false)} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text muted>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pad: { padding: layout.screenGutter, gap: space.lg, backgroundColor: color.background },
    head: { flexDirection: "row", gap: space.md, alignItems: "center" },
    row: { flexDirection: "row", justifyContent: "space-between", minHeight: 32, alignItems: "center", gap: space.md },
    photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md },
  }),
);
