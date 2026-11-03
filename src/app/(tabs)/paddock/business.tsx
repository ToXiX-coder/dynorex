import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { FieldError, TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import {
  MAX_SERVICES,
  PRICE_TYPES,
  servicePrice,
  validateBusiness,
  validateService,
  type BusinessDraft,
  type BusinessErrors,
  type ServiceDraft,
  type ServiceErrors,
} from "@/domain/services";
import { MOD_CATEGORIES } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { categoryLabel } from "@/features/paddock/shop/ShopBits";
import { servicesService } from "@/features/paddock/servicesService";
import { ShopInbox } from "@/features/record/ShopInbox";
import { useFlags } from "@/providers/AppProviders";
import type { BusinessRow, BusinessServiceRow } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

const toDraft = (b: BusinessRow | null, fallbackLocation: string): BusinessDraft => ({
  name: b?.name ?? "",
  about: b?.about ?? "",
  location: b?.location_text ?? fallbackLocation,
  website: b?.website ?? "",
  phone: b?.phone ?? "",
  specialties: b?.specialties ?? [],
});
const EMPTY_SERVICE: ServiceDraft = { name: "", description: "", category: null, priceType: "quote", price: "" };

/** Set up or edit your business page and its service menu. One page per account. */
export default function YourBusiness() {
  const flags = useFlags();
  const { status, profile } = useAuth();
  const [biz, setBiz] = useState<BusinessRow | null | undefined>(undefined);
  const [services, setServices] = useState<BusinessServiceRow[]>([]);
  const [draft, setDraft] = useState<BusinessDraft | null>(null);
  const [errors, setErrors] = useState<BusinessErrors>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    void Promise.all([servicesService.myBusiness(), servicesService.myServices()]).then(([b, s]) => {
      const row = b.ok ? b.data : null;
      setBiz(row);
      setServices(s.ok ? s.data : []);
      setDraft((d) => d ?? toDraft(row, profile?.general_location ?? ""));
    });
  }, [profile?.general_location]);
  useFocusEffect(load);

  if (!flags.marketplace) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to list your business" />
      </Screen>
    );
  if (biz === undefined || !draft) return <LoadingState label="Loading your business" />;

  const set = (patch: Partial<BusinessDraft>) => setDraft({ ...draft, ...patch });
  const save = async () => {
    setError(null);
    setSaved(false);
    const v = validateBusiness(draft);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const r = biz
      ? await servicesService.updateBusiness(biz.id, v.value)
      : await servicesService.createBusiness(v.value);
    setBusy(false);
    if (!r.ok) {
      if (r.error.key === "businessNameTaken") return setErrors({ name: "Another business uses that name" });
      return setError(r.error);
    }
    setSaved(true);
    load();
  };

  return (
    <Screen>
      {!biz ? (
        <Text>
          Run a shop, detailing business or mobile mechanic service? Make a page so drivers can find you in Paddock and
          send requests.
        </Text>
      ) : (
        <Button title="View your public page" variant="secondary" onPress={() => router.push(`/business/${biz.id}`)} />
      )}
      <TextField
        label="Business name"
        required
        value={draft.name}
        onChangeText={(name) => set({ name })}
        maxLength={60}
        error={errors.name}
        placeholder="Sample Speed Shop"
      />
      <TextField
        label="City or area"
        required
        value={draft.location}
        onChangeText={(location) => set({ location })}
        maxLength={80}
        error={errors.location}
        placeholder="Sample City"
      />
      <TextField
        label="About (optional)"
        value={draft.about}
        onChangeText={(about) => set({ about })}
        multiline
        maxLength={2000}
        error={errors.about}
        placeholder="What you work on, hours, how to find you"
      />
      <View style={{ gap: space.xs }}>
        <Text variant="label">Specialties</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {MOD_CATEGORIES.map((c) => {
            const on = draft.specialties.includes(c.id);
            return (
              <Chip
                key={c.id}
                label={c.label}
                selected={on}
                onPress={() =>
                  set({
                    specialties: on ? draft.specialties.filter((x) => x !== c.id) : [...draft.specialties, c.id],
                  })
                }
              />
            );
          })}
        </View>
      </View>
      <TextField
        label="Website (optional, shown publicly)"
        value={draft.website}
        onChangeText={(website) => set({ website })}
        autoCapitalize="none"
        keyboardType="url"
        error={errors.website}
        placeholder="sample-speed-shop.com"
      />
      <TextField
        label="Business phone (optional, shown publicly)"
        value={draft.phone}
        onChangeText={(phone) => set({ phone })}
        keyboardType="phone-pad"
        error={errors.phone}
        placeholder="+1 555 0100"
        hint="Only add a number you're happy for anyone to see. Requests in the app work without it."
      />
      {error ? <InlineError kind={error.key} /> : null}
      {saved ? <InlineNotice title={biz ? "Saved" : "Your page is up"} /> : null}
      <Button
        title={biz ? "Save changes" : "Create business page"}
        fullWidth
        loading={busy}
        onPress={() => void save()}
      />
      <Text variant="caption" muted>
        Your page is public. Dynorex doesn&apos;t verify shops by default; staff can add a VERIFIED tag after confirming
        a business is real.
      </Text>

      {biz ? (
        <>
          <SectionHeader>Your services</SectionHeader>
          <Text variant="caption" muted>{`${services.length} of ${MAX_SERVICES}`}</Text>
          {services.map((s) => (
            <ServiceEditor key={s.id} businessId={biz.id} service={s} onChanged={load} />
          ))}
          {services.length < MAX_SERVICES ? (
            <ServiceEditor businessId={biz.id} service={null} onChanged={load} />
          ) : null}
          <ShopInbox />
          <Button title="Delete business page" variant="destructive" onPress={() => setConfirmDelete(true)} />
          <ConfirmModal
            visible={confirmDelete}
            kind="deleteBusiness"
            busy={busy}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setConfirmDelete(false);
              const r = await servicesService.deleteBusiness(biz.id);
              if (!r.ok) return setError(r.error);
              setDraft(null);
              setBiz(null);
              router.replace({ pathname: "/paddock", params: { section: "services" } });
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

/** One service: shown compact, edited in place. `service: null` is the "Add a service" form. */
function ServiceEditor({
  businessId,
  service,
  onChanged,
}: {
  businessId: string;
  service: BusinessServiceRow | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceDraft>(
    service
      ? {
          name: service.name,
          description: service.description ?? "",
          category: service.category,
          priceType: service.price_type,
          price:
            service.price_minor === null ? "" : (service.price_minor / 100).toFixed(service.price_minor % 100 ? 2 : 0),
        }
      : EMPTY_SERVICE,
  );
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);

  if (!editing)
    return service ? (
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {service.name}
          </Text>
          <Text variant="caption">{servicePrice(service)}</Text>
        </View>
        <Text variant="caption" muted>
          {categoryLabel(service.category)}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Edit" variant="secondary" onPress={() => setEditing(true)} />
          <Button
            title="Remove"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              await servicesService.deleteService(service.id);
              setBusy(false);
              onChanged();
            }}
          />
        </View>
      </Card>
    ) : (
      <Button title="Add a service" onPress={() => setEditing(true)} />
    );

  const set = (patch: Partial<ServiceDraft>) => setDraft({ ...draft, ...patch });
  const save = async () => {
    setError(null);
    const v = validateService(draft);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const r = service
      ? await servicesService.updateService(service.id, v.value)
      : await servicesService.addService(businessId, v.value);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setEditing(false);
    if (!service) setDraft(EMPTY_SERVICE);
    onChanged();
  };

  return (
    <Card>
      <TextField
        label="Service"
        required
        value={draft.name}
        onChangeText={(name) => set({ name })}
        maxLength={80}
        error={errors.name}
        placeholder="Dyno tune"
      />
      <View style={{ gap: space.xs }}>
        <Text variant="label">Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {MOD_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={draft.category === c.id}
              onPress={() => set({ category: c.id })}
            />
          ))}
        </View>
        {errors.category ? <FieldError message={errors.category} /> : null}
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label">Pricing</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {PRICE_TYPES.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={draft.priceType === p.id}
              onPress={() => set({ priceType: p.id })}
            />
          ))}
        </View>
        <Text variant="caption" muted>
          {PRICE_TYPES.find((p) => p.id === draft.priceType)!.detail}
        </Text>
      </View>
      {draft.priceType !== "quote" ? (
        <TextField
          label="Price in dollars"
          required
          value={draft.price}
          onChangeText={(price) => set({ price })}
          keyboardType="decimal-pad"
          error={errors.price}
          placeholder="450"
        />
      ) : null}
      <TextField
        label="Details (optional)"
        value={draft.description}
        onChangeText={(description) => set({ description })}
        multiline
        maxLength={1000}
        error={errors.description}
      />
      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title={service ? "Save" : "Add"} loading={busy} onPress={() => void save()} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
      </View>
    </Card>
  );
}
