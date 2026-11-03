import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice, TextLink } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { fieldErrors, signUpSchema } from "@/domain/validation/account";
import { authService } from "@/features/auth/authService";
import { SocialButtons } from "@/features/auth/SocialButtons";
import { useAction } from "@/hooks/useAction";
import { useCooldown } from "@/hooks/useCooldown";
import { analytics } from "@/services/analytics";
import { space } from "@/theme/tokens";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const signUp = useAction(authService.signUpWithEmail);
  const resend = useAction(authService.resendVerification);
  const cooldown = useCooldown(60);

  const submit = async () => {
    const parsed = signUpSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    analytics.track("sign_up_started", { method: "email" });
    const res = await signUp.run(parsed.data.email, parsed.data.password);
    if (res?.ok) {
      analytics.track("sign_up_completed", { method: "email" });
      setSentTo(parsed.data.email);
      cooldown.start();
    }
  };

  if (sentTo) {
    return (
      <Screen>
        <InlineNotice title="Check your email" body={`We sent a link to ${sentTo}. Tap it to finish signing up.`} />
        {resend.error ? <InlineError kind={resend.error.key} /> : null}
        <Button
          title={cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend email"}
          variant="secondary"
          disabled={cooldown.left > 0}
          loading={resend.busy}
          onPress={async () => {
            const r = await resend.run(sentTo);
            if (r?.ok) cooldown.start();
          }}
        />
        <TextLink title="Back to sign in" onPress={() => router.replace("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TextField
        label="Email"
        required
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextField
        label="Password"
        required
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="10+ characters with an uppercase letter, a lowercase letter and a number."
        error={errors.password}
      />
      {signUp.error ? <InlineError kind={signUp.error.key} /> : null}
      <Button title="Create account" onPress={submit} loading={signUp.busy} fullWidth />
      <View style={{ gap: space.sm }}>
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          or
        </Text>
        <SocialButtons disabled={signUp.busy} />
      </View>
      <TextLink title="Already have an account? Sign in" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}
