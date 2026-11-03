import { router } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { fieldErrors, profileSchema } from "@/domain/validation/account";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";

/** "Saved" appears only after the server confirms. Location is general (city/region), never exact. */
export default function EditProfile() {
  const { status, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState(() => ({
    display_name: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    general_location: profile?.general_location ?? "",
    years_experience:
      profile?.years_experience === null || profile?.years_experience === undefined
        ? ""
        : String(profile.years_experience),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useAction(profileService.updateProfile);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );
  if (!profile) return <LoadingState label="Loading your profile" />;

  const set = (k: keyof typeof form) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  return (
    <Screen>
      <Text muted>@{profile.username}</Text>
      <TextField
        label="Display name"
        value={form.display_name}
        onChangeText={set("display_name")}
        maxLength={40}
        error={errors.display_name}
      />
      <TextField
        label="Bio"
        value={form.bio}
        onChangeText={set("bio")}
        maxLength={280}
        multiline
        hint={`${form.bio.length}/280`}
        error={errors.bio}
      />
      <TextField
        label="General location"
        value={form.general_location}
        onChangeText={set("general_location")}
        maxLength={60}
        hint="City or region only. Never your address."
        error={errors.general_location}
      />
      <TextField
        label="Years working on cars"
        value={form.years_experience}
        onChangeText={set("years_experience")}
        keyboardType="number-pad"
        maxLength={2}
        error={errors.years_experience}
      />
      {save.error ? <InlineError kind={save.error.key} /> : null}
      {saved ? <InlineNotice title="Saved" /> : null}
      <Button
        title="Save"
        loading={save.busy}
        onPress={async () => {
          const parsed = profileSchema.safeParse(form);
          if (!parsed.success) return setErrors(fieldErrors(parsed.error));
          setErrors({});
          const r = await save.run(parsed.data);
          if (r?.ok) {
            setSaved(true);
            await refreshProfile();
          }
        }}
      />
      <Button title="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
