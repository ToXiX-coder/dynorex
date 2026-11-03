import { router } from "expo-router";
import { View } from "react-native";
import { vinTail } from "@/domain/vin";
import { Guard } from "@/ui/Guard";
import { useLoad } from "@/ui/hooks";
import { Button, Card, Loading, Notice, Screen, T } from "@/ui/kit";

export default function Garage() {
  return (
    <Guard>
      <GarageList />
    </Guard>
  );
}

function GarageList() {
  const { data: cars, error } = useLoad((api) => api.myCars(), []);
  const current = cars?.filter((c) => !c.archived) ?? [];
  const sold = cars?.filter((c) => c.archived) ?? [];
  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T v="title">Your cars</T>
        <T muted>Log the work as it happens. When you sell, the record goes to the buyer.</T>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!cars && !error ? <Loading /> : null}
      {cars && current.length === 0 ? (
        <Card>
          <T v="heading">Start a record</T>
          <T muted>Add your car, then log each mod with the receipt and who fitted it.</T>
        </Card>
      ) : null}
      {current.map((c) => (
        <Card key={c.id} onPress={() => router.push({ pathname: "/car/[carId]", params: { carId: c.id } })}>
          <T v="label">{c.nickname ?? "Car"}</T>
          <T v="heading">{[c.year, c.make, c.model, c.trim].filter(Boolean).join(" ")}</T>
          <T v="mono" muted>
            VIN {vinTail(c.vin)}
          </T>
        </Card>
      ))}
      <Button label="Add a car" onPress={() => router.push("/car/new")} />
      <Button kind="secondary" label="Take over a record from a seller" onPress={() => router.push("/claim")} />
      {sold.length > 0 ? (
        <View style={{ gap: 12 }}>
          <T v="label">Cars you sold · read-only</T>
          {sold.map((c) => (
            <Card key={c.id} onPress={() => router.push({ pathname: "/car/[carId]", params: { carId: c.id } })}>
              <T v="heading">{[c.year, c.make, c.model, c.trim].filter(Boolean).join(" ")}</T>
              <T muted v="small">
                Your copy of what was logged until the sale.
              </T>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
