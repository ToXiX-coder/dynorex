import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { summary } from "@/domain/evidence";
import { backwardsEntries } from "@/domain/odometer";
import { isVinShape, normalizeVin, vinTail } from "@/domain/vin";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";
import { Guard } from "@/ui/Guard";
import { useLoad } from "@/ui/hooks";
import { Button, Card, Field, Loading, Notice, Screen, T } from "@/ui/kit";
import { EntryCard } from "@/ui/record";

export default function CarRecord() {
  return (
    <Guard>
      <Record />
    </Guard>
  );
}

function Record() {
  const { carId } = useLocalSearchParams<{ carId: string }>();
  const { data, error, reload } = useLoad(
    async (api) => {
      const [cars, entries] = await Promise.all([api.myCars(), api.entries(carId)]);
      return { car: cars.find((c) => c.id === carId) ?? null, entries };
    },
    [carId],
  );
  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  const { car, entries } = data;
  if (!car) return <Screen><Notice tone="danger">This car isn&apos;t in your garage.</Notice></Screen>;

  const s = summary(entries);
  const back = backwardsEntries(entries);
  const title = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const newest = [...entries].sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen>
      <Stack.Screen options={{ title: car.nickname ?? car.model }} />
      <View style={{ gap: 4 }}>
        <T v="title">{title}</T>
        <T v="mono" muted>
          {car.archived ? "Sold · read-only copy" : `VIN ${vinTail(car.vin)}`}
        </T>
      </View>
      <Card>
        <T v="small">
          {s.entries} {s.entries === 1 ? "entry" : "entries"} · {s.withReceipts} with receipts · {s.shopConfirmed} shop-confirmed
          {s.flagged ? ` · ${s.flagged} flagged` : ""}
        </T>
      </Card>
      {car.archived ? (
        <Notice>You sold this car. This is your copy of what was logged until the sale; it can&apos;t be changed.</Notice>
      ) : (
        <>
          {!car.vin ? <AddVin carId={car.id} onDone={reload} /> : null}
          <Button label="Log work" onPress={() => router.push({ pathname: "/car/[carId]/add", params: { carId: car.id } })} />
          <Button
            kind="secondary"
            label="Share and sell"
            onPress={() => router.push({ pathname: "/car/[carId]/share", params: { carId: car.id } })}
          />
        </>
      )}
      <T v="label">Work history</T>
      {newest.length === 0 ? <T muted>Nothing logged yet.</T> : null}
      {newest.map((e) => (
        <EntryCard
          key={e.id}
          e={e}
          backwards={back.has(e.id)}
          onPress={() => router.push({ pathname: "/car/[carId]/entry/[entryId]", params: { carId: car.id, entryId: e.id } })}
        />
      ))}
    </Screen>
  );
}

function AddVin({ carId, onDone }: { carId: string; onDone: () => void }) {
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <T v="heading">Add the VIN</T>
      <T v="small" muted>
        Needed before you can hand the record to a buyer. Only you see it, and it can&apos;t be changed later.
      </T>
      <Field label="VIN" value={vin} onChangeText={setVin} autoCapitalize="characters" maxLength={20} error={error} />
      <Button
        label="Save VIN"
        busy={busy}
        disabled={!isVinShape(vin)}
        onPress={async () => {
          setBusy(true);
          try {
            await getApi()!.setVin(carId, normalizeVin(vin));
            onDone();
          } catch (e) {
            setError(errorText(e));
          }
          setBusy(false);
        }}
      />
    </Card>
  );
}
