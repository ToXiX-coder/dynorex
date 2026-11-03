import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { carTitle } from "@/domain/buildSheet";
import { isToken } from "@/domain/codes";
import { categoryLabel, isEmissionsCategory } from "@/domain/compliance";
import { KIND_LABELS } from "@/domain/entryForm";
import { formatDate } from "@/domain/evidence";
import { formatMiles, toMiles } from "@/domain/odometer";
import type { ConfirmResult, ShopLinkStatus, ShopView } from "@/services/api";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { useLoad } from "@/ui/hooks";
import { Button, Card, Field, Loading, Notice, Screen, T } from "@/ui/kit";

/** The page a shop opens from the owner's link. No account; it works once. */
export default function ShopConfirmScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { data, error } = useLoad(
    async (api): Promise<ShopView> => (isToken(token) ? api.shopView(token) : { status: "not_found" }),
    [token],
  );
  const [form, setForm] = useState({ shopName: "", shopCity: "", odometer: "", note: "" });
  const [busy, setBusy] = useState<"confirmed" | "declined" | null>(null);
  const [done, setDone] = useState<ConfirmResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  const status: ShopLinkStatus | ConfirmResult = done ?? data.status;
  if (status !== "open" && status !== "ok") return <Screen><Closed status={status} /></Screen>;
  if (status === "ok")
    return (
      <Screen>
        <T v="title">Thanks</T>
        <T>Your answer is on the car&apos;s record with today&apos;s date. This link won&apos;t work again.</T>
      </Screen>
    );
  const e = data.entry!;
  const odo = form.odometer.replace(/[,\s]/g, "");
  const ok = form.shopName.trim().length >= 2 && (odo === "" || /^\d{1,7}$/.test(odo));

  async function send(decision: "confirmed" | "declined") {
    setBusy(decision);
    setFailure(null);
    try {
      setDone(
        await getApi()!.confirmInstall(token, {
          decision,
          shopName: form.shopName.trim(),
          shopCity: form.shopCity.trim() || null,
          odometer: odo ? Number(odo) : null,
          note: form.note.trim() || null,
        }),
      );
    } catch (x) {
      setFailure(errorText(x));
    }
    setBusy(null);
  }

  return (
    <Screen>
      <T v="title">Did your shop do this work?</T>
      <T muted>
        A customer is keeping a record of their car for when they sell it, and named your shop. Your answer is shown on
        the record with your shop name and the date.
      </T>
      <Card>
        <T v="label">{carTitle(data.car!)}</T>
        <T v="heading">{[e.partBrand, e.title].filter(Boolean).join(" ")}</T>
        <T v="small">
          {KIND_LABELS[e.kind]} · {categoryLabel(e.category)}
        </T>
        {e.partNumber ? <T v="small">Part no. {e.partNumber}</T> : null}
        {isEmissionsCategory(e.category) && e.carbEo ? <T v="small">CARB EO {e.carbEo}</T> : null}
        <T v="small">
          {formatDate(e.performedOn)}
          {e.odometer != null ? ` · ${formatMiles(toMiles(e.odometer, e.odometerUnit))}` : ""}
          {e.installerName ? ` · listed as ${e.installerName}` : ""}
        </T>
      </Card>
      <Field label="Your shop's name" value={form.shopName} onChangeText={(x) => setForm({ ...form, shopName: x })} maxLength={80} />
      <Field label="City (optional)" value={form.shopCity} onChangeText={(x) => setForm({ ...form, shopCity: x })} maxLength={60} />
      <Field
        label="Odometer on your work order (optional)"
        value={form.odometer}
        onChangeText={(x) => setForm({ ...form, odometer: x })}
        keyboardType="number-pad"
        hint="Helps a buyer see the mileage lines up."
      />
      <Field label="Note (optional)" value={form.note} onChangeText={(x) => setForm({ ...form, note: x })} maxLength={280} multiline />
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      <Button label="Yes, we did this work" busy={busy === "confirmed"} disabled={!ok} onPress={() => send("confirmed")} />
      <Button kind="secondary" label="No, this isn't right" busy={busy === "declined"} disabled={!ok} onPress={() => send("declined")} />
      <T v="small" muted>
        Your answer records only what you type here. Buildmark doesn&apos;t inspect cars, and doesn&apos;t ask shops to
        confirm emissions-related parts unless the part has a CARB EO number.
      </T>
    </Screen>
  );
}

function Closed({ status }: { status: string }) {
  const text: Record<string, string> = {
    closed: "This link has already been used, or the owner made a new one.",
    expired: "This link has expired. Ask the customer to send a new one.",
    changed: "The customer changed this entry after sending the link. Ask them for a new link so you see the current version.",
    not_allowed: "This entry can't be confirmed through Buildmark.",
    not_found: "This link doesn't work. Check it was copied in full.",
  };
  return (
    <>
      <T v="title">Link not working</T>
      <T muted>{text[status] ?? text.not_found}</T>
    </>
  );
}
