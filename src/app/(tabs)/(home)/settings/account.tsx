import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { passwordSchema } from "@/domain/validation/account";
import { useAuth } from "@/features/auth/AuthProvider";
import { authService } from "@/features/auth/authService";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { useAction } from "@/hooks/useAction";

const PROVIDER_LABEL: Record<string, string> = { email: "Email and password", apple: "Apple", google: "Google" };

export default function AccountSettings() {
  const { status, user } = useAuth();
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | undefined>();
  const [changed, setChanged] = useState(false);
  const update = useAction(authService.updatePassword);
  const signOut = useAction(authService.signOut);

  if (status !== "signedIn" || !user)
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );
  const hasPassword = user.providers.includes("email");

  return (
    <Screen>
      <Card>
        <Text muted>Email</Text>
        <Text>{user.email ?? "No email on this account"}</Text>
        <Text variant="caption">{user.emailVerified ? "Verified" : "Not verified yet"}</Text>
        <Text muted>Sign-in methods</Text>
        <Text>{user.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")}</Text>
      </Card>

      {hasPassword ? (
        <Card>
          <SectionHeader>Change password</SectionHeader>
          <TextField
            label="New password"
            secureTextEntry
            value={pw}
            onChangeText={(t) => {
              setPw(t);
              setChanged(false);
            }}
            autoComplete="new-password"
            hint="10+ characters with an uppercase letter, a lowercase letter and a number."
            error={pwError}
          />
          {update.error ? <InlineError kind={update.error.key} /> : null}
          {changed ? <InlineNotice title="Password changed" /> : null}
          <Button
            title="Save password"
            loading={update.busy}
            onPress={async () => {
              const parsed = passwordSchema.safeParse(pw);
              if (!parsed.success) return setPwError(parsed.error.issues[0]?.message);
              setPwError(undefined);
              const r = await update.run(pw);
              if (r?.ok) {
                setPw("");
                setChanged(true);
              }
            }}
          />
        </Card>
      ) : null}

      {signOut.error ? <InlineError kind={signOut.error.key} /> : null}
      <Button title="Sign out" variant="secondary" loading={signOut.busy} onPress={() => void signOut.run()} />
    </Screen>
  );
}
