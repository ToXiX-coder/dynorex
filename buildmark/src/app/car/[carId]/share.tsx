import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform } from "react-native";
import { buildSheetHtml, buildSheetText } from "@/domain/buildSheet";
import { formatDate } from "@/domain/evidence";
import { publicLink } from "@/services/config";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { shareText, useLoad } from "@/ui/hooks";
import { Button, Card, Loading, Notice, Screen, T } from "@/ui/kit";

export default function ShareScreen() {
  return (
    <Guard>
      <ShareAndSell />
    </Guard>
  );
}

function ShareAndSell() {
  const { carId } = useLocalSearchParams<{ carId: string }>();
  const { data, error, reload } = useLoad(
    async (api) => {
      const [token, transfer, cars] = await Promise.all([api.myShareLink(carId), api.openTransfer(carId), api.myCars()]);
      const record = token ? await api.publicRecord(token) : null;
      return { token, transfer, record, car: cars.find((c) => c.id === carId) ?? null };
    },
    [carId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  const url = data.token ? publicLink(`/r/${data.token}`) : null;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errorText(e));
    }
    setBusy(null);
  }
  const said = (r: "copied" | "shared" | "failed", what: string) =>
    setMsg(r === "copied" ? `${what} copied.` : r === "shared" ? `${what} sent.` : `Couldn't share the ${what.toLowerCase()}.`);

  return (
    <Screen>
      <T v="title">Share and sell</T>

      <Card>
        <T v="heading">The buyer&apos;s link</T>
        <T v="small" muted>
          Shows every entry, edit and shop confirmation. Never your name, VIN, costs or notes. A buyer can check the VIN
          on the car against the record without seeing it.
        </T>
        {url ? (
          <>
            <T v="mono" selectable>
              {url}
            </T>
            <Button label="Copy or send the link" onPress={async () => said(await shareText(url), "Link")} />
            <Button kind="secondary" label="See what buyers see" onPress={() => router.push({ pathname: "/r/[token]", params: { token: data.token! } })} />
            <Button
              kind="danger"
              label="Turn the link off"
              busy={busy === "revoke"}
              onPress={() => run("revoke", async () => { await getApi()!.revokeShareLink(carId); await reload(); })}
            />
          </>
        ) : (
          <Button
            label="Make a link"
            busy={busy === "link"}
            onPress={() => run("link", async () => { await getApi()!.createShareLink(carId); await reload(); })}
          />
        )}
      </Card>

      {data.record ? (
        <Card>
          <T v="heading">Build sheet for your listing</T>
          <T v="small" muted>
            Text to paste into an auction listing or classified ad, with the link so buyers can check the details.
          </T>
          <Button
            kind="secondary"
            label="Copy the build sheet"
            onPress={async () => said(await shareText(buildSheetText(data.record!, url)), "Build sheet")}
          />
          {Platform.OS !== "web" ? (
            <Button
              kind="secondary"
              label="Save as PDF"
              busy={busy === "pdf"}
              onPress={() =>
                run("pdf", async () => {
                  const { uri } = await Print.printToFileAsync({ html: buildSheetHtml(data.record!, url) });
                  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
                })
              }
            />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <T v="heading">Hand the record to the buyer</T>
        {data.car?.vin ? (
          code ? (
            <>
              <T v="small">Give the buyer this code. They also need the VIN from the car. It works once, for 14 days.</T>
              <T v="title" selectable style={{ letterSpacing: 3 }}>
                {code}
              </T>
              <Notice tone="flag">You&apos;ll only see this code now. If you lose it, make a new one.</Notice>
            </>
          ) : data.transfer ? (
            <>
              <T v="small">A transfer code is open until {formatDate(data.transfer)}.</T>
              <Button
                kind="danger"
                label="Cancel the transfer"
                busy={busy === "cancel"}
                onPress={() => run("cancel", async () => { await getApi()!.cancelTransfer(carId); await reload(); })}
              />
            </>
          ) : (
            <>
              <T v="small" muted>
                When the buyer takes over, the record moves to their account with every entry intact, your link stops
                working, and you keep a read-only copy of what you logged.
              </T>
              <Button
                label="Get a transfer code"
                busy={busy === "transfer"}
                onPress={() => run("transfer", async () => { setCode(await getApi()!.startTransfer(carId)); await reload(); })}
              />
            </>
          )
        ) : (
          <T v="small" muted>
            Add the VIN on the record page first. The buyer proves they have the car by entering it.
          </T>
        )}
      </Card>
      {msg ? <Notice>{msg}</Notice> : null}
    </Screen>
  );
}
