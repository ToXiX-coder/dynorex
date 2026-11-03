import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { FieldError as SharedFieldError, TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { isUuid } from "@/domain/deepLinks";
import {
  categoryForListingTitle,
  CONDITIONS,
  LISTING_LIMIT,
  validateListing,
  type DraftErrors,
  type ListingDraft,
} from "@/domain/shop";
import { MOD_CATEGORIES } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { shopService } from "@/features/paddock/shopService";
import { useFlags } from "@/providers/AppProviders";
import { pickPhoto, type PreparedPhoto } from "@/services/media/photos";
import { radius, space } from "@/theme/tokens";

const EMPTY: ListingDraft = {
  title: "",
  description: "",
  category: null,
  condition: null,
  price: "",
  fits: "",
  location: "",
};

/**
 * List a part for sale, or edit one (?listingId=). The category follows the title until you pick one yourself.
 * The photo uploads after the listing is saved, through the same checked pipeline as build photos.
 */
export default function Sell() {
  const flags = useFlags();
  const { status, profile } = useAuth();
  const { listingId } = useLocalSearchParams<{ listingId?: string }>();
  const editId = typeof listingId === "string" && isUuid(listingId) ? listingId : null;
  // a new listing starts in your general area (never a precise place)
  const [draft, setDraft] = useState<ListingDraft | null>(
    editId ? null : { ...EMPTY, location: profile?.general_location ?? "" },
  );
  const [categoryPicked, setCategoryPicked] = useState(!!editId);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [cars, setCars] = useState<VehicleCard[]>([]);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<ErrorKey | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const uploads = usePhotoUploads();

  useEffect(() => {
    void buildService.listVehicles(0).then((r) => r.ok && setCars(r.data));
  }, []);
  useEffect(() => {
    if (!editId) return;
    void shopService.myListings().then((r) => {
      const l = r.ok ? r.data.find((x) => x.listing_id === editId) : undefined;
      if (!l) return setError({ key: "buildNotFound" });
      setDraft({
        title: l.title,
        description: l.description ?? "",
        category: l.category,
        condition: l.condition,
        price: (l.price_minor / 100).toFixed(l.price_minor % 100 ? 2 : 0),
        fits: l.fits ?? "",
        location: l.location_text,
      });
    });
  }, [editId]);

  if (!flags.marketplace) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to sell a part" />
      </Screen>
    );
  if (!draft) return error ? <InlineError kind={error.key} /> : <LoadingState label="Loading listing" />;

  const set = (patch: Partial<ListingDraft>) => setDraft({ ...draft, ...patch });
  const setTitle = (title: string) =>
    set(categoryPicked ? { title } : { title, category: categoryForListingTitle(title) ?? draft.category });

  const submit = async () => {
    setError(null);
    const v = validateListing(draft);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const r = editId ? await shopService.update(editId, v.value) : await shopService.create(v.value);
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    const id = editId ?? (r.data as string);
    if (photo && !(await uploads.add(photo, { kind: "listing", listingId: id }))) {
      // the listing is saved; keep the screen so the failed photo can be retried (shown in the upload list)
      setBusy(false);
      setSavedId(id);
      return;
    }
    setBusy(false);
    router.replace(`/listings/${id}`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: editId ? "Edit listing" : "Sell a part" }} />
      <TextField
        label="What are you selling"
        required
        value={draft.title}
        onChangeText={setTitle}
        maxLength={80}
        error={errors.title}
        placeholder="Cat-back exhaust"
      />
      <View style={{ gap: space.xs }}>
        <Text variant="label">
          Category
          {!categoryPicked && draft.category ? (
            <Text variant="label" muted>
              {" "}
              (picked from the title)
            </Text>
          ) : null}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {MOD_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={draft.category === c.id}
              onPress={() => {
                setCategoryPicked(true);
                set({ category: c.id });
              }}
            />
          ))}
        </View>
        <FieldError message={errors.category} />
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label">Condition</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {CONDITIONS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={draft.condition === c.id}
              onPress={() => set({ condition: c.id })}
            />
          ))}
        </View>
        {draft.condition ? (
          <Text variant="caption" muted>
            {CONDITIONS.find((c) => c.id === draft.condition)!.detail}
          </Text>
        ) : null}
        <FieldError message={errors.condition} />
      </View>
      <TextField
        label="Price in dollars"
        required
        value={draft.price}
        onChangeText={(price) => set({ price })}
        keyboardType="decimal-pad"
        error={errors.price}
        placeholder="450"
        hint="Use 0 to give it away."
      />
      <View style={{ gap: space.xs }}>
        <TextField
          label="Fits (optional)"
          value={draft.fits}
          onChangeText={(fits) => set({ fits })}
          maxLength={120}
          error={errors.fits}
          placeholder="2015-2021 Subaru WRX"
        />
        {cars.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {cars.map((c) => {
              const fit = `${c.year} ${c.make} ${c.model}`;
              return <Chip key={c.id} label={fit} selected={draft.fits === fit} onPress={() => set({ fits: fit })} />;
            })}
          </View>
        ) : null}
      </View>
      <TextField
        label="City or area"
        required
        value={draft.location}
        onChangeText={(location) => set({ location })}
        maxLength={80}
        error={errors.location}
        placeholder="Sample City"
        hint="Never your address. Agree on a public meeting spot in the offer chat."
      />
      <TextField
        label="Details (optional)"
        value={draft.description}
        onChangeText={(description) => set({ description })}
        multiline
        maxLength={2000}
        error={errors.description}
        placeholder="Mileage on the part, what's included, why you're selling"
      />
      <View style={{ gap: space.xs }}>
        <Text variant="label">Photo (optional)</Text>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md }}
            accessible
            accessibilityLabel="Chosen photo"
            alt="Chosen photo"
          />
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {(["library", "camera"] as const).map((src) => (
            <Button
              key={src}
              title={src === "library" ? (photo || editId ? "Choose a new photo" : "Choose photo") : "Take photo"}
              variant="secondary"
              disabled={busy}
              onPress={async () => {
                setPhotoError(null);
                const r = await pickPhoto(src);
                if (!r.ok) return setPhotoError(r.error.key);
                if (r.data) setPhoto(r.data);
              }}
            />
          ))}
        </View>
        <Text variant="caption" muted>
          Photos are re-saved on your phone first, so location data in the file is removed.
        </Text>
        {photoError ? <InlineError kind={photoError} /> : null}
        <UploadList
          items={uploads.items}
          onRetry={uploads.retry}
          onCancel={uploads.cancel}
          onDismiss={uploads.dismiss}
        />
      </View>
      {error ? <InlineError kind={error.key} /> : null}
      {savedId ? (
        <InlineNotice
          title="Listing saved"
          body="The photo didn't upload. Retry it above, or open the listing and add one later."
        >
          <Button title="Open listing" variant="secondary" onPress={() => router.replace(`/listings/${savedId}`)} />
        </InlineNotice>
      ) : null}
      <Button title={editId ? "Save changes" : "List it"} fullWidth loading={busy} onPress={() => void submit()} />
      {!editId ? (
        <Text variant="caption" muted>
          {`Free sellers can have ${LISTING_LIMIT.free} parts up at once; Dynorex+ ${LISTING_LIMIT.plus}. Listings are public: anyone can see them.`}
        </Text>
      ) : null}
    </Screen>
  );
}

/** A text field's error line, shown only when there is a message. */
function FieldError({ message }: { message: string | undefined }) {
  return message ? <SharedFieldError message={message} /> : null;
}
