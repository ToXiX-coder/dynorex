import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SignedImage } from "@/components/build/SignedImage";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LastUpdated } from "@/components/feedback/OfflineBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { ListGroup, ListRow } from "@/components/lists/ListGroup";
import { Appear } from "@/components/motion/Motion";
import { Text } from "@/components/Text";
import { VehicleArt } from "@/components/vehicle/VehicleArt";
import { kindLabel, kindOf, kwText } from "@/domain/vehicleKind";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { useCachedLoad } from "@/hooks/useCachedLoad";
import { color, layout, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";

export default function Garage() {
  const { status } = useAuth();
  if (status !== "signedIn") {
    return (
      <View style={styles.pad}>
        <SignInPrompt message="Sign in to open your garage" />
      </View>
    );
  }
  return <GarageList />;
}

function GarageList() {
  const { data, loading, error, refresh, staleLabel } = useCachedLoad("garage", () => buildService.listVehicles(0));
  const [plan, setPlan] = useState<{ plus: boolean; vehicle_limit: number | null } | null>(null);

  useEffect(() => {
    void buildService.myPlan().then((r) => r.ok && setPlan(r.data));
  }, [data]);

  if (!data && loading) return <LoadingState label="Loading your garage" />;
  if (!data && error) {
    return (
      <View style={styles.pad}>
        <ErrorState kind={error.key} onAction={() => void refresh()} />
      </View>
    );
  }

  const vehicles = data ?? [];
  // a car you sold (D-64) stays as a read-only copy and doesn't use up the free plan
  const atLimit =
    plan && plan.vehicle_limit !== null && vehicles.filter((v) => !v.sold_at).length >= plan.vehicle_limit;

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      data={vehicles}
      keyExtractor={(v) => v.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={color.accent} />}
      ListHeaderComponent={
        <View style={{ gap: space.sm }}>
          <LastUpdated label={staleLabel} />
          {error && data ? <InlineError kind={error.key} onAction={() => void refresh()} /> : null}
          {/* one main action; at the free limit the plan note under the cars takes over from a dead button */}
          {vehicles.length && !atLimit ? (
            <Button title="Add vehicle" fullWidth onPress={() => router.push("/garage/new")} />
          ) : null}
        </View>
      }
      ListFooterComponent={
        vehicles.length ? (
          <View style={{ gap: space.lg, marginTop: space.sm }}>
            {atLimit && plan ? (
              <Card style={{ gap: space.sm }}>
                <Text variant="bodyStrong">{`Free plan: ${plan.vehicle_limit} cars`}</Text>
                <Text variant="caption" muted>
                  Dynorex+ makes it unlimited. Cars you&apos;ve sold don&apos;t count.
                </Text>
                <View style={{ alignSelf: "flex-start" }}>
                  <Button title="See Dynorex+" variant="secondary" onPress={() => router.push("/plus")} />
                </View>
              </Card>
            ) : null}
            {/* the rest of the garage, as a grouped list instead of a pile of buttons */}
            <ListGroup>
              <ListRow title="Wishlist" detail="Parts you want next" onPress={() => router.push("/garage/wishlist")} />
              <ListRow
                title="Tools"
                detail="Tire size, wheel offset, gearing and more"
                onPress={() => router.push("/tools")}
              />
              <ListRow
                title="Take over a record"
                detail="Bought one with a Build Record? Claim it here."
                onPress={() => router.push("/garage/claim")}
              />
            </ListGroup>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={{ gap: space.md }}>
          <EmptyState
            expression="shrugging"
            message="Your garage is empty"
            detail="Add your first vehicle to start your build story."
            action={{ title: "Add vehicle", onPress: () => router.push("/garage/new") }}
          />
          <Button title="Wishlist" variant="secondary" onPress={() => router.push("/garage/wishlist")} />
          <Button
            title="Bought a vehicle with a Build Record?"
            variant="secondary"
            onPress={() => router.push("/garage/claim")}
          />
        </View>
      }
      renderItem={({ item, index }) => (
        // cars roll in one after another, with depth
        <Appear depth index={index}>
          <VehicleCardView v={item} />
        </Appear>
      )}
    />
  );
}

function VehicleCardView({ v }: { v: VehicleCard }) {
  const name = `${v.year} ${v.make} ${v.model}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${v.nickname ? `${v.nickname}, ` : ""}${name}${v.trim_level ? ` ${v.trim_level}` : ""}. ${v.visibility === "public" ? "Public" : "Private"}`}
      onPress={() => router.push(`/garage/${v.id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {v.hero_path ? (
          <SignedImage path={v.hero_path} alt={`Photo of ${name}`} style={styles.hero} />
        ) : (
          <VehicleArt
            make={v.make}
            model={v.model}
            year={v.year}
            seed={v.id}
            hint={v.nickname}
            kind={kindOf(v)}
            label={false}
            style={[styles.hero, styles.noHero]}
          />
        )}
        <View style={{ padding: space.md, gap: space.xxs }}>
          {v.nickname ? <Text variant="heading">{v.nickname}</Text> : null}
          <Text variant={v.nickname ? "body" : "heading"}>{`${name}${v.trim_level ? ` ${v.trim_level}` : ""}`}</Text>
          <Text variant="caption" muted>
            {`${kindOf(v) === "car" ? "" : `${kindLabel(kindOf(v))} · `}${v.sold_at ? "Sold · read-only" : v.visibility === "public" ? "Public" : "Private"}${
              kindOf(v) === "ebike"
                ? v.motor_w
                  ? ` · ${kwText(v.motor_w)} peak`
                  : ""
                : v.baseline_hp
                  ? ` · stock ${Math.round(Number(v.baseline_hp))} hp (${v.baseline_looked_up?.includes("baseline_hp") ? "factory" : "your number"})`
                  : ""
            }`}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pad: { flex: 1, padding: layout.screenGutter, backgroundColor: color.background, gap: space.lg },
    list: { padding: layout.screenGutter, gap: space.md, paddingBottom: space.huge, backgroundColor: color.background },
    hero: { width: "100%", height: 160 },
    noHero: { borderBottomWidth: 3, borderBottomColor: color.accent },
  }),
);
