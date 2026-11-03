import { router } from "expo-router";
import { useState } from "react";
import { isClaimCode, normalizeClaimCode } from "@/domain/codes";
import { isVinShape, normalizeVin } from "@/domain/vin";
import { DEMO_CLAIM } from "@/demo/data";
import { config } from "@/services/config";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { Button, Field, Notice, Screen, T } from "@/ui/kit";

const STATUS: Record<string, string> = {
  code_invalid: "That code isn't valid. It may have expired, been cancelled, or been used.",
  vin_mismatch: "The VIN doesn't match the record. Read it off the car (windshield or door jamb) and try again.",
  own_car: "That's already your car.",
  rate_limited: "Too many tries. Wait an hour and try again.",
};

export default function Claim() {
  return (
    <Guard>
      <Form />
    </Guard>
  );
}

function Form() {
  const [code, setCode] = useState("");
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = normalizeClaimCode(code);
  const ok = isClaimCode(c) && isVinShape(vin);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const r = await getApi()!.claimTransfer(c, normalizeVin(vin));
      if (r.status === "ok" && r.carId) return router.replace({ pathname: "/car/[carId]", params: { carId: r.carId } });
      setError(STATUS[r.status] ?? "Something went wrong. Try again.");
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <T v="title">Take over a record</T>
      <T muted>
        The seller gives you a code from their app. You also need the VIN from the car itself, so a code on its own
        isn&apos;t enough.
      </T>
      {config.demoMode ? (
        <Notice>
          Demo: use code {DEMO_CLAIM.code} and VIN {DEMO_CLAIM.vin}.
        </Notice>
      ) : null}
      <Field label="Transfer code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXX-XXXX" maxLength={11} />
      <Field label="VIN, read off the car" value={vin} onChangeText={setVin} autoCapitalize="characters" maxLength={20} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button label="Take over the record" busy={busy} disabled={!ok} onPress={claim} />
      <T v="small" muted>
        The record keeps every earlier entry, edit and shop confirmation. The seller keeps a read-only copy of what
        they logged.
      </T>
    </Screen>
  );
}
