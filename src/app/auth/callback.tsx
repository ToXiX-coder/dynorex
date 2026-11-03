import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { authService } from "@/features/auth/authService";

/**
 * dynorex://auth/callback?code=… from the confirm-email link or an OAuth redirect.
 * Swaps the one-time code for a session; the root gate then shows the right next screen.
 * The code is never logged and is removed from history by the replace() below.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params.code || params.error) return setFailed(true);
      const r = await authService.exchangeCode(params.code);
      if (!alive) return;
      if (r.ok) router.replace("/");
      else setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, [params.code, params.error]);

  return (
    <Screen>
      {failed ? (
        <ErrorState kind="linkExpired" onAction={() => router.replace("/")} />
      ) : (
        <LoadingState label="Signing you in" />
      )}
    </Screen>
  );
}
