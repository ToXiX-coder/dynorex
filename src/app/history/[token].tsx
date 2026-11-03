import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Shake, Stamp } from "@/components/motion/Motion";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { backwardsOdometer, carName, isVinShape, normalizeVin, RECORD_DISCLAIMER, recordDate, recordSummary } from "@/domain/record";
import { SPEC_DISCLAIMER } from "@/domain/specs";
import type { MappedError } from "@/features/auth/errors";
import { FlagLine, RecordEntryCard, RecordLegend, RecordStrip } from "@/features/record/RecordBits";
import { recordService } from "@/features/record/recordService";
import { haptic } from "@/services/haptics";
import type { BuildRecord, VinCheck } from "@/services/supabase/database.types";
import { themed } from "@/theme/themed";
import { border, color, radius, space } from "@/theme/tokens";
import { CheckIcon } from "@/components/icons";

const styles = themed(() =>
  StyleSheet.create({
    // a lime-edged slip, like a stamp on paper
    match: {
      flexDirection: "row",
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderWidth: border.regular,
      borderColor: color.accent,
      borderRadius: radius.sm,
    },
  }),
);

/**
 * dynorex.app/history/<token>: a car's Build Record (D-64; the D-61 service-history link, upgraded), shared by its
 * owner, usually when selling. Open to anyone with the link, no account needed. Every entry with what it rests on,
 * its edits and removals and shop confirmations. Never the VIN, costs, notes, photos or who the owner is.
 */
export default function BuildRecordPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [rec, setRec] = useState<BuildRecord | null | undefined>(undefined);
  const [error, setError] = useState<MappedError | null>(null);

  useEffect(() => {
    let alive = true;
    void recordService.publicRecord(String(token)).then((r) => {
      if (!alive) return;
      if (r.ok) setRec(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) return <ErrorState kind={error.key} />;
  if (rec === undefined) return <LoadingState label="Loading the Build Record" />;
  if (rec === null) return <ErrorState kind="historyGone" />;

  const s = recordSummary(rec.entries);
  const back = backwardsOdometer(rec.entries);
  return (
    <Screen>
      <Text variant="caption" muted>
        BUILD RECORD
      </Text>
      <Text variant="display" accessibilityRole="header">
        {carName(rec.car)}
      </Text>
      <Text>
        {[
          rec.odometer !== null ? `${rec.odometer.toLocaleString()} ${rec.odometer_unit}` : null,
          `${rec.owners} ${rec.owners === 1 ? "owner" : "owners"} on Dynorex`,
          `current owner since ${recordDate(rec.owner_since)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <Card style={{ gap: space.sm }}>
        <Text>
          {`${s.entries} ${s.entries === 1 ? "entry" : "entries"} · ${s.withPaperwork} with paperwork · ${s.shopConfirmed} shop-confirmed${s.flagged ? ` · ${s.flagged} to ask about` : ""}`}
        </Text>
        <RecordStrip entries={rec.entries} />
      </Card>

      <VinCheckCard token={String(token)} />
      <RecordLegend />

      <SectionHeader>Entries</SectionHeader>
      {rec.entries.length === 0 ? <Text muted>Nothing on the record yet.</Text> : null}
      {rec.entries.map((e, i) => (
        <RecordEntryCard key={`${e.type}:${e.id}`} e={e} index={i} backwards={back} />
      ))}

      <Text variant="caption" muted>
        {`${RECORD_DISCLAIMER} Receipts and dyno sheets stay private; this shows that one is on file and when it was uploaded.${rec.expires_at ? ` Link works until ${recordDate(rec.expires_at)}.` : ""}`}
      </Text>
      <Text variant="caption" muted>
        {SPEC_DISCLAIMER}
      </Text>
    </Screen>
  );
}

const VIN_COPY: Record<VinCheck, { good: boolean; text: string }> = {
  match: { good: true, text: "This VIN matches the record." },
  no_match: { good: false, text: "This VIN doesn't match the record. Check for a typo, then ask the seller." },
  no_vin_on_record: { good: false, text: "The owner hasn't added a VIN to this record, so it can't be checked." },
  too_many: { good: false, text: "Too many checks on this link. Try again in an hour." },
  not_found: { good: false, text: "This link no longer works." },
};

/** "Is this the car in front of you?" The answer is match or no match; the record's VIN is never shown. */
function VinCheckCard({ token }: { token: string }) {
  const [vin, setVin] = useState("");
  const [result, setResult] = useState<VinCheck | null>(null);
  // counts checks, so the same answer twice still lands (stamps again, or shakes again)
  const [checks, setChecks] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">Is this the car in front of you?</Text>
      <Text variant="caption" muted>
        Type the VIN from the windshield or the door jamb. You&apos;ll see match or no match; the record&apos;s VIN is
        never shown.
      </Text>
      <TextField
        label="VIN on the car"
        value={vin}
        onChangeText={(t) => {
          setVin(t);
          setResult(null);
        }}
        autoCapitalize="characters"
        maxLength={20}
      />
      <Button
        title="Check VIN"
        variant="secondary"
        loading={busy}
        disabled={!isVinShape(vin)}
        onPress={async () => {
          setBusy(true);
          setError(null);
          const r = await recordService.checkVin(token, normalizeVin(vin));
          setBusy(false);
          if (!r.ok) return setError(r.error);
          setResult(r.data);
          setChecks((n) => n + 1);
          // the stamp below buzzes on a match; anything else gets the warning tap
          if (!VIN_COPY[r.data].good) haptic.warning();
        }}
      />
      {result ? (
        VIN_COPY[result].good ? (
          <Stamp key={checks} haptics tilt={-1} style={{ alignSelf: "flex-start" }}>
            <View style={styles.match}>
              <CheckIcon color={color.accent} size={18} />
              <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                {VIN_COPY[result].text}
              </Text>
            </View>
          </Stamp>
        ) : (
          <Shake trigger={checks}>
            <FlagLine text={VIN_COPY[result].text} />
          </Shake>
        )
      ) : null}
      {error ? <InlineError kind={error.key} /> : null}
    </Card>
  );
}
