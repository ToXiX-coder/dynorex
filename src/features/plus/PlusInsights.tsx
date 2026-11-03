import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { categoryLabel } from "@/components/build/BuildBits";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LockIcon } from "@/components/icons";
import { Text } from "@/components/Text";
import { SPEC_DISCLAIMER } from "@/domain/specs";
import type { MappedError } from "@/features/auth/errors";
import type { AdvancedSpecs, BuildAnalyticsRow } from "@/services/supabase/database.types";
import { color, space, type } from "@/theme/tokens";
import { subscriptionService } from "./subscriptionService";

type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "error"; error: MappedError }
  | { kind: "ready"; specs: AdvancedSpecs; analytics: BuildAnalyticsRow | null };

const signed = (n: number, d = 0) => `${n > 0 ? "+" : ""}${Number(n).toFixed(d)}`;

/**
 * Dynorex+ on the owner's vehicle page: projected specs if every planned mod were done, what each
 * category has added, and build analytics (public builds). The server refuses all of it without
 * Dynorex+; free accounts see what it is and a way to get it.
 */
export function PlusInsights({
  vehicleId,
  isPublic,
  refreshKey,
}: {
  vehicleId: string;
  isPublic: boolean;
  refreshKey?: unknown;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const caps = await subscriptionService.capabilities();
      if (!alive) return;
      if (!caps.ok) return setState({ kind: "error", error: caps.error });
      if (!caps.data?.advanced_specs) return setState({ kind: "locked" });
      const [s, a] = await Promise.all([
        subscriptionService.advancedSpecs(vehicleId),
        isPublic ? subscriptionService.analytics(vehicleId) : Promise.resolve(null),
      ]);
      if (!alive) return;
      if (!s.ok) return setState(s.error.key === "paywall" ? { kind: "locked" } : { kind: "error", error: s.error });
      setState({ kind: "ready", specs: s.data, analytics: a && a.ok ? a.data : null });
    })();
    return () => {
      alive = false;
    };
  }, [vehicleId, isPublic, refreshKey]);

  if (state.kind === "loading" || (state.kind === "error" && state.error.key === "notConnected")) return null;
  if (state.kind === "error") return <InlineError kind={state.error.key} />;
  if (state.kind === "locked") {
    return (
      <Card featured>
        <View style={styles.head}>
          <LockIcon color={color.textMuted} />
          <Text variant="section">Dynorex+ insights</Text>
        </View>
        <Text muted>
          See where your build is heading once every planned mod is done, what each category has added, and how many
          people view and follow your build.
        </Text>
        <Button title="See Dynorex+" onPress={() => router.push("/plus?source=vehicle")} />
      </Card>
    );
  }

  const p = state.specs.projected;
  const a = state.analytics;
  const tile = (label: string, value: number | null, unit: string, d = 0) => (
    <View
      key={label}
      style={styles.tile}
      accessible
      accessibilityLabel={value === null ? `${label}: unknown` : `${label}: about ${value} ${unit}`}
    >
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text style={type.spec}>{value === null ? "—" : Number(value).toFixed(d)}</Text>
      <Text variant="caption" muted>
        {unit}
      </Text>
    </View>
  );
  return (
    <Card featured>
      <Text variant="section" accessibilityRole="header">
        Dynorex+ insights
      </Text>
      <Text variant="label">{`If all ${state.specs.pending_mods} planned or in-progress mods were done`}</Text>
      <View style={styles.grid}>
        {tile("HP", p.hp, "hp")}
        {tile("Torque", p.torque_lbft, "lb-ft")}
        {tile("Weight", p.weight_lb, "lb")}
        {tile("0–60", p.zero_to_sixty_s, "s", 1)}
        {tile("Power-to-weight", p.lb_per_hp, "lb/hp", 1)}
      </View>
      <Text variant="caption" muted>
        {SPEC_DISCLAIMER}
      </Text>
      {state.specs.by_category.length ? (
        <View style={{ gap: space.xxs }}>
          <Text variant="label">Added so far, by category</Text>
          {state.specs.by_category.map((c) => (
            <Text key={c.category} variant="caption">
              {`${categoryLabel(c.category)} (${c.mods}): ${signed(c.hp)} hp, ${signed(c.torque_lbft)} lb-ft, ${signed(c.weight_lb)} lb`}
            </Text>
          ))}
        </View>
      ) : null}
      {a ? (
        <View style={{ gap: space.xxs }}>
          <Text variant="label">Build analytics</Text>
          <Text variant="caption">{`Views (signed-in people): ${a.views_7d} this week · ${a.views_30d} in 30 days`}</Text>
          <Text variant="caption">{`Followers: ${a.followers} (+${a.new_followers_7d} this week, +${a.new_followers_30d} in 30 days)`}</Text>
          <Text variant="caption">{`Torq sticker reactions: ${a.reactions}`}</Text>
          <Text variant="caption" muted>
            Totals only: Dynorex never shows who viewed your build.
          </Text>
        </View>
      ) : (
        <Text variant="caption" muted>
          Make this build public to see views and followers.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { flexBasis: "30%", flexGrow: 1, gap: 2 },
});
