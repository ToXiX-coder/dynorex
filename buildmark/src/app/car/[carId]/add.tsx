import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { CATEGORIES, COMPLIANCE_LABELS, complianceChoices, defaultCompliance, isEmissionsCategory } from "@/domain/compliance";
import { entryFormSchema, KIND_LABELS, patchFrom, type EntryFormValues, type EntryInput } from "@/domain/entryForm";
import type { Category, Compliance, Entry, EntryKind } from "@/domain/types";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { Button, Choices, Field, Loading, Notice, Screen, T } from "@/ui/kit";

/** Log new work, or edit an entry (?entryId=…). Edits need a reason, and buyers see the old version. */
export default function AddEntry() {
  return (
    <Guard>
      <Form />
    </Guard>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const blank: EntryFormValues = {
  kind: "install", category: "suspension", title: "", partBrand: "", partNumber: "", carbEo: "",
  compliance: "not_emissions_related", installerType: "owner", installerName: "", performedOn: today(),
  odometer: "", odometerUnit: "mi", cost: "", notes: "", dynoWhp: "", dynoWtq: "",
};
const fromEntry = (e: Entry): EntryFormValues => ({
  kind: e.kind, category: e.category, title: e.title, partBrand: e.partBrand ?? "", partNumber: e.partNumber ?? "",
  carbEo: e.carbEo ?? "", compliance: e.compliance, installerType: e.installerType, installerName: e.installerName ?? "",
  performedOn: e.performedOn, odometer: e.odometer?.toString() ?? "", odometerUnit: e.odometerUnit,
  cost: e.costCents != null ? (e.costCents / 100).toString() : "", notes: e.notes ?? "",
  dynoWhp: e.dynoWhp?.toString() ?? "", dynoWtq: e.dynoWtq?.toString() ?? "",
});

function Form() {
  const { carId, entryId } = useLocalSearchParams<{ carId: string; entryId?: string }>();
  const [v, setV] = useState<EntryFormValues>(blank);
  const [before, setBefore] = useState<EntryInput | null>(null);
  const [loading, setLoading] = useState(!!entryId);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entryId) return;
    void getApi()!
      .entries(carId)
      .then((list) => {
        const e = list.find((x) => x.id === entryId);
        if (e) {
          const values = fromEntry(e);
          setV(values);
          const parsed = entryFormSchema.safeParse(values);
          if (parsed.success) setBefore(parsed.data);
        }
        setLoading(false);
      });
  }, [carId, entryId]);

  const set = <K extends keyof EntryFormValues>(k: K, x: EntryFormValues[K]) => setV((p) => ({ ...p, [k]: x }));
  const setCategory = (c: Category) =>
    setV((p) => ({ ...p, category: c, compliance: complianceChoices(c).includes(p.compliance as Compliance) ? p.compliance : defaultCompliance(c) }));

  async function save() {
    const parsed = entryFormSchema.safeParse(v);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      const api = getApi()!;
      if (entryId && before) {
        await api.reviseEntry(entryId, patchFrom(before, parsed.data), reason);
        router.back();
      } else {
        const id = await api.addEntry(carId, parsed.data);
        router.replace({ pathname: "/car/[carId]/entry/[entryId]", params: { carId, entryId: id } });
      }
    } catch (e) {
      setFailure(errorText(e));
      setBusy(false);
    }
  }

  if (loading) return <Screen><Loading /></Screen>;
  const emissions = isEmissionsCategory(v.category as Category);

  return (
    <Screen>
      <Stack.Screen options={{ title: entryId ? "Edit entry" : "Log work" }} />
      {entryId ? (
        <Notice>Buyers see that this entry was edited, the reason you give, and which fields changed.</Notice>
      ) : null}
      {!entryId ? (
        <Choices
          label="What happened"
          value={v.kind as EntryKind}
          onChange={(k) => set("kind", k)}
          options={(Object.keys(KIND_LABELS) as EntryKind[]).map((id) => ({ id, label: KIND_LABELS[id] }))}
        />
      ) : null}
      <Choices label="Area" value={v.category as Category} onChange={setCategory} options={CATEGORIES} />
      <Field label="What was done" value={v.title} onChangeText={(x) => set("title", x)} placeholder="Coilovers" error={errors.title} maxLength={80} />
      <Field label="Brand (optional)" value={v.partBrand} onChangeText={(x) => set("partBrand", x)} maxLength={40} />
      <Field label="Part number (optional)" value={v.partNumber} onChangeText={(x) => set("partNumber", x)} maxLength={40} hint="Buyers weigh a part number more than a name." />
      {emissions ? (
        <>
          <Choices
            label="Emissions status"
            value={v.compliance as Compliance}
            onChange={(x) => set("compliance", x)}
            options={complianceChoices(v.category as Category).map((id) => ({ id, label: COMPLIANCE_LABELS[id] }))}
            error={errors.compliance}
          />
          {v.compliance === "carb_eo" ? (
            <Field label="CARB EO number" value={v.carbEo} onChangeText={(x) => set("carbEo", x)} autoCapitalize="characters" placeholder="D-142-44" error={errors.carbEo} />
          ) : (
            <T v="small" muted>
              Shops won&apos;t be asked to confirm emissions-related parts without a CARB EO number, to protect them.
            </T>
          )}
        </>
      ) : null}
      <Choices
        label="Who did the work"
        value={v.installerType as "owner" | "shop"}
        onChange={(x) => set("installerType", x)}
        options={[{ id: "owner", label: "I did" }, { id: "shop", label: "A shop" }]}
      />
      {v.installerType === "shop" ? (
        <Field label="Shop name" value={v.installerName} onChangeText={(x) => set("installerName", x)} error={errors.installerName} maxLength={80} />
      ) : null}
      <Field label="Date of the work" value={v.performedOn} onChangeText={(x) => set("performedOn", x)} placeholder="YYYY-MM-DD" error={errors.performedOn} maxLength={10} />
      <Field label="Odometer" value={v.odometer} onChangeText={(x) => set("odometer", x)} keyboardType="number-pad" error={errors.odometer} />
      <Choices label="Unit" value={v.odometerUnit as "mi" | "km"} onChange={(x) => set("odometerUnit", x)} options={[{ id: "mi", label: "Miles" }, { id: "km", label: "Kilometers" }]} />
      {v.kind === "dyno" ? (
        <>
          <Field label="Wheel horsepower" value={v.dynoWhp} onChangeText={(x) => set("dynoWhp", x)} keyboardType="number-pad" error={errors.dynoWhp} />
          <Field label="Wheel torque (lb-ft)" value={v.dynoWtq} onChangeText={(x) => set("dynoWtq", x)} keyboardType="number-pad" error={errors.dynoWtq} />
        </>
      ) : null}
      <Field label="Cost (private)" value={v.cost} onChangeText={(x) => set("cost", x)} keyboardType="decimal-pad" error={errors.cost} hint="Only you see costs." />
      <Field label="Notes (private)" value={v.notes} onChangeText={(x) => set("notes", x)} multiline maxLength={1000} hint="Only you see notes." />
      {entryId ? (
        <Field label="Reason for the edit" value={reason} onChangeText={setReason} maxLength={140} placeholder="Wrong mileage" />
      ) : null}
      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      <Button label={entryId ? "Save edit" : "Save entry"} busy={busy} disabled={!!entryId && !reason.trim()} onPress={save} />
    </Screen>
  );
}
