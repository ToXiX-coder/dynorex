import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { confirmBlock, CONFIRM_BLOCK_COPY } from "@/domain/compliance";
import { evidence, evidenceSteps, formatDate, LEVELS } from "@/domain/evidence";
import { backwardsEntries } from "@/domain/odometer";
import type { Entry } from "@/domain/types";
import { config, publicLink } from "@/services/config";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { shareText, useLoad } from "@/ui/hooks";
import { Button, Card, Field, Loading, Notice, Rule, Screen, T } from "@/ui/kit";
import { EntryCard } from "@/ui/record";
import { color } from "@/ui/theme";

export default function EntryScreen() {
  return (
    <Guard>
      <Detail />
    </Guard>
  );
}

const FIELD_NAMES: Record<string, string> = {
  category: "area", title: "description", part_brand: "brand", part_number: "part number", carb_eo: "CARB EO",
  compliance: "emissions status", installer_type: "who did it", installer_name: "shop", performed_on: "date",
  odometer: "odometer", odometer_unit: "unit", cost_cents: "cost", notes: "notes", dyno_whp: "horsepower",
  dyno_wtq: "torque", receipts: "files",
};

function Detail() {
  const { carId, entryId } = useLocalSearchParams<{ carId: string; entryId: string }>();
  const { data, error, reload } = useLoad(
    async (api) => {
      const [cars, entries] = await Promise.all([api.myCars(), api.entries(carId)]);
      const entry = entries.find((e) => e.id === entryId) ?? null;
      const link = entry && !cars.find((c) => c.id === carId)?.archived ? await api.myConfirmLink(entryId) : null;
      return { archived: !!cars.find((c) => c.id === carId)?.archived, entry, entries, link };
    },
    [carId, entryId],
  );
  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  const { entry: e, archived, link } = data;
  if (!e) return <Screen><Notice tone="danger">This entry couldn&apos;t be found.</Notice></Screen>;
  const ev = evidence(e);
  const steps = evidenceSteps(e);
  const editable = !archived && !e.withdrawnAt;

  return (
    <Screen>
      <EntryCard e={e} backwards={backwardsEntries(data.entries).has(e.id)} />

      <Card>
        <T v="label">What a buyer can weigh</T>
        {LEVELS.map((x) => (
          <T key={x.level} v="small" style={{ color: steps[x.level] ? color.ink : color.muted }}>
            {steps[x.level] ? "■" : "□"} {x.name}: {x.meaning}
          </T>
        ))}
        {ev.labels.slice(1).map((l) => (
          <T key={l} v="small" muted>
            {l}
          </T>
        ))}
      </Card>

      <Files e={e} editable={editable} onChange={reload} />
      {!archived ? <ShopConfirm e={e} link={link} onChange={reload} /> : null}

      {e.costCents != null || e.notes ? (
        <Card>
          <T v="label">Private to you</T>
          {e.costCents != null ? <T v="small">Cost: ${(e.costCents / 100).toLocaleString("en-US")}</T> : null}
          {e.notes ? <T v="small">{e.notes}</T> : null}
        </Card>
      ) : null}

      <Card>
        <T v="label">History</T>
        <T v="small">Logged {formatDate(e.createdAt)}</T>
        {e.revisions.map((r, i) => (
          <T key={i} v="small">
            {formatDate(r.at)}: {r.reason} ({r.changed.map((c) => FIELD_NAMES[c] ?? c).join(", ")})
          </T>
        ))}
        {e.withdrawnAt ? <T v="small">Withdrawn {formatDate(e.withdrawnAt)}</T> : null}
      </Card>

      {editable ? (
        <>
          <Button
            kind="secondary"
            label="Edit"
            onPress={() => router.push({ pathname: "/car/[carId]/add", params: { carId, entryId: e.id } })}
          />
          <Withdraw entryId={e.id} onDone={reload} />
        </>
      ) : null}
    </Screen>
  );
}

function Files({ e, editable, onChange }: { e: Entry; editable: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(kind: "receipt" | "dyno_sheet") {
    setError(null);
    try {
      let file = { uri: "", mimeType: "image/jpeg", name: "sample.jpg" };
      if (!config.demoMode) {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, exif: false });
        const a = picked.canceled ? null : picked.assets[0];
        if (!a) return;
        file = { uri: a.uri, mimeType: a.mimeType ?? "image/jpeg", name: a.fileName ?? "receipt.jpg" };
      }
      setBusy(kind);
      await getApi()!.addReceipt(e.id, kind, file);
      onChange();
    } catch (x) {
      setError(errorText(x));
    }
    setBusy(null);
  }

  return (
    <Card>
      <T v="label">Receipts and sheets</T>
      {e.receipts.length === 0 ? <T v="small" muted>None yet. A receipt is the first step up the ladder.</T> : null}
      {e.receipts.map((r) => (
        <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T v="small">
              {r.kind === "receipt" ? "Receipt" : "Dyno sheet"}, uploaded {formatDate(r.uploadedAt)}
            </T>
            {r.sha256 ? (
              <T v="mono" muted>
                Fingerprint {r.sha256.slice(0, 12)}
              </T>
            ) : null}
          </View>
          {editable ? (
            <Button
              kind="danger"
              label="Remove"
              onPress={async () => {
                try {
                  await getApi()!.removeReceipt(r.id);
                  onChange();
                } catch (x) {
                  setError(errorText(x));
                }
              }}
            />
          ) : null}
        </View>
      ))}
      {editable ? (
        <>
          <Rule />
          <T v="small" muted>
            The upload date is set by Buildmark, so it can&apos;t be backdated. Removing a file leaves a note buyers can see.
            {config.demoMode ? " Demo: adds a sample file." : ""}
          </T>
          <Button kind="secondary" label="Add a receipt" busy={busy === "receipt"} onPress={() => add("receipt")} />
          {e.kind === "dyno" ? (
            <Button kind="secondary" label="Add the dyno sheet" busy={busy === "dyno_sheet"} onPress={() => add("dyno_sheet")} />
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Card>
  );
}

function ShopConfirm({ e, link, onChange }: { e: Entry; link: string | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const block = confirmBlock(e);
  const url = link ? publicLink(`/c/${link}`) : null;

  return (
    <Card>
      <T v="label">Shop confirmation</T>
      {e.confirmation ? (
        <T v="small">
          {e.confirmation.decision === "confirmed" ? "Confirmed" : "Declined"} by {e.confirmation.shopName} on{" "}
          {formatDate(e.confirmation.at)}
          {e.confirmation.rev !== e.rev ? ". You've edited the entry since, so buyers see that too." : "."}
        </T>
      ) : null}
      {block && block !== "already_confirmed" ? <T v="small" muted>{CONFIRM_BLOCK_COPY[block]}</T> : null}
      {!block ? (
        url ? (
          <>
            <T v="small">Send this link to {e.installerName ?? "the shop"}. It works once and shows them the job, not you or your VIN.</T>
            <T v="mono" selectable>
              {url}
            </T>
            <Button
              kind="secondary"
              label="Copy or send the link"
              onPress={async () => {
                const r = await shareText(url);
                setMsg(r === "copied" ? "Copied." : r === "shared" ? "Sent." : "Couldn't share it. Select the link above to copy it.");
              }}
            />
          </>
        ) : (
          <>
            <T v="small">
              Ask {e.installerName ?? "the shop"} to confirm they did this work. Buyers see it as &quot;Confirmed by{" "}
              {e.installerName ?? "the shop"}&quot;, with the date.
            </T>
            <Button
              label="Get a link for the shop"
              busy={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await getApi()!.requestConfirmation(e.id);
                  onChange();
                } catch (x) {
                  setMsg(errorText(x));
                }
                setBusy(false);
              }}
            />
          </>
        )
      ) : null}
      {msg ? <T v="small" muted>{msg}</T> : null}
    </Card>
  );
}

function Withdraw({ entryId, onDone }: { entryId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button kind="danger" label="Withdraw entry" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <T v="heading">Withdraw this entry?</T>
      <T v="small" muted>
        It stays on the record, struck through, with your reason. Entries can&apos;t be deleted, so buyers can trust
        nothing disappeared.
      </T>
      <Field label="Reason" value={reason} onChangeText={setReason} maxLength={140} placeholder="Logged on the wrong car" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        kind="danger"
        label="Withdraw"
        disabled={!reason.trim()}
        onPress={async () => {
          try {
            await getApi()!.withdrawEntry(entryId, reason);
            onDone();
          } catch (x) {
            setError(errorText(x));
          }
        }}
      />
      <Button kind="secondary" label="Keep it" onPress={() => setOpen(false)} />
    </Card>
  );
}
