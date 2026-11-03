import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { categoryLabel } from "@/components/build/BuildBits";
import { carName, COMPLIANCE_LABELS, recordDate } from "@/domain/record";
import type { MappedError } from "@/features/auth/errors";
import { recordService, type LinkView } from "@/features/record/recordService";
import type { ConfirmAnswer } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

const CLOSED: Record<string, string> = {
  closed: "This link has already been used, or the owner made a new one.",
  expired: "This link has expired. Ask the customer to send a new one.",
  changed: "The customer changed this entry after sending the link. Ask them for a new link so you see the current version.",
  not_allowed: "This job can't be confirmed through Dynorex.",
  not_found: "This link doesn't work. Check it was copied in full.",
};

/**
 * dynorex.app/confirm/<token>: the page a shop opens from a customer's one-time link (D-64). No account needed.
 * Shows the job and the car, never the customer's name, VIN, costs or notes. The answer goes on the car's Build
 * Record with the shop name typed here and today's date; Dynorex doesn't check who typed it.
 */
export default function ConfirmJobPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [view, setView] = useState<LinkView | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [form, setForm] = useState({ shopName: "", shopCity: "", odometer: "", note: "" });
  const [busy, setBusy] = useState<"confirmed" | "declined" | null>(null);
  const [done, setDone] = useState<ConfirmAnswer | null>(null);

  useEffect(() => {
    void recordService.linkView(String(token)).then((r) => (r.ok ? setView(r.data) : setError(r.error)));
  }, [token]);

  if (error && !view) return <Screen><InlineError kind={error.key} /></Screen>;
  if (!view) return <LoadingState label="Loading the job" />;
  const status = done ?? view.status;
  if (status === "ok")
    return (
      <Screen>
        <Text variant="display">Thanks</Text>
        <Text>Your answer is on the car&apos;s Build Record with today&apos;s date. This link won&apos;t work again.</Text>
      </Screen>
    );
  if (status !== "open" || !("entry" in view))
    return (
      <Screen>
        <Text variant="display">Link not working</Text>
        <Text muted>{CLOSED[status] ?? CLOSED.not_found}</Text>
      </Screen>
    );

  const e = view.entry;
  const odo = form.odometer.replace(/[,\s]/g, "");
  const ok = form.shopName.trim().length >= 2 && (odo === "" || /^\d{1,7}$/.test(odo));
  const send = async (decision: "confirmed" | "declined") => {
    setBusy(decision);
    setError(null);
    const r = await recordService.confirmByLink(String(token), {
      decision,
      shopName: form.shopName.trim(),
      shopCity: form.shopCity.trim() || null,
      odometer: odo ? Number(odo) : null,
      note: form.note.trim() || null,
    });
    setBusy(null);
    if (r.ok) setDone(r.data);
    else setError(r.error);
  };

  return (
    <Screen>
      <Text variant="display">Did you do this job?</Text>
      <Text muted>
        A customer keeps a record of their car on Dynorex, for when they sell it, and named your shop. Your answer is
        shown on the record with your shop name and the date.
      </Text>
      <Card style={{ gap: space.xs }}>
        <Text variant="caption" muted>
          {carName(view.car)}
        </Text>
        <Text variant="title">{[e.brand, e.title].filter(Boolean).join(" ")}</Text>
        <Text variant="caption">
          {[
            view.entry_type === "mod" ? "Mod" : "Service",
            e.category ? categoryLabel(e.category) : null,
            e.date ? recordDate(e.date) : null,
            e.odometer != null ? `${e.odometer.toLocaleString()} mi` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {e.part_number ? <Text variant="caption">{`Part no. ${e.part_number}`}</Text> : null}
        {e.carb_eo ? <Text variant="caption">{`CARB EO ${e.carb_eo}`}</Text> : null}
        {e.compliance === "stock" ? <Text variant="caption">{COMPLIANCE_LABELS.stock}</Text> : null}
        {e.installed_by ? <Text variant="caption">{`Listed as fitted by ${e.installed_by}`}</Text> : null}
      </Card>
      <TextField
        label="Your shop's name"
        value={form.shopName}
        onChangeText={(t) => setForm({ ...form, shopName: t })}
        maxLength={80}
        required
      />
      <TextField label="City (optional)" value={form.shopCity} onChangeText={(t) => setForm({ ...form, shopCity: t })} maxLength={80} />
      <TextField
        label="Odometer on your work order (optional)"
        value={form.odometer}
        onChangeText={(t) => setForm({ ...form, odometer: t })}
        keyboardType="number-pad"
        hint="Helps a buyer see the mileage lines up."
      />
      <TextField label="Note (optional)" value={form.note} onChangeText={(t) => setForm({ ...form, note: t })} maxLength={280} multiline />
      {error ? <InlineError kind={error.key} /> : null}
      <Button title="Yes, we did this job" loading={busy === "confirmed"} disabled={!ok} onPress={() => void send("confirmed")} />
      <Button
        title="No, this isn't right"
        variant="secondary"
        loading={busy === "declined"}
        disabled={!ok}
        onPress={() => void send("declined")}
      />
      <Text variant="caption" muted>
        Your answer records only what you type here. Dynorex doesn&apos;t inspect cars, and never asks shops to confirm
        emissions-related parts unless the part has a CARB EO number or the factory part went back on.
      </Text>
    </Screen>
  );
}
