import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice, TextLink } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { Torq } from "@/components/mascot/Torq";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { ERROR_COPY, type ErrorKey } from "@/domain/copy/errors";
import { LIST_PRICES, PLAN_COMPARISON, planRowLive, renewalDisclosure, type PlanId } from "@/domain/plus";
import { subscriptionService } from "@/features/plus/subscriptionService";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";
import { store } from "@/services/purchases/store";
import type { StorePlan } from "@/services/purchases/types";
import type { MySubscriptionRow } from "@/services/supabase/database.types";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { backOr } from "@/components/navigation/stackOptions";
import { RadioIcon } from "@/components/icons";

type Phase = "idle" | "buying" | "confirming" | "done";

/**
 * Dynorex+ paywall. Prices come from the store (the spec's list prices are shown only when the store
 * isn't reachable, and labeled as such). Renewal terms and how to cancel are on screen before buying.
 * "You're on Dynorex+" appears only after the SERVER has confirmed the purchase.
 */
export default function Paywall() {
  const flags = useFlags();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = /^[a-z0-9_/]{1,64}$/.test(String(params.source ?? "")) ? String(params.source) : "unknown";
  const fromLimit = source !== "settings" && source !== "unknown";
  const [sub, setSub] = useState<MySubscriptionRow | null>(null);
  const [plans, setPlans] = useState<StorePlan[] | null | undefined>(undefined);
  const [plan, setPlan] = useState<PlanId>("annual");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([subscriptionService.mySubscription(), store.plans()]).then(([s, p]) => {
      if (!alive) return;
      setSub(s.ok ? s.data : null);
      setPlans(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const close = () => {
    if (phase !== "done") analytics.track("paywall_dismissed", { source_screen: source });
    backOr();
  };

  /** The store took payment; Dynorex+ is on only once the server says so. */
  const confirmWithServer = async (): Promise<boolean> => {
    setPhase("confirming");
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await subscriptionService.sync();
      if (r.ok && r.data.plus) {
        setSub(r.data);
        setPhase("done");
        return true;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    setPhase("idle");
    setError("purchasePending");
    return false;
  };

  const buy = async () => {
    setError(null);
    analytics.track("upgrade_tapped", { source_screen: source });
    setPhase("buying");
    const r = await store.purchase(plan);
    if (!r.ok) {
      setPhase("idle");
      if (!r.cancelled) setError("saveFailed");
      return;
    }
    if (await confirmWithServer())
      analytics.track("subscription_started", { plan: plan === "annual" ? "annual" : "monthly" });
  };

  const restore = async () => {
    setError(null);
    setRestored(null);
    const ok = await store.restore();
    if (!ok) return setError("saveFailed");
    const r = await subscriptionService.sync();
    if (!r.ok) return setError(r.error.key);
    setSub(r.data);
    setRestored(r.data.plus ? "Dynorex+ restored." : "No Dynorex+ purchase found for this store account.");
  };

  if (sub === null && plans === undefined) return <LoadingState label="Loading Dynorex+" />;

  const priceOf = (id: PlanId) => plans?.find((p) => p.id === id)?.priceString ?? null;
  const shownPrice = (id: PlanId) => priceOf(id) ?? LIST_PRICES[id].price;
  const onSale = flags.subscriptions && store.availability !== "unavailable";
  const why = !flags.subscriptions
    ? "Dynorex+ isn't on sale yet. Free limits stay as they are until it is."
    : store.availability === "unavailable"
      ? "Buy Dynorex+ in the Dynorex app for iPhone or Android (store purchases only)."
      : plans === null
        ? "Couldn't reach the store for prices. Check your connection and try again."
        : null;

  if (phase === "done" || sub?.plus) {
    return (
      <Screen>
        <View style={styles.center}>
          <Torq expression="excited" size={140} />
          <Text variant="display" accessibilityRole="header">
            {"You're on Dynorex+"}
          </Text>
          <Text muted style={{ textAlign: "center" }}>
            Unlimited vehicles and mods, advanced specs, build analytics, all 12 Torq stickers and your badge are on.
          </Text>
        </View>
        <Button title="Done" fullWidth onPress={() => backOr()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.center}>
        <Torq expression="upgrade" size={120} />
        <Text variant="display" accessibilityRole="header" style={{ textAlign: "center" }}>
          {fromLimit ? ERROR_COPY.paywall.title : "Dynorex+"}
        </Text>
        <Text muted style={{ textAlign: "center" }}>
          {ERROR_COPY.paywall.body}
        </Text>
      </View>

      <Card>
        <View style={styles.compareHead} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="label" style={{ flex: 1.3 }}>
            {" "}
          </Text>
          <Text variant="label" style={styles.col}>
            Free
          </Text>
          <Text variant="label" accent style={styles.col}>
            Dynorex+
          </Text>
        </View>
        {PLAN_COMPARISON.map((r) => ({ ...r, available: planRowLive(r.available, flags) })).map((r) => (
          <View
            key={r.feature}
            style={styles.compareRow}
            accessible
            accessibilityLabel={`${r.feature}: Free, ${r.free}. Dynorex+, ${r.plus}${r.available ? "" : ". Coming later"}`}
          >
            <Text style={{ flex: 1.3 }}>
              {r.feature}
              {r.available ? "" : " (later)"}
            </Text>
            <Text variant="caption" muted style={styles.col}>
              {r.free}
            </Text>
            <Text variant="caption" style={styles.col}>
              {r.plus}
            </Text>
          </View>
        ))}
      </Card>

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Choose a plan">
        {(["annual", "monthly"] as const).map((id) => {
          const selected = plan === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !onSale }}
              accessibilityLabel={`${id === "annual" ? "Yearly" : "Monthly"}, ${shownPrice(id)} per ${LIST_PRICES[id].cadence}, renews automatically`}
              onPress={() => setPlan(id)}
              style={[styles.plan, selected && styles.planOn]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <RadioIcon on={selected} color={selected ? color.accent : color.text} />
                <Text variant="title">{id === "annual" ? "Yearly" : "Monthly"}</Text>
              </View>
              <Text variant="title" accent={selected}>{`${shownPrice(id)}${LIST_PRICES[id].per}`}</Text>
            </Pressable>
          );
        })}
        {!priceOf(plan) ? (
          <Text variant="caption" muted>
            US list price shown. Your store shows the exact price in your currency before you confirm.
          </Text>
        ) : null}
      </View>

      <Text variant="caption" muted>
        {renewalDisclosure(plan, shownPrice(plan), store.platform)}
      </Text>
      {why ? <InlineNotice headsUp title="Not available here" body={why} /> : null}
      {store.availability === "demo" ? (
        <InlineNotice headsUp title="Pitch mode" body="No store is contacted and nothing is charged." />
      ) : null}
      {error ? (
        <InlineError kind={error} onAction={error === "purchasePending" ? () => void confirmWithServer() : undefined} />
      ) : null}
      {restored ? <InlineNotice title={restored} /> : null}

      <Button
        title={
          phase === "confirming"
            ? "Confirming with the store…"
            : `Subscribe for ${shownPrice(plan)}${LIST_PRICES[plan].per}`
        }
        fullWidth
        disabled={!onSale || plans === null}
        loading={phase === "buying" || phase === "confirming"}
        onPress={() => void buy()}
      />
      <Button
        title="Restore purchases"
        variant="secondary"
        fullWidth
        disabled={!onSale}
        onPress={() => void restore()}
      />
      <Button title="Not now" variant="secondary" fullWidth onPress={close} />
      <View style={styles.links}>
        <TextLink title="Terms and privacy" onPress={() => router.push("/settings/about")} />
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    center: { alignItems: "center", gap: space.sm },
    compareHead: { flexDirection: "row", gap: space.sm },
    compareRow: { flexDirection: "row", gap: space.sm, alignItems: "center", minHeight: 32 },
    col: { flex: 1 },
    plan: {
      minHeight: touch.min,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: border.regular,
      borderColor: color.border,
      backgroundColor: color.surface,
    },
    planOn: { borderColor: color.accent, borderWidth: border.focus },
    links: { alignItems: "center" },
  }),
);
