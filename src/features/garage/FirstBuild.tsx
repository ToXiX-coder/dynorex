import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card } from "@/components/cards/Card";
import { CheckIcon, ChevronIcon } from "@/components/icons";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { firstBuildSteps, nextFirstBuildStep, type FirstBuildFacts, type FirstBuildStep } from "@/domain/firstBuild";
import { evidence } from "@/domain/record";
import { recordService } from "@/features/record/recordService";
import { analytics } from "@/services/analytics";
import { withPress } from "@/theme/press";
import { color, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { a11yHidden } from "@/utils/a11y";
import { buildService, type VehicleCard } from "./buildService";
import { recordsService } from "./recordsService";

const DISMISSED_KEY = "dynorex:firstbuild:dismissed";

/**
 * Home's "Start your Build Record" checklist: add a car, log a finished mod, back it up, share the record. Each step
 * opens the screen that does it. Hidden once all four are done, or when dismissed (remembered on this phone).
 */
export function FirstBuildChecklist({ cars }: { cars: readonly VehicleCard[] }) {
  const [facts, setFacts] = useState<FirstBuildFacts | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // the newest car still yours to log on (a sold car's record is read-only)
  const car = cars.filter((c) => !c.sold_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const carId = car?.id ?? null;

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => alive && setDismissed(v === "1"))
      .catch(() => alive && setDismissed(false));
    void (async () => {
      if (!carId) return alive && setFacts({ vehicleId: null, finishedMods: 0, backed: 0, shared: false });
      const [mods, rec, link] = await Promise.all([
        buildService.listMods(carId, 0),
        recordService.myRecord(carId),
        recordsService.historyShare(carId),
      ]);
      if (!alive) return;
      setFacts({
        vehicleId: carId,
        finishedMods: mods.ok ? mods.data.filter((m) => m.status === "complete").length : 0,
        backed:
          rec.ok && rec.data
            ? rec.data.entries.filter((e) => !e.removed_at && !e.earlier_owner && evidence(e).level > 0).length
            : 0,
        shared: link.ok && link.data !== null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [carId]);

  if (!facts || dismissed !== false) return null;
  const steps = firstBuildSteps(facts);
  const next = nextFirstBuildStep(steps);
  if (!next) return null;
  const done = steps.filter((s) => s.done).length;

  const open = (s: FirstBuildStep) => {
    analytics.track("first_build_step_opened", { step: s.id });
    if (s.id === "car" || !carId) return router.push("/garage/new");
    if (s.id === "mod") return router.push(`/garage/${carId}/mods/new`);
    // the record's "Next up" card points at the exact entry missing paperwork; the buyer's link lives there too
    router.push({ pathname: "/garage/[vehicleId]/record", params: { vehicleId: carId } });
  };

  return (
    <Card style={{ gap: space.sm }}>
      <SectionHeader>Start your Build Record</SectionHeader>
      {/* progress sits under the title so the title keeps the full width on a phone */}
      <View
        accessible
        accessibilityLabel={`${done} of ${steps.length} steps done`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <View style={{ flex: 1, flexDirection: "row", gap: space.xxs }}>
          {steps.map((s) => (
            <View
              key={s.id}
              style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s.done ? color.accent : color.border }}
            />
          ))}
        </View>
        <Text variant="caption" accent>{`${done} of ${steps.length}`}</Text>
      </View>
      <Text variant="caption" muted>
        Four steps to a record a buyer can weigh when you sell.
      </Text>
      {steps.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          accessibilityLabel={`${s.title}${s.done ? ", done" : ""}. ${s.detail}`}
          accessibilityState={{ checked: s.done }}
          disabled={s.done}
          onPress={() => open(s)}
          style={withPress({ minHeight: touch.min, flexDirection: "row", gap: space.md, alignItems: "center" })}
        >
          {/* a filled disc with a tick when done, an empty ring when not (shape, not just colour) */}
          <View
            {...a11yHidden}
            style={[
              styles.mark,
              s.done ? { backgroundColor: color.accent, borderColor: color.accent } : { borderColor: color.border },
            ]}
          >
            {s.done ? <CheckIcon color={color.onAccent} size={14} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={s.done ? { color: color.textMuted } : undefined}>
              {s.title}
            </Text>
            {s === next ? (
              <Text variant="caption" muted>
                {s.detail}
              </Text>
            ) : null}
          </View>
          {s === next ? <ChevronIcon color={color.textMuted} /> : null}
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setDismissed(true);
          void AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
        }}
        style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <Text variant="caption" muted>
          Hide this
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    mark: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
