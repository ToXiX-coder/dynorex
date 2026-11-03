import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { CostChart } from "@/components/build/CostChart";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LastUpdated } from "@/components/feedback/OfflineBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { budgetStatus, CURRENCIES, formatMoney, minorDigits, parseMoney, summariseCosts, type Currency } from "@/domain/money";
import { buildService } from "@/features/garage/buildService";
import { useAction } from "@/hooks/useAction";
import { useCachedLoad } from "@/hooks/useCachedLoad";
import type { VehicleRow } from "@/services/supabase/database.types";
import { a11yHidden } from "@/utils/a11y";
import { color, radius, space } from "@/theme/tokens";

/** Spent vs planned, per currency (never added together), with a category chart and text legend. */
export default function Costs() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const { data, loading, error, refresh, staleLabel } = useCachedLoad(`costs:${id}`, () =>
    buildService.costSummary(id),
  );
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void buildService.getVehicle(id).then((r) => alive && r.ok && setVehicle(r.data));
    return () => {
      alive = false;
    };
  }, [id, reload]);

  if (!data && loading) return <LoadingState label="Adding up costs" />;
  if (!data && error)
    return (
      <Screen>
        <ErrorState kind={error.key} onAction={() => void refresh()} />
      </Screen>
    );

  const groups = summariseCosts(
    (data ?? []).map((r) => ({ ...r, spent_minor: Number(r.spent_minor), planned_minor: Number(r.planned_minor) })),
  );
  return (
    <Screen>
      <LastUpdated label={staleLabel} />
      {error && data ? <InlineError kind={error.key} onAction={() => void refresh()} /> : null}
      <Text variant="caption" muted>
        Spent counts mods that are Complete or In Progress. Planned counts mods still Planned. Mods without a cost
        aren&apos;t included. Different currencies are shown separately.
      </Text>
      {vehicle && !vehicle.sold_at ? (
        <BudgetCard vehicle={vehicle} groups={groups} onSaved={() => setReload((n) => n + 1)} />
      ) : null}
      {groups.length === 0 ? (
        <EmptyState expression="neutral" message="No costs yet" detail="Add a cost to a mod and it shows up here." />
      ) : (
        groups.map((g) => (
          <Card key={g.currency} style={{ gap: space.md }}>
            <Text variant="title" accessibilityRole="header">
              {g.currency}
            </Text>
            <View style={{ flexDirection: "row", gap: space.xl }}>
              <View accessible accessibilityLabel={`Spent ${formatMoney(g.spent, g.currency)}`}>
                <Text variant="caption" muted>
                  Spent
                </Text>
                <Text variant="heading">{formatMoney(g.spent, g.currency)}</Text>
              </View>
              <View accessible accessibilityLabel={`Planned ${formatMoney(g.planned, g.currency)}`}>
                <Text variant="caption" muted>
                  Planned
                </Text>
                <Text variant="heading">{formatMoney(g.planned, g.currency)}</Text>
              </View>
            </View>
            {g.categories.length ? <CostChart currency={g.currency} categories={g.categories} /> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

/**
 * D-68: the car's build budget, private like every cost. Measured against spent and planned in the budget's own
 * currency; a bar shows how much is gone, with the words beside it (never colour alone).
 */
function BudgetCard({
  vehicle,
  groups,
  onSaved,
}: {
  vehicle: VehicleRow;
  groups: ReturnType<typeof summariseCosts>;
  onSaved: () => void;
}) {
  const budget = vehicle.budget_minor != null && vehicle.budget_currency ? Number(vehicle.budget_minor) : null;
  const cur = (vehicle.budget_currency ?? groups[0]?.currency ?? "USD") as Currency;
  const [editing, setEditing] = useState(false);
  const [currency, setCurrency] = useState<Currency>(cur);
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useAction(buildService.setBudget);

  const open = () => {
    setCurrency(cur);
    setAmount(budget !== null ? (budget / 10 ** minorDigits(cur)).toFixed(minorDigits(cur)) : "");
    setProblem(null);
    setEditing(true);
  };
  const submit = async (clear = false) => {
    let next: { minor: number; currency: string } | null = null;
    if (!clear) {
      const minor = parseMoney(amount, currency);
      if (minor === null || Number.isNaN(minor) || minor <= 0) return setProblem("Enter an amount like 15,000");
      next = { minor, currency };
    }
    const r = await save.run(vehicle.id, next);
    if (!r?.ok) return;
    setEditing(false);
    onSaved();
  };

  if (editing) {
    return (
      <Card style={{ gap: space.sm }}>
        <Text variant="title">Build budget</Text>
        <TextField
          label={`Budget (${currency})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoFocus
          hint="Private, like your costs. Never on your public build or Build Record."
          error={problem ?? undefined}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </ScrollView>
        {save.error ? <InlineError kind={save.error.key} /> : null}
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button title="Save" loading={save.busy} onPress={() => void submit()} />
          <Button title="Cancel" variant="secondary" disabled={save.busy} onPress={() => setEditing(false)} />
          {budget !== null ? (
            <Button title="Remove" variant="secondary" disabled={save.busy} onPress={() => void submit(true)} />
          ) : null}
        </View>
      </Card>
    );
  }

  if (budget === null) {
    return (
      <Card style={{ gap: space.sm }}>
        <Text variant="title">Build budget</Text>
        <Text variant="caption" muted>
          Set what you plan to spend on this car, and see how much is left as you add mods.
        </Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Button title="Set a budget" variant="secondary" onPress={open} />
        </View>
      </Card>
    );
  }

  const g = groups.find((x) => x.currency === cur);
  const s = budgetStatus(budget, g?.spent ?? 0, g?.planned ?? 0);
  const others = groups.filter((x) => x.currency !== cur).map((x) => x.currency);
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="title">{`Budget ${formatMoney(budget, cur)}`}</Text>
        <Button title="Change" variant="secondary" onPress={open} />
      </View>
      {/* spent, then planned, then what's left: the words below carry the same numbers */}
      <View {...a11yHidden} style={{ flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", backgroundColor: color.border }}>
        <View style={{ flex: s.spentShare, backgroundColor: s.over ? color.danger : color.accent }} />
        <View style={{ flex: s.plannedShare, backgroundColor: color.accent, opacity: 0.45 }} />
        <View style={{ flex: Math.max(0, 1 - s.spentShare - s.plannedShare) }} />
      </View>
      <Text>
        {`${formatMoney(g?.spent ?? 0, cur)} spent · ${formatMoney(g?.planned ?? 0, cur)} planned`}
      </Text>
      <Text variant="bodyStrong" style={s.over ? undefined : { color: color.accent }}>
        {s.over ? `Over by ${formatMoney(-s.left, cur)} counting planned mods` : `${formatMoney(s.left, cur)} left`}
      </Text>
      {others.length ? (
        <Text variant="caption" muted>
          {`Costs in ${others.join(", ")} aren't counted against a ${cur} budget.`}
        </Text>
      ) : null}
    </Card>
  );
}
