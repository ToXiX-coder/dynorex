import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Torq } from "@/components/mascot/Torq";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { describeSubscription, MANAGE_URLS } from "@/domain/plus";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { subscriptionService } from "@/features/plus/subscriptionService";
import { store } from "@/services/purchases/store";
import type { MySubscriptionRow } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

/**
 * dynorex.app/settings/subscription: what the SERVER says about your Dynorex+ (status, renewal or end
 * date, billing problems), plus restore and the store's own management page for cancelling.
 */
export default function Subscription() {
  const { status } = useAuth();
  const [sub, setSub] = useState<MySubscriptionRow | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [actionError, setActionError] = useState<ErrorKey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = useCallback((r: Awaited<ReturnType<typeof subscriptionService.mySubscription>>) => {
    if (r.ok) {
      setSub(r.data);
      setError(null);
    } else setError(r.error);
  }, []);
  const retry = () => void subscriptionService.mySubscription().then(apply);

  useFocusEffect(
    useCallback(() => {
      if (status !== "signedIn") return;
      let alive = true;
      void subscriptionService.mySubscription().then((r) => alive && apply(r));
      return () => {
        alive = false;
      };
    }, [status, apply]),
  );

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to manage Dynorex+" />
      </Screen>
    );
  if (!sub && error)
    return (
      <Screen>
        <ErrorState kind={error.key} onAction={retry} />
      </Screen>
    );
  if (!sub) return <LoadingState label="Loading Dynorex+" />;

  const platform = sub.platform ?? store.platform;
  const storeName = platform === "play_store" ? "Google Play" : "the App Store";

  return (
    <Screen>
      <View style={{ alignItems: "center" }}>
        <Torq expression={sub.plus ? "excited" : "upgrade"} size={110} />
      </View>
      <Text variant="section" accessibilityRole="header">
        {sub.plus ? "Dynorex+ is on" : "Free plan"}
      </Text>
      <Card>
        <Text>{describeSubscription(sub)}</Text>
        {sub.plus && sub.status ? (
          <Text variant="caption" muted>
            {`Bought through ${storeName}. Cancel or change plans there; Dynorex can't cancel for you.`}
          </Text>
        ) : null}
      </Card>
      {actionError ? <InlineError kind={actionError} /> : null}
      {note ? <InlineNotice title={note} /> : null}

      {sub.status && sub.status !== "refunded" && sub.status !== "revoked" ? (
        <Button
          title={`Manage in ${storeName}`}
          variant="secondary"
          onPress={() =>
            store.availability === "ready"
              ? void store.manage()
              : void Linking.openURL(platform === "play_store" ? MANAGE_URLS.play_store : MANAGE_URLS.app_store)
          }
        />
      ) : null}
      {!sub.plus ? <Button title="See Dynorex+" onPress={() => router.push("/plus?source=settings")} /> : null}
      <Button
        title="Restore purchases"
        variant="secondary"
        loading={busy}
        disabled={store.availability === "unavailable"}
        onPress={async () => {
          setBusy(true);
          setActionError(null);
          setNote(null);
          const ok = await store.restore();
          const r = ok ? await subscriptionService.sync() : null;
          setBusy(false);
          if (!r) return setActionError("saveFailed");
          if (!r.ok) return setActionError(r.error.key);
          setSub(r.data);
          setNote(r.data.plus ? "Dynorex+ restored." : "No Dynorex+ purchase found for this store account.");
        }}
      />
      {store.availability === "unavailable" ? (
        <Text variant="caption" muted>
          Purchases and restores happen in the Dynorex app for iPhone or Android.
        </Text>
      ) : null}
      <View style={{ gap: space.xs }}>
        <Text variant="caption" muted>
          Dynorex+ is $7.99 a month or $59.99 a year (US list prices; the store shows yours). It renews automatically
          until you cancel in your store settings.
        </Text>
      </View>
    </Screen>
  );
}
