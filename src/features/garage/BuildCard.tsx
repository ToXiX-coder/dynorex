import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LogoMark } from "@/components/mascot/Torq";
import { Text } from "@/components/Text";
import { heroStatsFrom } from "@/components/vehicle/HeroHeader";
import { VehicleArt } from "@/components/vehicle/VehicleArt";
import { kindOf } from "@/domain/vehicleKind";
import { buildPath, shareUrl } from "@/domain/deepLinks";
import { formatRange } from "@/domain/specRange";
import { analytics } from "@/services/analytics";
import type { ModRow, SpecEstimateRow, VehicleRow } from "@/services/supabase/database.types";
import { palette } from "@/theme/palette";
import { radius, space } from "@/theme/tokens";
import { bests } from "./PerfBits";
import { perfService } from "./perfService";
import { shareCardImage } from "./shareImage";

// the card is drawn at 360 x 480 points and saved at 3x: 1080 x 1440, a 3:4 portrait post
const W = 360;
const H = 480;

/**
 * A share card for a build: the car, its estimated numbers, best phone-timed 0-60 and newest finished mods, with the
 * Dynorex mark. Always in the brand's dark look, whatever theme the app is in. Every number keeps its "estimate"
 * label, and nothing private (VIN, costs, notes, odometer) is on it.
 */
export function BuildCardButton({
  vehicle,
  estimate,
  mods,
  trigger,
}: {
  vehicle: VehicleRow;
  estimate: SpecEstimateRow | null;
  mods: ModRow[];
  /** how the opener looks (a toolbar button on the vehicle page); a secondary button by default */
  trigger?: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button title="Share card" variant="secondary" onPress={() => setOpen(true)} />
      )}
      {open ? <CardSheet vehicle={vehicle} estimate={estimate} mods={mods} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CardSheet({
  vehicle: v,
  estimate,
  mods,
  onClose,
}: {
  vehicle: VehicleRow;
  estimate: SpecEstimateRow | null;
  mods: ModRow[];
  onClose: () => void;
}) {
  const ref = useRef<View>(null);
  const [zeroSixty, setZeroSixty] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [webImage, setWebImage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void perfService.list(v.id).then((r) => alive && r.ok && setZeroSixty(bests(r.data).zeroSixty));
    return () => {
      alive = false;
    };
  }, [v.id]);

  const stats = heroStatsFrom(estimate).slice(0, 2);
  const done = mods.filter((m) => m.status === "complete").slice(0, 4);
  const name = `${v.year} ${v.make} ${v.model}`;

  const share = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setWebImage(await shareCardImage(ref, { width: W, height: H }, `${v.nickname || name} on Dynorex`));
      analytics.track("build_shared", { share_method: "card" });
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet}>
          {webImage ? (
            <>
              <Image source={{ uri: webImage }} style={styles.card} accessibilityLabel={`Share card for ${name}`} />
              <InlineNotice title="Card ready" body="Right-click or long-press the image to save it." />
            </>
          ) : (
            <View ref={ref} collapsable={false} style={styles.card}>
              <View style={styles.head}>
                <LogoMark size={34} />
                <Text style={styles.kicker}>PROVE YOUR BUILD</Text>
              </View>
              <VehicleArt
                make={v.make}
                model={v.model}
                year={v.year}
                seed={v.id}
                hint={v.nickname}
                kind={kindOf(v)}
                style={styles.art}
                label={false}
              />
              <Text style={styles.title} numberOfLines={1}>
                {v.nickname || `${v.make} ${v.model}`}
              </Text>
              <Text style={styles.sub}>{`${name}${v.trim_level ? ` ${v.trim_level}` : ""}`}</Text>
              <View style={styles.stats}>
                {stats.map((s) => (
                  <Stat key={s.label} value={`${formatRange(s)} ${s.unit}`} label={`${s.label} · est.`} />
                ))}
                {zeroSixty !== null ? <Stat value={`${zeroSixty.toFixed(2)} s`} label="0–60 · phone GPS" /> : null}
              </View>
              {done.length ? (
                <View style={{ gap: 2 }}>
                  {done.map((m) => (
                    <Text key={m.id} style={styles.mod} numberOfLines={1}>
                      {`▸ ${m.name}`}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.foot}>
                <View style={styles.slash} />
                {/* a public build carries its link, so the card brings people back to it */}
                {v.visibility === "public" ? (
                  <Text style={styles.link}>{shareUrl(buildPath(v.id)).replace(/^https:\/\//, "")}</Text>
                ) : null}
                <Text style={styles.small}>Dynorex · estimates from owner-reported data</Text>
              </View>
            </View>
          )}
          {failed ? <InlineError kind="server" /> : null}
          <View style={styles.row}>
            <Button title="Close" variant="secondary" onPress={onClose} />
            {!webImage ? <Button title="Share image" loading={busy} onPress={() => void share()} /> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

// brand colours on purpose (like the intro): the card looks the same whichever theme made it
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)" },
  sheet: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: space.lg, gap: space.md },
  card: {
    width: W,
    height: H,
    maxWidth: "100%",
    backgroundColor: palette.asphaltBlack,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: palette.electricLime, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  art: { height: 130, borderRadius: radius.sm },
  title: { color: palette.boneWhite, fontSize: 24, fontWeight: "900", textTransform: "uppercase", flexShrink: 0 },
  sub: { color: palette.logoGrayLight, fontSize: 13 },
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, backgroundColor: palette.cardSurface, borderRadius: radius.sm, padding: space.sm, gap: 2 },
  statValue: { color: palette.electricLime, fontSize: 15, fontWeight: "800" },
  mod: { color: palette.boneWhite, fontSize: 13 },
  foot: { marginTop: "auto", gap: 6 },
  slash: { width: 90, height: 5, backgroundColor: palette.aggressiveRed, transform: [{ skewX: "-30deg" }] },
  small: { color: palette.logoGrayLight, fontSize: 10 },
  link: { color: palette.electricLime, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", gap: space.sm, justifyContent: "center" },
});
