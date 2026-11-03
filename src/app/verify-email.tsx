import { useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { Torq } from "@/components/mascot/Torq";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { authService } from "@/features/auth/authService";
import { useAction } from "@/hooks/useAction";
import { useCooldown } from "@/hooks/useCooldown";

/**
 * Signed in but email not confirmed. Public content and reports stay blocked by the database until
 * this is done, whatever the app shows.
 */
export default function VerifyEmail() {
  const { user, refreshSession } = useAuth();
  const resend = useAction(authService.resendVerification);
  const signOut = useAction(authService.signOut);
  const cooldown = useCooldown(60);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  return (
    <Screen>
      <Torq expression="neutral" size={100} />
      <Text variant="heading">Check your email</Text>
      <Text>
        We sent a link to {user?.email ?? "your email"}. Tap it on this phone and you&apos;ll come straight back here.
      </Text>
      {resend.error ? <InlineError kind={resend.error.key} /> : null}
      {checked ? <InlineNotice headsUp title="Not verified yet" body="Tap the link in the email, then check again." /> : null}
      <Button
        title="I've verified"
        loading={checking}
        onPress={async () => {
          setChecking(true);
          await refreshSession();
          setChecking(false);
          setChecked(true);
        }}
      />
      <Button
        title={cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend email"}
        variant="secondary"
        disabled={cooldown.left > 0 || !user?.email}
        loading={resend.busy}
        onPress={async () => {
          if (!user?.email) return;
          const r = await resend.run(user.email);
          if (r?.ok) cooldown.start();
        }}
      />
      <Button title="Sign out" variant="secondary" loading={signOut.busy} onPress={() => void signOut.run()} />
    </Screen>
  );
}
