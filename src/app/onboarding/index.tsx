import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { YearField } from "@/components/forms/PickerFields";
import { TextField } from "@/components/forms/TextField";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { OnboardingFrame } from "@/features/onboarding/OnboardingFrame";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";
import { space } from "@/theme/tokens";

const MAX_YEAR = new Date().getFullYear() + 2;

/**
 * Step 1: "What do you drive?" Saves a real PRIVATE vehicle (year, make, model). The full vehicle
 * wizard with NHTSA lookup and photos is Phase 3; this is the manual path, which always works.
 * Resumes on the right step if onboarding was left part-way (step is stored on the server).
 */
export default function StepVehicle() {
  const { profile } = useAuth();
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // If the vehicle saved but the step update failed, a retry must not add the vehicle twice.
  const vehicleSaved = useRef(false);
  const save = useAction(async () => {
    if (vehicleSaved.current) return profileService.setOnboardingStep(1);
    const r = await profileService.addFirstVehicle({
      year: Number(year),
      make: make.trim(),
      model: model.trim(),
      nickname: nickname.trim() || null,
    });
    if (!r.ok) return r;
    vehicleSaved.current = true;
    return profileService.setOnboardingStep(1);
  });
  const later = useAction(() => profileService.setOnboardingStep(1));

  if ((profile?.onboarding_step ?? 0) >= 2) return <Redirect href="/onboarding/goal" />;
  if (profile?.onboarding_step === 1) return <Redirect href="/onboarding/photo" />;

  const validate = () => {
    const e: Record<string, string> = {};
    const y = Number(year);
    if (!/^\d{4}$/.test(year) || y < 1886 || y > MAX_YEAR) e.year = `Enter a year from 1886 to ${MAX_YEAR}`;
    if (!make.trim()) e.make = "Enter the make";
    else if (make.trim().length > 50) e.make = "50 characters max";
    if (!model.trim()) e.model = "Enter the model";
    else if (model.trim().length > 50) e.model = "50 characters max";
    if (nickname.trim().length > 60) e.nickname = "60 characters max";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <OnboardingFrame step={1} torq="excited">
      <Text muted>Start with the basics. It stays private until you choose to share it.</Text>
      <YearField
        label="Year"
        required
        value={year}
        onChange={setYear}
        min={1886}
        max={MAX_YEAR}
        start={new Date().getFullYear() - 10}
        error={errors.year}
      />
      <TextField label="Make" required value={make} onChangeText={setMake} maxLength={50} error={errors.make} />
      <TextField label="Model" required value={model} onChangeText={setModel} maxLength={50} error={errors.model} />
      <TextField
        label="Build name or nickname"
        value={nickname}
        onChangeText={setNickname}
        maxLength={60}
        hint="Optional"
        error={errors.nickname}
      />
      {save.error ? <InlineError kind={save.error.key} /> : null}
      <View style={{ gap: space.sm }}>
        <Button
          title="Save and continue"
          loading={save.busy}
          onPress={async () => {
            if (!validate()) return;
            const r = await save.run();
            if (r?.ok) router.replace("/onboarding/photo");
          }}
        />
        <Button
          title="I'll add it later"
          variant="secondary"
          loading={later.busy}
          onPress={async () => {
            const r = await later.run();
            if (r?.ok) router.replace("/onboarding/photo");
          }}
        />
      </View>
    </OnboardingFrame>
  );
}
