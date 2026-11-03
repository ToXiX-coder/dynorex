import { router } from "expo-router";
import { useState } from "react";
import { isVinShape, normalizeVin, vinCheckDigitOk } from "@/domain/vin";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { Button, Field, Notice, Screen, T } from "@/ui/kit";

export default function NewCar() {
  return (
    <Guard>
      <Form />
    </Guard>
  );
}

function Form() {
  const [v, set] = useState({ year: "", make: "", model: "", trim: "", vin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = Number(v.year);
  const yearOk = /^\d{4}$/.test(v.year) && year >= 1900 && year <= new Date().getFullYear() + 1;
  const vin = normalizeVin(v.vin);
  const vinError = vin && !isVinShape(vin) ? "A VIN is 17 letters and numbers, without I, O or Q" : null;
  const ok = yearOk && v.make.trim() && v.model.trim() && !vinError;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const id = await getApi()!.addCar({
        year,
        make: v.make.trim(),
        model: v.model.trim(),
        trim: v.trim.trim() || null,
        vin: vin || null,
      });
      router.replace({ pathname: "/car/[carId]", params: { carId: id } });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <T v="title">Add a car</T>
      <Field label="Year" value={v.year} onChangeText={(year) => set({ ...v, year })} keyboardType="number-pad" maxLength={4} />
      <Field label="Make" value={v.make} onChangeText={(make) => set({ ...v, make })} placeholder="Subaru" />
      <Field label="Model" value={v.model} onChangeText={(model) => set({ ...v, model })} placeholder="WRX" />
      <Field label="Trim (optional)" value={v.trim} onChangeText={(trim) => set({ ...v, trim })} />
      <Field
        label="VIN (optional now, needed to sell)"
        value={v.vin}
        onChangeText={(x) => set({ ...v, vin: x })}
        autoCapitalize="characters"
        maxLength={20}
        error={vinError}
        hint={
          vin && isVinShape(vin) && !vinCheckDigitOk(vin)
            ? "The check digit doesn't match. That's normal outside North America; otherwise check for a typo."
            : "Only you see it. Buyers can check a VIN against it, but never read it. It can't be changed once set."
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button label="Add car" busy={busy} disabled={!ok} onPress={save} />
    </Screen>
  );
}
