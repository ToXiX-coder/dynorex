import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { buildService } from "@/features/garage/buildService";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { VehicleFormView, type VehicleSubmit } from "@/features/garage/VehicleFormView";
import { useAction } from "@/hooks/useAction";
import { analytics } from "@/services/analytics";
import { pickPhoto, type PreparedPhoto } from "@/services/media/photos";
import { color, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export default function AddVehicle() {
  const { status } = useAuth();
  // one reference for this form's lifetime: a double tap or retry returns the same vehicle
  const clientRef = useRef(Crypto.randomUUID());
  const [hero, setHero] = useState<PreparedPhoto | null>(null);
  const [heroError, setHeroError] = useState<ErrorKey | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = useAction((v: VehicleSubmit) => buildService.createVehicle(v, clientRef.current));
  const uploads = usePhotoUploads();

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );

  if (savedId) {
    const allDone = uploads.items.every((i) => i.state === "done" || i.state === "failed");
    return (
      <Screen>
        <Text variant="heading">Vehicle saved</Text>
        <UploadList
          items={uploads.items}
          onRetry={uploads.retry}
          onCancel={uploads.cancel}
          onDismiss={uploads.dismiss}
        />
        <Button
          title={allDone ? "Open vehicle" : "Open vehicle (upload continues)"}
          onPress={() => router.replace(`/garage/${savedId}`)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <VehicleFormView
        submitLabel="Save vehicle"
        busy={save.busy}
        error={save.error?.key ?? null}
        onSubmit={async (v) => {
          const r = await save.run(v);
          if (!r?.ok) return;
          analytics.track("vehicle_added", { make: v.make, model: v.model, year: v.year });
          if (hero) {
            setSavedId(r.data);
            void uploads.add(hero, { kind: "hero", vehicleId: r.data });
          } else {
            router.replace(`/garage/${r.data}`);
          }
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text variant="label">Hero photo</Text>
          {hero ? (
            <>
              <Image
                source={{ uri: hero.uri }}
                style={styles.preview}
                accessible
                accessibilityLabel="Chosen hero photo"
                alt="Chosen hero photo"
              />
              <Button title="Remove photo" variant="secondary" onPress={() => setHero(null)} />
            </>
          ) : (
            <View style={styles.row}>
              {(["library", "camera"] as const).map((src) => (
                <Button
                  key={src}
                  title={src === "library" ? "Choose photo" : "Take photo"}
                  variant="secondary"
                  onPress={async () => {
                    setHeroError(null);
                    const r = await pickPhoto(src);
                    if (!r.ok) setHeroError(r.error.key);
                    else if (r.data) setHero(r.data);
                  }}
                />
              ))}
            </View>
          )}
          <Text variant="caption" muted>
            Optional. Resized on your phone and location data removed before upload.
          </Text>
          {heroError ? <InlineError kind={heroError} /> : null}
        </View>
      </VehicleFormView>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    preview: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: color.surface },
    row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  }),
);
