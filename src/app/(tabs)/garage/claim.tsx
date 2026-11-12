import { router } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { DEMO_CLAIM } from "@/demo/record";
import { isClaimCode, isIdentShape, normalizeClaimCode, normalizeVin } from "@/domain/record";
import type { MappedError } from "@/features/auth/errors";
import { recordService } from "@/features/record/recordService";
import { analytics } from "@/services/analytics";
import { config } from "@/services/config";
import type { ClaimStatus } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

const STATUS: Partial<Record<ClaimStatus, string>> = {
  code_invalid: "That code isn't valid. It may have expired, been cancelled, or been used already.",
  vin_mismatch:
    "That doesn't match the record. Read the VIN off the windshield or door jamb (an e-moto's frame number off the frame by the steering head) and try again.",
  own_car: "That's your own vehicle's code.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  plan_limit: "Your free plan holds 2 vehicles. Sell or delete one, or get Dynorex+, then try again.",
  failed: "That didn't work. Try again.",
};

/**
 * Bought a car whose seller kept a Build Record (D-64)? Their code plus the VIN off the car puts the car in your
 * garage with every earlier entry, edit and shop confirmation, read-only. A code on its own isn't enough.
 */
export default function ClaimRecord() {
  const [code, setCode] = useState("");
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const c = normalizeClaimCode(code);
  const ok = isClaimCode(c) && isIdentShape(vin);

  const claim = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    const r = await recordService.claimTransfer(c, normalizeVin(vin));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.data.status === "ok" && r.data.vehicleId) {
      analytics.track("record_claimed", {});
      // `received` lets the record greet the new owner once (a stamp and a success buzz)
      return router.replace({
        pathname: "/garage/[vehicleId]/record",
        params: { vehicleId: r.data.vehicleId, received: "1" },
      });
    }
    setMessage(STATUS[r.data.status] ?? STATUS.failed!);
  };

  return (
    <Screen>
      <Text variant="section">Take over a vehicle&apos;s record</Text>
      <Text muted>
        The seller gets a transfer code from their Build Record. You also need the VIN (an e-moto&apos;s frame number)
        off the vehicle itself, so a code on its own isn&apos;t enough.
      </Text>
      {config.demoMode ? (
        <InlineNotice headsUp title="Pitch mode" body={`Try code ${DEMO_CLAIM.code} with VIN ${DEMO_CLAIM.vin}.`} />
      ) : null}
      <TextField
        label="Transfer code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        placeholder="XXXX-XXXX"
        maxLength={11}
      />
      <TextField
        label="VIN or frame number"
        value={vin}
        onChangeText={setVin}
        autoCapitalize="characters"
        maxLength={40}
      />
      {message ? <InlineNotice headsUp title="Not yet" body={message} /> : null}
      {error ? <InlineError kind={error.key} /> : null}
      <Button title="Take over the record" loading={busy} disabled={!ok} onPress={() => void claim()} />
      <Text variant="caption" muted style={{ marginTop: space.sm }}>
        It arrives private, with the earlier owner&apos;s entries marked as theirs. Their photos, posts, costs and notes
        don&apos;t come with it.
      </Text>
    </Screen>
  );
}
