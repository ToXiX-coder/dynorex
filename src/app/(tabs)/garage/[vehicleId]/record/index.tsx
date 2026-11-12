import * as Print from "expo-print";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Appear, Pop, SplitFlap, Stamp } from "@/components/motion/Motion";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { shareUrl } from "@/domain/deepLinks";
import {
  backwardsOdometer,
  buildSheetHtml,
  buildSheetText,
  carName,
  identFor,
  listingAdText,
  nextPaperwork,
  recordDate,
  recordSummary,
} from "@/domain/record";
import { qrSvg } from "@/domain/qrSvg";
import type { MappedError } from "@/features/auth/errors";
import { historyPath, recordsService } from "@/features/garage/recordsService";
import { RecordEntryCard, RecordLegend, RecordStrip } from "@/features/record/RecordBits";
import { BuyerBrief } from "@/features/record/BuyerBrief";
import { recordService } from "@/features/record/recordService";
import { UploadList } from "@/components/build/UploadList";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { useCountUp } from "@/hooks/useCountUp";
import { analytics } from "@/services/analytics";
import { pickPhoto } from "@/services/media/photos";
import { haptic } from "@/services/haptics";
import type { BuildRecord, MyConfirmRequest, RecordEntry } from "@/services/supabase/database.types";
import { themed } from "@/theme/themed";
import { color, radius, space, type } from "@/theme/tokens";

type Data = {
  record: BuildRecord | null;
  link: { token: string; expires_at: string } | null;
  transfer: string | null;
  waiting: MyConfirmRequest[];
};

/**
 * The Build Record (D-64): the car's finished mods, service log and dyno results, with what each one rests on, every
 * edit and removal, and shop confirmations. From here the owner shares it with a buyer, pastes it into a listing,
 * and hands it over when the car is sold.
 */
export default function BuildRecordScreen() {
  const { vehicleId, received } = useLocalSearchParams<{ vehicleId: string; received?: string }>();
  const id = String(vehicleId);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(() => {
    void (async () => {
      const r = await recordService.myRecord(id);
      if (!r.ok) return setError(r.error);
      const sold = Boolean(r.data?.sold_at);
      const [link, transfer, waiting] = await Promise.all([
        sold ? null : recordsService.historyShare(id),
        sold ? null : recordService.openTransfer(id),
        sold ? null : recordService.myConfirmRequests(id),
      ]);
      setError(null);
      setData({
        record: r.data,
        link: link?.ok ? link.data : null,
        transfer: transfer?.ok ? transfer.data : null,
        waiting: waiting?.ok ? waiting.data : [],
      });
    })();
  }, [id]);
  useFocusEffect(load);

  if (error && !data) return <ErrorState kind={error.key} onAction={load} />;
  if (!data) return <LoadingState label="Loading the Build Record" />;
  if (!data.record) return <ErrorState kind="buildNotFound" onAction={() => router.back()} />;
  const rec = data.record;
  const s = recordSummary(rec.entries);
  const back = backwardsOdometer(rec.entries);
  const sold = Boolean(rec.sold_at);
  const next = sold ? null : nextPaperwork(rec.entries);
  const inherited = rec.entries.filter((e) => e.earlier_owner).length;

  return (
    <Screen onRefresh={load}>
      {/* the one celebration: the record really did arrive (the claim succeeded on the server) */}
      {received ? (
        <Stamp haptics>
          <Card featured style={{ gap: space.xxs }}>
            <Text variant="heading" style={{ color: color.accent }}>
              Record received
            </Text>
            <Text>
              {`${inherited} ${inherited === 1 ? "entry" : "entries"} from the earlier owner ${inherited === 1 ? "is" : "are"} in your garage, read-only and marked as theirs.`}
            </Text>
          </Card>
        </Stamp>
      ) : null}
      <Card style={{ gap: space.sm }}>
        <View style={{ gap: space.xxs }}>
          <Text variant="title">{carName(rec.car)}</Text>
          <Text variant="caption" muted>
            {`${rec.owners} ${rec.owners === 1 ? "owner" : "owners"} on Dynorex · ${sold ? `sold ${recordDate(rec.sold_at!)}` : `yours since ${recordDate(rec.owner_since)}`}`}
          </Text>
        </View>
        <View
          style={styles.counts}
          accessible
          accessibilityLabel={`${s.entries} ${s.entries === 1 ? "entry" : "entries"}, ${s.withPaperwork} with paperwork, ${s.shopConfirmed} shop-confirmed`}
        >
          <Count n={s.entries} label={s.entries === 1 ? "entry" : "entries"} />
          <Count n={s.withPaperwork} label="with paperwork" />
          <Count n={s.shopConfirmed} label="shop-confirmed" lime />
        </View>
        <RecordStrip entries={rec.entries} />
        {s.flagged || data.waiting.length ? (
          <Text variant="caption" muted>
            {[
              s.flagged ? `${s.flagged} to ask about` : null,
              data.waiting.length
                ? `Waiting on ${data.waiting.length} shop ${data.waiting.length === 1 ? "answer" : "answers"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </Card>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {next ? <NextUp key={`${next.type}:${next.id}`} vehicleId={id} e={next} onAdded={load} /> : null}

      {sold ? (
        <InlineNotice
          title="Sold"
          body="You handed this record to the buyer. This is your read-only copy of what was logged until the sale."
        />
      ) : (
        <>
          {/* one lime action per screen: the buyer's link leads only when nothing needs paperwork first */}
          <BuyerLink
            vehicleId={id}
            link={data.link}
            car={carName(rec.car)}
            kind={rec.car.kind ?? null}
            onChange={load}
            primary={!next}
          />
          <BuyerBrief rec={rec} side="seller" />
          <ListingSheet record={rec} token={data.link?.token ?? null} />
          <Transfer vehicleId={id} kind={rec.car.kind ?? null} openUntil={data.transfer} onChange={load} />
        </>
      )}

      <RecordLegend />
      <SectionHeader>Entries</SectionHeader>
      {rec.entries.length === 0 ? (
        <Text muted>
          Nothing on the record yet. Finished mods, the service log and dyno results show here, with their paperwork.
        </Text>
      ) : null}
      {rec.entries.map((e, i) => (
        <RecordEntryCard
          key={`${e.type}:${e.id}`}
          e={e}
          index={i}
          backwards={back}
          onPress={() =>
            router.push({
              pathname: "/garage/[vehicleId]/record/[entryType]/[entryId]",
              params: { vehicleId: id, entryType: e.type, entryId: e.id },
            })
          }
        />
      ))}
    </Screen>
  );
}

/** A headline count that rolls up from zero when the record opens (static with reduced motion). */
function Count({ n, label, lime }: { n: number; label: string; lime?: boolean }) {
  const shown = useCountUp(n, 700);
  return (
    <View style={{ minWidth: 72 }}>
      <Text style={[type.impact, styles.count, lime && n > 0 ? { color: color.accent } : null]}>
        {String(Math.round(shown))}
      </Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

/**
 * The one thing that would back the record up most right now: paperwork for the newest bare mod or dyno run. For a
 * mod the receipt is snapped right here (D-67): one tap to the camera, filed to that mod, and the record reloads.
 * A dyno sheet still goes on the dyno screen. Gone as soon as there's nothing bare left.
 */
function NextUp({ vehicleId, e, onAdded }: { vehicleId: string; e: RecordEntry; onAdded: () => void }) {
  const dyno = e.type === "dyno";
  const uploads = usePhotoUploads(onAdded);
  const [error, setError] = useState<MappedError | null>(null);
  const what = dyno
    ? `the dyno sheet for your ${recordDate(e.date)} run`
    : `the receipt for ${[e.brand, e.title].filter(Boolean).join(" ")}`;
  const add = async (src: "camera" | "library") => {
    setError(null);
    const r = await pickPhoto(src);
    if (!r.ok) return setError(r.error);
    if (r.data) void uploads.add(r.data, { kind: "receipt", vehicleId, modId: e.id });
  };
  return (
    <Appear depth delay={350}>
      <Card featured style={{ gap: space.sm }}>
        <Text variant="label">Next up</Text>
        <Text>{`Add ${what}. It moves up to Paperwork on file, which a buyer can weigh.`}</Text>
        {dyno ? (
          <Button
            title="Add the sheet"
            variant="secondary"
            onPress={() => router.push({ pathname: "/garage/[vehicleId]/dyno", params: { vehicleId } })}
          />
        ) : (
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button title="Snap the receipt" disabled={uploads.busy} onPress={() => void add("camera")} />
            <Button
              title="Choose photo"
              variant="secondary"
              disabled={uploads.busy}
              onPress={() => void add("library")}
            />
          </View>
        )}
        {error ? <InlineError kind={error.key} /> : null}
        <UploadList
          items={uploads.items}
          onRetry={uploads.retry}
          onCancel={uploads.cancel}
          onDismiss={uploads.dismiss}
        />
      </Card>
    </Appear>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    counts: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
    count: { fontSize: 40, lineHeight: 42 },
    flapCell: {
      minWidth: 30,
      paddingHorizontal: space.xs,
      paddingVertical: space.xs,
      alignItems: "center",
      borderRadius: radius.sm,
      backgroundColor: color.surfaceRaised,
    },
    flapText: { ...type.impact, fontSize: 34, lineHeight: 38, color: color.accent },
  }),
);

/** The buyer's link (the D-61 service-history link, now showing the whole record). */
function BuyerLink({
  vehicleId,
  link,
  car,
  kind,
  onChange,
  primary = true,
}: {
  vehicleId: string;
  link: { token: string; expires_at: string } | null;
  car: string;
  kind: string | null;
  onChange: () => void;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const share = async (token: string) => {
    const url = shareUrl(historyPath(token));
    try {
      await Share.share({ message: `Build Record for my ${car}: ${url}`, url, title: `${car} Build Record` });
      analytics.track("build_shared", { share_method: "record" });
    } catch {
      setFallback(url);
    }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">Buyer&apos;s link</Text>
      <Text variant="caption" muted>
        {(() => {
          const id = identFor(kind).name;
          return `Anyone with the link sees every entry, edit and shop confirmation, and can check the ${id} on the ${nounOf(kind)} against yours without seeing it. Never your name, ${id}, costs, notes or photos. Works for 90 days. Making a link locks the ${id}.`;
        })()}
      </Text>
      {link ? (
        <>
          <Pop trigger={link.token} style={{ alignSelf: "flex-start" }}>
            <Text>{`On until ${recordDate(link.expires_at)}`}</Text>
          </Pop>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button
              title="Share link"
              variant={primary ? "primary" : "secondary"}
              onPress={() => void share(link.token)}
            />
            <Button
              title="See what buyers see"
              variant="secondary"
              onPress={() => router.push({ pathname: "/history/[token]", params: { token: link.token } })}
            />
            <Button
              title="Turn off"
              variant="secondary"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                const r = await recordsService.revokeHistoryShare(vehicleId);
                setBusy(false);
                if (!r.ok) return setError(r.error);
                setFallback(null);
                onChange();
              }}
            />
          </View>
        </>
      ) : (
        <Button
          title="Make a buyer's link"
          variant={primary ? "primary" : "secondary"}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            const r = await recordsService.createHistoryShare(vehicleId);
            setBusy(false);
            if (!r.ok) {
              haptic.warning();
              return setError(r.error);
            }
            haptic.success();
            onChange();
            void share(r.data);
          }}
        />
      )}
      {error ? <InlineError kind={error.key} /> : null}
      {fallback ? (
        <InlineNotice title="Link ready" body="Copy it from here.">
          <Text selectable>{fallback}</Text>
        </InlineNotice>
      ) : null}
    </Card>
  );
}

/**
 * The sale kit (D-68): a short ad for Marketplace or Craigslist, the full build sheet for an auction listing, and a
 * one-page for-sale sheet (PDF on phones) whose QR code opens the buyer's link.
 */
function ListingSheet({ record, token }: { record: BuildRecord; token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<{ title: string; text: string } | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const link = token ? shareUrl(historyPath(token)) : null;
  const car = carName(record.car);
  const share = async (text: string, format: "ad" | "text", title: string) => {
    try {
      await Share.share({ message: text, title: `${car} ${title}` });
      analytics.track("record_sheet_exported", { format });
    } catch {
      setFallback({ title, text });
    }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">Sale kit</Text>
      <Text variant="caption" muted>
        {link
          ? "Everything for the listing, built from your record, with your buyer's link in each."
          : "Everything for the listing, built from your record. Make a buyer's link first so buyers can open the full record."}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button
          title="Short ad"
          variant="secondary"
          accessibilityLabel="Share a short ad for Marketplace or Craigslist"
          onPress={() => void share(listingAdText(record, link), "ad", "ad")}
        />
        <Button
          title="Full build sheet"
          variant="secondary"
          accessibilityLabel="Share the full build sheet for an auction listing"
          onPress={() => void share(buildSheetText(record, link), "text", "Build Record")}
        />
        {Platform.OS !== "web" ? (
          <Button
            title="For-sale sheet"
            variant="secondary"
            accessibilityLabel="Save a one-page for-sale sheet as a PDF"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const html = buildSheetHtml(record, link, link ? qrSvg(link) : null);
                const { uri } = await Print.printToFileAsync({ html });
                await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${car} Build Record` });
                analytics.track("record_sheet_exported", { format: "pdf" });
              } catch {
                setError({ key: "server" });
              }
              setBusy(false);
            }}
          />
        ) : null}
      </View>
      <Text variant="caption" muted>
        Short ad: Marketplace or Craigslist. Full sheet: auctions like Bring a Trailer. For-sale sheet: a PDF to print
        and show with it, with a QR code to the record.
      </Text>
      {error ? <InlineError kind={error.key} /> : null}
      {fallback ? (
        <InlineNotice title={fallback.title === "ad" ? "Short ad" : "Build sheet"} body="Copy it from here.">
          <Text selectable>{fallback.text}</Text>
        </InlineNotice>
      ) : null}
    </Card>
  );
}

/** Handing the record to the buyer: a code shown once, plus the VIN (an e-moto's frame number) on their side. */
function Transfer({
  vehicleId,
  kind,
  openUntil,
  onChange,
}: {
  vehicleId: string;
  kind: string | null;
  openUntil: string | null;
  onChange: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label">Sold it? Hand over the record</Text>
      {code ? (
        <>
          <Text>{`Give the buyer this code. They also need the ${identFor(kind).name} off the ${nounOf(kind)}. It works once, for 14 days.`}</Text>
          {/* a departures board: each character clacks into place (the code is also selectable below) */}
          <SplitFlap
            text={code}
            label={`Transfer code ${code.split("").join(" ")}`}
            cellStyle={styles.flapCell}
            textStyle={styles.flapText}
          />
          <Text variant="caption" selectable muted>
            {`Copy it: ${code}`}
          </Text>
          <Text variant="caption" muted>
            You&apos;ll only see it now. If it&apos;s lost, cancel and make a new one.
          </Text>
        </>
      ) : openUntil ? (
        <>
          <Text>{`A transfer code is open until ${recordDate(openUntil)}.`}</Text>
          <Button
            title="Cancel the transfer"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const r = await recordService.cancelTransfer(vehicleId);
              setBusy(false);
              if (!r.ok) return setError(r.error);
              onChange();
            }}
          />
        </>
      ) : (
        <>
          <Text variant="caption" muted>
            {`The buyer gets this ${nounOf(kind)} in their garage with every entry, edit and shop confirmation, read-only. Your photos, posts, costs and notes stay with you, and your copy becomes read-only. Needs the ${identFor(kind).name} on the ${nounOf(kind)}'s record.`}
          </Text>
          <Button
            title="Get a transfer code"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              const r = await recordService.startTransfer(vehicleId);
              setBusy(false);
              if (!r.ok) {
                haptic.warning();
                return setError(r.error);
              }
              analytics.track("record_transfer_started", {});
              setCode(r.data);
            }}
          />
        </>
      )}
      {error ? <InlineError kind={error.key} /> : null}
    </Card>
  );
}

/** "car", "bike" or "e-moto" for the record's vehicle (D-74). */
const nounOf = (kind: string | null) => (kind === "ebike" ? "e-moto" : kind === "motorcycle" ? "bike" : "car");
