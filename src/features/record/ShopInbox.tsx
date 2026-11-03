import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { categoryLabel } from "@/components/build/BuildBits";
import { carName, recordDate } from "@/domain/record";
import type { MappedError } from "@/features/auth/errors";
import type { ShopConfirmRequest } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";
import { recordService } from "./recordService";

/**
 * For a shop on Dynorex (D-64): customers asking you to confirm work you did on their car. Your answer goes on their
 * Build Record under your business name. You see the job and the customer's username, never their VIN or costs.
 */
export function ShopInbox() {
  const [rows, setRows] = useState<ShopConfirmRequest[] | null>(null);
  const load = useCallback(() => {
    void recordService.shopRequests().then((r) => setRows(r.ok ? r.data : []));
  }, []);
  useFocusEffect(load);
  if (!rows) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>Jobs to confirm</SectionHeader>
      <Text variant="caption" muted>
        Customers who keep a Build Record ask you to confirm work you did. Your answer shows on their record with your
        business name and the date, and helps their car sell. You&apos;re never asked about emissions parts without a
        CARB EO number.
      </Text>
      {rows.length === 0 ? <Text muted>Nothing waiting.</Text> : null}
      {rows.map((r) => (
        <Request key={r.request_id} r={r} onDone={load} />
      ))}
    </View>
  );
}

function Request({ r, onDone }: { r: ShopConfirmRequest; onDone: () => void }) {
  const [odometer, setOdometer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"confirmed" | "declined" | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const e = r.job.entry;
  const odo = odometer.replace(/[,\s]/g, "");
  const answer = async (decision: "confirmed" | "declined") => {
    setBusy(decision);
    setError(null);
    const res = await recordService.answerRequest(r.request_id, decision, odo ? Number(odo) : null, note.trim() || null);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    if (res.data === "ok") return onDone();
    setResult(res.data === "changed" ? "The customer changed this entry since asking. They'll need to ask again." : "This request is closed.");
  };
  return (
    <Card style={{ gap: space.xs }}>
      <Text variant="caption" muted>
        {`${r.customer ? `@${r.customer}` : "A customer"} · asked ${recordDate(r.requested_at)} · ${carName(r.job.car)}`}
      </Text>
      <Text variant="title">{[e.brand, e.title].filter(Boolean).join(" ")}</Text>
      <Text variant="caption">
        {[
          r.job.entry_type === "mod" ? "Mod" : "Service",
          e.category ? categoryLabel(e.category) : null,
          e.date ? recordDate(e.date) : null,
          e.part_number ? `part no. ${e.part_number}` : null,
          e.carb_eo ? `CARB EO ${e.carb_eo}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {r.status !== "open" || result ? (
        <Text muted>{result ?? "The customer changed this entry since asking. They'll need to ask again."}</Text>
      ) : (
        <>
          <TextField
            label="Odometer on your work order (optional)"
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="number-pad"
          />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} />
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button title="We did this job" loading={busy === "confirmed"} onPress={() => void answer("confirmed")} />
            <Button
              title="Not ours"
              variant="secondary"
              loading={busy === "declined"}
              onPress={() => void answer("declined")}
            />
          </View>
        </>
      )}
      {error ? <InlineError kind={error.key} /> : null}
    </Card>
  );
}
