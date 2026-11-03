import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { carTitle, DISCLAIMER } from "@/domain/buildSheet";
import { isToken } from "@/domain/codes";
import { formatDate, LEVELS, summary } from "@/domain/evidence";
import { backwardsEntries } from "@/domain/odometer";
import { isVinShape, normalizeVin } from "@/domain/vin";
import type { VinCheck } from "@/services/api";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { useLoad } from "@/ui/hooks";
import { Button, Card, Field, Loading, Notice, Screen, T } from "@/ui/kit";
import { EntryCard, Ladder } from "@/ui/record";

/** What a buyer sees. No account needed; never the owner, VIN, costs or notes. */
export default function PublicRecordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { data, error } = useLoad(async (api) => (isToken(token) ? api.publicRecord(token) : null), [token]);
  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (data === undefined) return <Screen><Loading /></Screen>;
  if (!data)
    return (
      <Screen>
        <T v="title">Link not working</T>
        <T muted>The owner turned this link off, or the car has changed hands. Ask the seller for a new one.</T>
      </Screen>
    );

  const s = summary(data.entries);
  const back = backwardsEntries(data.entries);
  const newest = [...data.entries].sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <T v="label">Build record</T>
        <T v="title">{carTitle(data.car)}</T>
        <T muted v="small">
          {data.owners} {data.owners === 1 ? "owner" : "owners"} on Buildmark · current owner since {formatDate(data.ownerSince)}
        </T>
      </View>
      <Card>
        <T v="small">
          {s.entries} {s.entries === 1 ? "entry" : "entries"} · {s.withReceipts} with receipts · {s.shopConfirmed} shop-confirmed
          {s.flagged ? ` · ${s.flagged} flagged` : ""}
        </T>
      </Card>
      <VinCheckCard token={token} />
      <Card>
        <T v="label">How to read it</T>
        {LEVELS.map((x) => (
          <View key={x.level} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ladder level={x.level} steps={[0, 1, 2, 3].map((i) => i === 0 || i === x.level)} compact />
            <T v="small" style={{ flex: 1 }}>
              <T v="small" style={{ fontWeight: "700" }}>{x.name}.</T> {x.meaning}
            </T>
          </View>
        ))}
        <T v="small" muted>
          ⚑ marks something to ask the seller about: an edit after a shop confirmed, an entry logged long after the
          work, or an odometer reading lower than an earlier one.
        </T>
      </Card>
      {newest.map((e) => (
        <EntryCard key={e.id} e={e} backwards={back.has(e.id)} />
      ))}
      <T v="small" muted>
        {DISCLAIMER}
      </T>
    </Screen>
  );
}

const VIN_COPY: Record<VinCheck, { tone: "stamp" | "flag" | "danger"; text: string }> = {
  match: { tone: "stamp", text: "This VIN matches the record." },
  no_match: { tone: "danger", text: "This VIN doesn't match the record. Check for a typo, then ask the seller." },
  no_vin_on_record: { tone: "flag", text: "The owner hasn't added a VIN to this record, so it can't be checked." },
  too_many: { tone: "flag", text: "Too many checks on this link. Try again in an hour." },
  not_found: { tone: "danger", text: "This link no longer works." },
};

function VinCheckCard({ token }: { token: string }) {
  const [vin, setVin] = useState("");
  const [result, setResult] = useState<VinCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <T v="heading">Is this the car in front of you?</T>
      <T v="small" muted>
        Type the VIN from the windshield or door jamb. You&apos;ll get match or no match; the record&apos;s VIN is never shown.
      </T>
      <Field label="VIN on the car" value={vin} onChangeText={(x) => { setVin(x); setResult(null); }} autoCapitalize="characters" maxLength={20} />
      <Button
        kind="secondary"
        label="Check VIN"
        busy={busy}
        disabled={!isVinShape(vin)}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            setResult(await getApi()!.checkVin(token, normalizeVin(vin)));
          } catch (e) {
            setError(errorText(e));
          }
          setBusy(false);
        }}
      />
      {result ? <Notice tone={VIN_COPY[result].tone}>{VIN_COPY[result].text}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Card>
  );
}
