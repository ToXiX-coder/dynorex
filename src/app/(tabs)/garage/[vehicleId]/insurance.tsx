import * as Print from "expo-print";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { Platform, Share, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { formatMoney } from "@/domain/money";
import { insuranceHtml, insuranceText, insuranceTotals } from "@/domain/proof";
import type { MappedError } from "@/features/auth/errors";
import { buildService } from "@/features/garage/buildService";
import { recordsService } from "@/features/garage/recordsService";
import type { ModRow, ReceiptRow, VehicleRow } from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";

/**
 * The insurance mod list: every finished mod with brand, part number, date fitted, who fitted it, cost and whether a
 * receipt is kept. Insurers ask for exactly this, and an undeclared mod can sink a claim. It's made on the phone
 * from your own records and only goes where you send it.
 */
export default function InsuranceList() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [mods, setMods] = useState<ModRow[] | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  const load = useCallback(() => {
    void (async () => {
      const v = await buildService.getVehicle(id);
      if (v.ok) setVehicle(v.data);
      // every page of mods (a big build runs past one page)
      const all: ModRow[] = [];
      for (let p = 0; p < 20; p++) {
        const r = await buildService.listMods(id, p);
        if (!r.ok) return setError(r.error);
        all.push(...r.data);
        if (r.data.length < 20) break;
      }
      setMods(all);
      const rc = await recordsService.receipts(id);
      if (rc.ok) setReceipts(rc.data);
    })();
  }, [id]);
  useFocusEffect(load);

  if (mods === null && !error) return <LoadingState label="Making your mod list" />;
  const car = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim_level ? ` ${vehicle.trim_level}` : ""}`
    : "your vehicle";
  const fitted = (mods ?? [])
    .filter((m) => m.status === "complete")
    .sort((a, b) => (a.installed_on ?? "").localeCompare(b.installed_on ?? ""))
    .map((m) => ({ ...m, receipt: receipts.some((r) => r.mod_id === m.id) }));
  const t = insuranceTotals(fitted);
  const madeOn = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  const sharePdf = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: insuranceHtml(car, fitted, madeOn) });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Modifications: ${car}` });
    } catch {
      setError({ key: "server" });
    }
    setBusy(false);
  };
  const shareText = async () => {
    const text = insuranceText(car, fitted, madeOn);
    try {
      await Share.share({ message: text, title: `Modifications: ${car}` });
    } catch {
      setFallback(text); // no share sheet (some browsers): show it to copy
    }
  };

  return (
    <Screen onRefresh={load}>
      <Text variant="caption" muted>
        Insurers want every modification declared, ideally before you fit it, with receipts kept. This list is made from
        your garage on this phone and only goes where you send it. Planned and in-progress mods aren&apos;t included.
      </Text>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {fitted.length === 0 ? (
        <EmptyState
          expression="wrenching"
          message="No finished mods yet"
          detail="Mark a mod complete and it shows up here."
          action={{ title: "Go back", onPress: () => router.back() }}
        />
      ) : (
        <>
          <Card style={{ gap: 2 }}>
            <Text variant="title">{car}</Text>
            <Text>
              {`${t.count} modification${t.count === 1 ? "" : "s"} · ${formatMoney(t.totalMinor, t.currency)} recorded${t.mixedCurrency ? " (other currencies not added)" : ""} · ${t.receipts} with receipts`}
            </Text>
            {t.priced < t.count ? (
              <Text
                variant="caption"
                muted
              >{`${t.count - t.priced} without a cost: add one on the mod so it's covered.`}</Text>
            ) : null}
          </Card>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {Platform.OS !== "web" ? (
              <Button title="Share as PDF" loading={busy} onPress={() => void sharePdf()} />
            ) : null}
            <Button
              title="Share as text"
              variant={Platform.OS === "web" ? "primary" : "secondary"}
              onPress={() => void shareText()}
            />
          </View>
          {fallback ? (
            <InlineNotice title="List ready" body="Copy it from here.">
              <Text selectable>{fallback}</Text>
            </InlineNotice>
          ) : null}
          {fitted.map((m) => (
            <Card key={m.id} style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {m.name}
                </Text>
                {m.cost_minor !== null && m.currency ? (
                  <Text variant="caption">{formatMoney(Number(m.cost_minor), m.currency)}</Text>
                ) : (
                  <Text variant="caption" muted>
                    No cost
                  </Text>
                )}
              </View>
              <Text variant="caption" muted>
                {[
                  m.brand,
                  m.part_number ? `part ${m.part_number}` : null,
                  m.installed_on ? `fitted ${m.installed_on}` : "no fit date",
                  m.installed_odometer != null ? `at ${Number(m.installed_odometer).toLocaleString()} mi` : null,
                  m.installed_by ? `by ${m.installed_by}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text variant="caption" style={{ color: m.receipt ? color.accent : color.textMuted }}>
                {m.receipt ? "Receipt kept" : "No receipt photo"}
              </Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
