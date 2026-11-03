import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Share, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { shareUrl } from "@/domain/deepLinks";
import { backwardsOdometer, CONFIRM_BLOCK_COPY, confirmBlock, evidenceSteps, LEVELS, recordDate } from "@/domain/record";
import type { MappedError } from "@/features/auth/errors";
import { servicesService } from "@/features/paddock/servicesService";
import { RecordEntryCard } from "@/features/record/RecordBits";
import { confirmPath, recordService } from "@/features/record/recordService";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";
import type { MyConfirmRequest, PublicBusiness, RecordEntry } from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";

const FIELD_NAMES: Record<string, string> = {
  name: "name",
  title: "title",
  category: "category",
  brand: "brand",
  part_number: "part number",
  installed_on: "install date",
  installed_by: "who fitted it",
  status: "status",
  compliance: "emissions status",
  carb_eo: "CARB EO number",
  done_on: "date",
  odometer: "odometer",
  measured_on: "date",
  dyno: "dyno",
  correction: "correction",
  shop: "shop",
  whp: "horsepower",
  wtq: "torque",
  fuel: "fuel",
};

/** One entry on the Build Record: what it rests on, its history, and asking the shop to confirm it. */
export default function RecordEntryScreen() {
  const { vehicleId, entryType, entryId } = useLocalSearchParams<{ vehicleId: string; entryType: string; entryId: string }>();
  const vid = String(vehicleId);
  const [data, setData] = useState<{ entry: RecordEntry | null; all: RecordEntry[]; sold: boolean; waiting: MyConfirmRequest[] } | null>(null);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(() => {
    void (async () => {
      const r = await recordService.myRecord(vid);
      if (!r.ok) return setError(r.error);
      const all = r.data?.entries ?? [];
      const w = r.data?.sold_at ? null : await recordService.myConfirmRequests(vid);
      setError(null);
      setData({
        entry: all.find((e) => e.id === entryId && e.type === entryType) ?? null,
        all,
        sold: Boolean(r.data?.sold_at),
        waiting: w?.ok ? w.data.filter((x) => x.entry_id === entryId) : [],
      });
    })();
  }, [vid, entryId, entryType]);
  useFocusEffect(load);

  if (error && !data) return <ErrorState kind={error.key} onAction={load} />;
  if (!data) return <LoadingState label="Loading the entry" />;
  const e = data.entry;
  if (!e) return <ErrorState kind="buildNotFound" onAction={() => router.back()} />;
  const steps = evidenceSteps(e);

  const openSource = () => {
    if (e.type === "mod") router.push({ pathname: "/garage/[vehicleId]/mods/[modId]", params: { vehicleId: vid, modId: e.id } });
    else router.push({ pathname: e.type === "dyno" ? "/garage/[vehicleId]/dyno" : "/garage/[vehicleId]/maintenance", params: { vehicleId: vid } });
  };

  return (
    <Screen onRefresh={load}>
      <RecordEntryCard e={e} backwards={backwardsOdometer(data.all)} />

      <Card style={{ gap: space.xs }}>
        <Text variant="label">What a buyer can weigh</Text>
        {LEVELS.map((x) => (
          <Text key={x.level} variant="caption" style={{ color: steps[x.level] ? color.text : color.textMuted }}>
            {`${steps[x.level] ? "■" : "□"} ${x.name}: ${x.meaning}`}
          </Text>
        ))}
        {e.receipts.map((r, i) => (
          <Text key={i} variant="caption" muted>
            {`Receipt uploaded ${recordDate(r.uploaded_at)}${r.sha256 ? ` · fingerprint ${r.sha256.slice(0, 12)}` : ""}`}
          </Text>
        ))}
        {e.has_sheet ? (
          <Text variant="caption" muted>
            Dyno sheet on file (private; buyers see that it exists).
          </Text>
        ) : null}
      </Card>

      {data.sold ? null : <ShopConfirm e={e} waiting={data.waiting} onChange={load} />}

      <Card style={{ gap: space.xs }}>
        <Text variant="label">History</Text>
        <Text variant="caption">{`Logged ${recordDate(e.logged_at)}${e.earlier_owner ? " by an earlier owner" : ""}`}</Text>
        {e.revisions.map((r, i) => (
          <Text key={i} variant="caption">
            {`Edited ${recordDate(r.at)}: ${r.changed.map((c) => FIELD_NAMES[c] ?? c).join(", ")}`}
          </Text>
        ))}
        {e.removed_at ? <Text variant="caption">{`Removed ${recordDate(e.removed_at)}`}</Text> : null}
        <Text variant="caption" muted>
          Fix a mistake within a day of logging and it leaves no trace. After that, buyers see that an entry was edited
          (and which fields), or that it was removed.
        </Text>
      </Card>

      {!e.earlier_owner && !e.removed_at && !data.sold ? (
        <Button
          title={e.type === "mod" ? "Open the mod" : e.type === "dyno" ? "Open the dyno log" : "Open the service log"}
          variant="secondary"
          onPress={openSource}
        />
      ) : null}
    </Screen>
  );
}

function ShopConfirm({ e, waiting, onChange }: { e: RecordEntry; waiting: MyConfirmRequest[]; onChange: () => void }) {
  const flags = useFlags();
  const block = confirmBlock(e);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [query, setQuery] = useState(e.installed_by && e.installed_by.toLowerCase() !== "self" ? e.installed_by : "");
  const [shops, setShops] = useState<PublicBusiness[] | null>(null);
  const c = e.confirmation;
  const type = e.type === "dyno" ? null : e.type;

  const shareLink = async (token: string) => {
    const url = shareUrl(confirmPath(token));
    try {
      await Share.share({
        message: `Could you confirm the work you did on my car? It takes a minute, no account needed: ${url}`,
        url,
        title: "Confirm a job",
      });
    } catch {
      setFallback(url);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">Shop confirmation</Text>
      {c ? (
        <Text>
          {`${c.decision === "confirmed" ? "Confirmed" : "Declined"} by ${c.shop_name} ${c.via === "shop_account" ? "(Dynorex shop)" : "(through a link)"} on ${recordDate(c.at)}.${c.version !== e.version ? " You edited the entry after that, so buyers see it was changed since." : ""}`}
        </Text>
      ) : null}
      {c?.note ? <Text variant="caption" muted>{`Their note: ${c.note}`}</Text> : null}
      {block && block !== "already_confirmed" ? (
        <Text variant="caption" muted>
          {CONFIRM_BLOCK_COPY[block]}
        </Text>
      ) : null}
      {waiting.map((w) => (
        <View key={`${w.business_name}-${w.token}`} style={{ gap: space.xs }}>
          <Text variant="caption">
            {`Waiting on ${w.business_name ?? "a shop with your link"} · until ${recordDate(w.expires_at)}`}
          </Text>
          {w.token ? <Button title="Send the link again" variant="secondary" onPress={() => void shareLink(w.token!)} /> : null}
        </View>
      ))}
      {!block && type ? (
        <>
          <Text variant="caption" muted>
            The shop sees the job and your car, never your name, VIN, costs or notes. Buyers see who confirmed and when.
          </Text>
          {waiting.some((w) => w.token) ? null : (
          <Button
            title="Get a link for the shop"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              const r = await recordService.requestConfirmation(type, e.id, null);
              setBusy(false);
              if (!r.ok) return setError(r.error);
              analytics.track("shop_confirmation_requested", { via: "link" });
              onChange();
              void shareLink(r.data);
            }}
          />
          )}
          {flags.marketplace ? (
            <View style={{ gap: space.xs }}>
              <TextField label="Or ask a shop on Dynorex" value={query} onChangeText={setQuery} placeholder="Shop name or area" />
              <Button
                title="Find shops"
                variant="secondary"
                onPress={async () => {
                  const r = await servicesService.browse({ query });
                  setShops(r.ok ? r.data.slice(0, 5) : []);
                }}
              />
              {shops?.length === 0 ? <Text variant="caption" muted>No shops on Dynorex match that.</Text> : null}
              {shops?.map((b) => (
                <View key={b.business_id} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <Text style={{ flex: 1 }}>{`${b.name} · ${b.location_text}`}</Text>
                  <Button
                    title="Ask"
                    variant="secondary"
                    onPress={async () => {
                      setError(null);
                      const r = await recordService.requestConfirmation(type, e.id, b.business_id);
                      if (!r.ok) return setError(r.error);
                      analytics.track("shop_confirmation_requested", { via: "shop_account" });
                      setShops(null);
                      onChange();
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <InlineError kind={error.key} /> : null}
      {fallback ? (
        <InlineNotice title="Link ready" body="Copy it and send it to the shop.">
          <Text selectable>{fallback}</Text>
        </InlineNotice>
      ) : null}
    </Card>
  );
}
