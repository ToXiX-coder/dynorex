import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { ERROR_COPY } from "@/domain/copy/errors";
import { emailSchema } from "@/domain/validation/account";
import { authService } from "@/features/auth/authService";
import { useAction } from "@/hooks/useAction";

/** Same answer whether or not the email has an account. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const reset = useAction(authService.requestPasswordReset);

  return (
    <Screen>
      <Text>Enter the email you signed up with. We&apos;ll send a link to set a new password.</Text>
      <TextField
        label="Email"
        required
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={error}
      />
      {reset.error ? <InlineError kind={reset.error.key} /> : null}
      {sent ? <InlineNotice title={ERROR_COPY.resetSent.title} body={ERROR_COPY.resetSent.body} /> : null}
      <Button
        title={sent ? "Send again" : "Send reset link"}
        loading={reset.busy}
        onPress={async () => {
          const parsed = emailSchema.safeParse(email);
          if (!parsed.success) return setError(parsed.error.issues[0]?.message);
          setError(undefined);
          const r = await reset.run(parsed.data);
          if (r?.ok) setSent(true);
        }}
      />
    </Screen>
  );
}
