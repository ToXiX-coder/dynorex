import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice, TextLink } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { fieldErrors, signInSchema } from "@/domain/validation/account";
import { authService } from "@/features/auth/authService";
import { SocialButtons } from "@/features/auth/SocialButtons";
import { useAction } from "@/hooks/useAction";
import { useCooldown } from "@/hooks/useCooldown";
import { space } from "@/theme/tokens";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const signIn = useAction(authService.signInWithEmail);
  const resend = useAction(authService.resendVerification);
  const cooldown = useCooldown(60);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    // On success the auth listener moves the app to the next gate; nothing else to do here.
    await signIn.run(parsed.data.email, parsed.data.password);
  };

  const needsVerify = signIn.error?.key === "checkEmail";

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
        autoComplete="current-password"
        textContentType="password"
        error={errors.password}
      />
      {signIn.error ? (
        <InlineError
          kind={signIn.error.key}
          onAction={
            needsVerify && cooldown.left === 0
              ? async () => {
                  const r = await resend.run(email.trim().toLowerCase());
                  if (r?.ok) {
                    setResent(true);
                    cooldown.start();
                  }
                }
              : undefined
          }
        />
      ) : null}
      {resent ? <InlineNotice title="Sent" body="Check your inbox for a fresh link." /> : null}
      <Button title="Sign in" onPress={submit} loading={signIn.busy} fullWidth />
      <TextLink title="Forgot password?" onPress={() => router.push("/forgot-password")} />
      <View style={{ gap: space.sm }}>
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          or
        </Text>
        <SocialButtons disabled={signIn.busy} />
      </View>
      <TextLink title="New here? Create an account" onPress={() => router.replace("/sign-up")} />
    </Screen>
  );
}
