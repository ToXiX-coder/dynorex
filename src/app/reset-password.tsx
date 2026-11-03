import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { passwordSchema } from "@/domain/validation/account";
import { authService } from "@/features/auth/authService";
import { useAction } from "@/hooks/useAction";

/**
 * dynorex://reset-password?code=… The server validates the one-time code; expired or reused links
 * fail there and show "Link expired".
 */
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [phase, setPhase] = useState<"exchanging" | "form" | "bad" | "done">("exchanging");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string }>({});
  const update = useAction(authService.updatePassword);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!code) return setPhase("bad");
      const r = await authService.exchangeCode(code);
      if (alive) setPhase(r.ok ? "form" : "bad");
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (phase === "exchanging") return <LoadingState label="Checking your link" />;
  if (phase === "bad")
    return (
      <Screen>
        <ErrorState kind="linkExpired" onAction={() => router.replace("/")} />
      </Screen>
    );

  return (
    <Screen>
      {phase === "done" ? (
        <>
          <InlineNotice title="Password changed" body="You're signed in with your new password." />
          <Button title="Continue" onPress={() => router.replace("/")} />
        </>
      ) : (
        <>
          <TextField
            label="New password"
            required
            secureTextEntry
            value={pw}
            onChangeText={setPw}
            autoComplete="new-password"
            textContentType="newPassword"
            hint="10+ characters with an uppercase letter, a lowercase letter and a number."
            error={errors.pw}
          />
          <TextField
            label="Repeat new password"
            required
            secureTextEntry
            value={pw2}
            onChangeText={setPw2}
            autoComplete="new-password"
            error={errors.pw2}
          />
          {update.error ? <InlineError kind={update.error.key} /> : null}
          <Button
            title="Save password"
            loading={update.busy}
            onPress={async () => {
              const parsed = passwordSchema.safeParse(pw);
              const next = {
                pw: parsed.success ? undefined : parsed.error.issues[0]?.message,
                pw2: pw === pw2 ? undefined : "Passwords don't match",
              };
              setErrors(next);
              if (next.pw || next.pw2) return;
              const r = await update.run(pw);
              if (r?.ok) setPhase("done");
            }}
          />
        </>
      )}
    </Screen>
  );
}
