import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LogoMark } from "@/components/mascot/Torq";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { buildWrapped, type Wrapped } from "@/domain/wrapped";
import { buildService, PAGE_SIZE } from "@/features/garage/buildService";
import { maintenanceService } from "@/features/garage/maintenanceService";
import { perfService } from "@/features/garage/perfService";
import { shareCardImage } from "@/features/garage/shareImage";
import { eventService } from "@/features/paddock/eventService";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";
import type { ModRow } from "@/services/supabase/database.types";
import { palette } from "@/theme/palette";
import { radius, space } from "@/theme/tokens";

// drawn at 360 x 480 and saved at 3x like the build card: a 1080 x 1440 portrait post
const W = 360;
const H = 480;

/** Every mod on a car, page by page (the timeline loads 20 at a time). */
async function allMods(vehicleId: string): Promise<ModRow[]> {
  const out: ModRow[] = [];
  for (let page = 0; page < 50; page++) {
    const r = await buildService.listMods(vehicleId, page);
    if (!r.ok) throw r.error;
    out.push(...r.data);
    if (r.data.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * D-68 "Build Wrapped": the owner's year in the garage as a card to share. Counted on the phone from their own logs
 * (see domain/wrapped.ts); the card never shows costs, VINs, mileage readings or places.
 */
export default function WrappedScreen() {
  const flags = useFlags();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  // the year a result belongs to, so switching years shows loading instead of last year's card
  const [loaded, setLoaded] = useState<{ year: number; w: Wrapped } | null>(null);
  const data = loaded?.year === year ? loaded.w : null;
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [webImage, setWebImage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<View>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cars = await buildService.listVehicles(0);
        if (!cars.ok) throw cars.error;
        const [mods, services, runs, meets] = await Promise.all([
          Promise.all(cars.data.map((c) => allMods(c.id))).then((x) => x.flat()),
          maintenanceService.list(),
          Promise.all(cars.data.map((c) => perfService.list(c.id))),
          flags.paddock ? eventService.myCheckinCount(`${year}-01-01T00:00:00Z`, `${year + 1}-01-01T00:00:00Z`) : null,
        ]);
        if (!services.ok) throw services.error;
        const w = buildWrapped({
          year,
          cars: cars.data.map((c) => ({ id: c.id, sold: Boolean(c.sold_at) })),
          mods,
          services: services.data,
          runs: runs.flatMap((r) => (r.ok ? r.data : [])).filter((r) => r.ran_at.startsWith(String(year))).length,
          meets: meets && meets.ok ? meets.data : null,
        });
        if (alive) setLoaded({ year, w });
      } catch (e) {
        if (alive) setError(((e as { key?: ErrorKey })?.key ?? "server") as ErrorKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [year, flags.paddock, attempt]);

  if (error)
    return (
      <ErrorState
        kind={error}
        onAction={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!data) return <LoadingState label="Counting your year" />;

  const share = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setWebImage(await shareCardImage(ref, { width: W, height: H }, `My ${year} in the garage`));
      analytics.track("build_shared", { share_method: "card" });
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const stats: { value: string; label: string }[] = [
    data.hpAdded !== null
      ? { value: `${data.hpAdded > 0 ? "+" : ""}${data.hpAdded} hp`, label: "by my own numbers" }
      : null,
    { value: String(data.services), label: data.services === 1 ? "service logged" : "services logged" },
    data.miles !== null ? { value: `${data.miles.toLocaleString()} mi`, label: "between my logged readings" } : null,
    data.runs ? { value: String(data.runs), label: data.runs === 1 ? "run timed" : "runs timed" } : null,
    data.meets ? { value: String(data.meets), label: data.meets === 1 ? "meet" : "meets" } : null,
  ].filter((s): s is { value: string; label: string } => s !== null);

  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="tablist">
        {[thisYear, thisYear - 1].map((y) => (
          <Chip
            key={y}
            label={String(y)}
            selected={year === y}
            onPress={() => {
              setYear(y);
              setWebImage(null);
            }}
          />
        ))}
      </View>
      {data.empty ? (
        <EmptyState
          expression="shrugging"
          message={`Nothing logged in ${year} yet`}
          detail="Finish a mod or log a service and your year starts filling in."
        />
      ) : webImage ? (
        <>
          <Image source={{ uri: webImage }} style={styles.card} accessibilityLabel={`Your ${year} in the garage`} />
          <InlineNotice title="Card ready" body="Right-click or long-press the image to save it." />
        </>
      ) : (
        <View
          ref={ref}
          collapsable={false}
          style={styles.card}
          accessible
          accessibilityLabel={`Your ${year} in the garage: ${data.modsFinished} mods finished. ${stats.map((s) => `${s.value} ${s.label}`).join(". ")}`}
        >
          <View style={styles.head}>
            <LogoMark size={34} />
            <Text style={styles.kicker}>{`MY ${year} IN THE GARAGE`}</Text>
          </View>
          <View style={styles.slash} />
          <View>
            <Text style={styles.big}>{String(data.modsFinished)}</Text>
            <Text style={styles.bigLabel}>{data.modsFinished === 1 ? "mod finished" : "mods finished"}</Text>
          </View>
          <View style={styles.grid}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.small}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 2 }}>
            {data.topCategory ? (
              <Text style={styles.line}>{`Most work on: ${data.topCategory.label} (${data.topCategory.count})`}</Text>
            ) : null}
            {data.busiestMonth ? <Text style={styles.line}>{`Busiest month: ${data.busiestMonth}`}</Text> : null}
            {data.newestMod ? <Text style={styles.line} numberOfLines={1}>{`Latest: ${data.newestMod}`}</Text> : null}
          </View>
          <Text style={[styles.small, { marginTop: "auto" }]}>
            {`Dynorex · counted from my own logs across ${data.cars} ${data.cars === 1 ? "car" : "cars"}`}
          </Text>
        </View>
      )}
      {failed ? <InlineError kind="server" /> : null}
      {!data.empty && !webImage ? <Button title="Share image" loading={busy} onPress={() => void share()} /> : null}
      <Text variant="caption" muted>
        Made on your phone from what you logged. Power is your own per-mod numbers added up, not a measurement. No
        costs, VIN or places are on the card.
      </Text>
    </Screen>
  );
}

// brand colours on purpose, like the build card: it looks the same whichever theme made it
const styles = StyleSheet.create({
  card: {
    width: W,
    height: H,
    maxWidth: "100%",
    alignSelf: "center",
    backgroundColor: palette.asphaltBlack,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: palette.electricLime, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  slash: { width: 120, height: 6, backgroundColor: palette.aggressiveRed, transform: [{ skewX: "-30deg" }] },
  big: { color: palette.electricLime, fontSize: 72, lineHeight: 74, fontWeight: "900" },
  bigLabel: { color: palette.boneWhite, fontSize: 18, fontWeight: "800", textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: palette.cardSurface,
    borderRadius: radius.sm,
    padding: space.sm,
    gap: 2,
  },
  statValue: { color: palette.electricLime, fontSize: 18, fontWeight: "800" },
  line: { color: palette.boneWhite, fontSize: 13 },
  small: { color: palette.logoGrayLight, fontSize: 10 },
});
