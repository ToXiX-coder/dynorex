import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { DateField } from "@/components/forms/PickerFields";
import { TextField } from "@/components/forms/TextField";
import { ClubCrest } from "@/components/paddock/ClubCrest";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { isUuid, userPath } from "@/domain/deepLinks";
import { servicePrice } from "@/domain/services";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { VerifiedTag } from "@/features/paddock/services/ServicesSection";
import { categoryLabel } from "@/features/paddock/shop/ShopBits";
import { servicesService } from "@/features/paddock/servicesService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { useGoToSignIn } from "@/features/social/FollowButton";
import { SaveButton } from "@/features/social/SaveButton";
import { useFlags } from "@/providers/AppProviders";
import type { PublicBusiness, PublicBusinessService } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, space, touch, type } from "@/theme/tokens";

/**
 * dynorex.app/business/:businessId. Anyone can see a shop's page and service menu; signed-in drivers send a
 * quote or booking request, which opens a private chat with the shop. No payments in the app.
 */
export default function BusinessScreen() {
  const flags = useFlags();
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const id = String(businessId ?? "");
  const { status, profile } = useAuth();
  const signed = status === "signedIn";
  const [biz, setBiz] = useState<PublicBusiness | null | undefined>(undefined);
  const [services, setServices] = useState<PublicBusinessService[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = isUuid(id)
      ? Promise.all([servicesService.business(id), servicesService.services(id)])
      : Promise.resolve(null);
    void load.then((r) => {
      if (!alive) return;
      const [b, s] = r ?? [];
      setBiz(b?.ok ? b.data : null);
      setServices(s?.ok ? s.data : []);
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  if (!flags.marketplace) return <ComingSoon title="Services" lines={["Shops near you, in Paddock"]} />;
  if (biz === undefined) return <LoadingState label="Loading shop" />;
  if (biz === null)
    return (
      <Screen>
        <ErrorState
          kind="buildNotFound"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/paddock"))}
        />
      </Screen>
    );
  const mine = !!profile?.username && profile.username === biz.owner_username;

  return (
    <Screen onRefresh={() => setReload((n) => n + 1)}>
      <ScreenMenu
        title={biz.name}
        label="Shop options"
        actions={[
          ...(mine ? [{ label: "Edit your business", onPress: () => router.push("/paddock/business") }] : []),
          ...(signed && !mine
            ? [
                {
                  label: "Report this business",
                  hint: "Tell Dynorex about a problem.",
                  onPress: () => setReporting(true),
                },
              ]
            : []),
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <ClubCrest name={biz.name} size={84} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text variant="display" style={{ fontSize: 24, lineHeight: 30 }}>
            {biz.name}
          </Text>
          {biz.verified ? (
            <VerifiedTag />
          ) : (
            <Text variant="caption" muted>
              Not verified by Dynorex
            </Text>
          )}
        </View>
      </View>
      <Text variant="caption">
        {`${biz.location_text}${biz.jobs_completed ? ` · ${biz.jobs_completed} job${biz.jobs_completed === 1 ? "" : "s"} done in Dynorex` : ""}`}
      </Text>
      {biz.specialties.length ? (
        <Text variant="caption" muted>{`Specialties: ${biz.specialties.map(categoryLabel).join(", ")}`}</Text>
      ) : null}
      {biz.about ? <Text>{biz.about}</Text> : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Run by @${biz.owner_username}. Open profile`}
        onPress={() => router.push(userPath(biz.owner_username))}
        style={withPress({ minHeight: touch.min, justifyContent: "center" })}
      >
        <Text variant="bodyStrong" style={{ color: color.accent }}>{`Run by @${biz.owner_username} ›`}</Text>
      </Pressable>
      {biz.website || biz.phone ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {biz.website ? (
            <Button title="Website" variant="secondary" onPress={() => void Linking.openURL(biz.website!)} />
          ) : null}
          {biz.phone ? (
            <Button
              title={`Call ${biz.phone}`}
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${biz.phone!.replace(/[^\d+]/g, "")}`)}
            />
          ) : null}
        </View>
      ) : null}

      {!mine ? <SaveButton kind="business" id={id} /> : null}

      <SectionHeader>Services</SectionHeader>
      {services.length === 0 ? <Text muted>No services listed yet.</Text> : null}
      {services.map((s) => (
        <Card key={s.service_id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {s.name}
            </Text>
            <Text style={[type.spec, { fontSize: 18, lineHeight: 22, color: color.accent }]}>{servicePrice(s)}</Text>
          </View>
          <Text variant="caption" muted>
            {categoryLabel(s.category)}
          </Text>
          {s.description ? <Text>{s.description}</Text> : null}
          {mine ? null : asking === s.service_id ? (
            <RequestForm service={s} onDone={() => setAsking(null)} />
          ) : (
            <RequestButton signed={signed} onPress={() => setAsking(s.service_id)} />
          )}
        </Card>
      ))}
      <Text variant="caption" muted>
        Prices are set by the shop and may change after they see your car. Dynorex doesn&apos;t take payment or
        guarantee the work.
      </Text>
      <ReportSheet visible={reporting} target={{ type: "business", id }} onClose={() => setReporting(false)} />
    </Screen>
  );
}

function RequestButton({ signed, onPress }: { signed: boolean; onPress: () => void }) {
  const goToSignIn = useGoToSignIn();
  return signed ? (
    <Button title="Request this" variant="secondary" onPress={onPress} />
  ) : (
    <Button title="Sign in to request" variant="secondary" onPress={goToSignIn} />
  );
}

function RequestForm({ service, onDone }: { service: PublicBusinessService; onDone: () => void }) {
  const [cars, setCars] = useState<VehicleCard[]>([]);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    void buildService.listVehicles(0).then((r) => r.ok && setCars(r.data));
  }, []);

  if (sentId)
    return (
      <InlineNotice title="Request sent" body="The shop gets a notification. Keep talking in the request chat.">
        <Button title="Open chat" onPress={() => router.push(`/requests/${sentId}`)} />
      </InlineNotice>
    );

  const today = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const send = async () => {
    setError(null);
    if (!message.trim()) return setMessageError("Tell the shop what you need");
    setMessageError(null);
    setBusy(true);
    const r = await servicesService.request({
      serviceId: service.service_id,
      vehicle,
      date: date || null,
      message: message.trim(),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSentId(r.data);
  };

  return (
    <View style={{ gap: space.sm }}>
      {cars.length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label">Which car (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {cars.map((c) => {
              const label = `${c.year} ${c.make} ${c.model}`;
              return (
                <Chip
                  key={c.id}
                  label={label}
                  selected={vehicle === label}
                  onPress={() => setVehicle(vehicle === label ? null : label)}
                />
              );
            })}
          </View>
        </View>
      ) : null}
      <DateField
        label="Preferred date (optional)"
        value={date}
        onChange={setDate}
        min={ymd(today)}
        max={ymd(new Date(today.getTime() + 365 * 86_400_000))}
        hint="The shop confirms the actual time with you."
      />
      <TextField
        label="What do you need"
        required
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={1000}
        error={messageError}
        placeholder="What's done to the car, what you're after, questions"
      />
      <Text variant="caption" muted>
        The shop sees your username, the car you picked and this message. Your VIN and garage details stay private.
      </Text>
      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title="Send request" loading={busy} onPress={() => void send()} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={onDone} />
      </View>
    </View>
  );
}
