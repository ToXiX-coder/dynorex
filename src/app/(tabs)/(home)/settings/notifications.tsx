import { useEffect, useState } from "react";
import { Linking, Platform, Switch, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { categoryLive, NOTIFICATION_CATEGORIES, prefEnabled } from "@/domain/notifications";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { disablePush, enablePush, hasLocalPushToken, pushState, type PushState } from "@/features/notifications/push";
import { socialService } from "@/features/social/socialService";
import { useFlags } from "@/providers/AppProviders";
import type { NotificationCategory, NotificationPrefRow } from "@/services/supabase/database.types";

import { color, space } from "@/theme/tokens";

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "Push notifications are only in the iOS and Android apps. Your inbox still works here.",
  notConfigured: "Push isn't set up in this build yet. Your inbox still works.",
  undetermined: "Push is off. Turn it on to get alerts on this phone.",
  denied: "Notifications are blocked for Dynorex in your phone's settings.",
  granted: "Your phone allows Dynorex notifications.",
};

/**
 * One switch per notification category (handoff spec push table). A switch only changes after the
 * server confirms; the server never creates a notification for a category that's off, so the inbox
 * and push both follow it.
 */
export default function NotificationSettings() {
  const { status } = useAuth();
  const flags = useFlags();
  const [prefs, setPrefs] = useState<NotificationPrefRow[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [registered, setRegistered] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    void Promise.all([socialService.prefs(), pushState(), hasLocalPushToken()]).then(([r, p, local]) => {
      if (!alive) return;
      if (r.ok) {
        setPrefs(r.data);
        setError(null);
      } else setError(r.error);
      setPush(p);
      setRegistered(local);
    });
    return () => {
      alive = false;
    };
  }, [status, reload]);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to manage notifications" />
      </Screen>
    );
  if (!prefs && error)
    return (
      <Screen>
        <ErrorState kind={error.key} onAction={load} />
      </Screen>
    );
  if (!prefs) return <LoadingState label="Loading notification settings" />;

  const toggle = async (id: NotificationCategory, enabled: boolean) => {
    setSaving(id);
    const r = await socialService.setPref(id, enabled);
    setSaving(null);
    if (!r.ok) return setError(r.error);
    setError(null);
    // the server confirmed: reflect exactly what it stored
    setPrefs((p) => [
      ...(p ?? []).filter((x) => x.category !== id),
      { user_id: "", category: id, enabled: r.data ?? enabled, updated_at: new Date().toISOString() },
    ]);
  };

  return (
    <Screen>
      <Card>
        <Text variant="title">Push on this phone</Text>
        <Text muted>{push ? PUSH_TEXT[push] : "Checking…"}</Text>
        {push === "granted" || push === "undetermined" ? (
          registered ? (
            <Button
              title="Turn off push on this phone"
              variant="secondary"
              loading={pushBusy}
              onPress={async () => {
                setPushBusy(true);
                const ok = await disablePush();
                setPushBusy(false);
                setRegistered(!ok);
                setPushMsg(ok ? "Push is off for this phone." : null);
                if (!ok) setError({ key: "saveFailed" });
              }}
            />
          ) : (
            <Button
              title="Turn on push"
              loading={pushBusy}
              onPress={async () => {
                setPushBusy(true);
                const r = await enablePush();
                setPushBusy(false);
                setPush(await pushState());
                if (r.ok) {
                  setRegistered(true);
                  setPushMsg("Push is on for this phone.");
                } else if (r.reason === "failed") setError({ key: "saveFailed" });
              }}
            />
          )
        ) : null}
        {push === "denied" && Platform.OS !== "web" ? (
          <Button title="Open phone settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        ) : null}
        {pushMsg ? <InlineNotice title={pushMsg} /> : null}
      </Card>

      {error ? <InlineError kind={error.key} /> : null}
      <SectionHeader>What to tell you about</SectionHeader>
      <Text variant="caption" muted>
        These apply to the inbox and push. Notifications never include your VIN, costs, notes or location.
      </Text>
      {NOTIFICATION_CATEGORIES.map((c) => {
        const on = prefEnabled(prefs, c.id);
        const live = categoryLive(c, flags);
        return (
          <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <Text>{c.label}</Text>
              {!live ? (
                <Text variant="caption" muted>
                  Not sent yet: arrives with a later feature
                </Text>
              ) : null}
            </View>
            <Switch
              value={on}
              disabled={saving !== null}
              onValueChange={(v) => void toggle(c.id, v)}
              trackColor={{ true: color.accent, false: color.border }}
              accessibilityLabel={c.label}
              accessibilityHint={live ? undefined : "Saved now; this kind of notification isn't sent yet"}
            />
          </View>
        );
      })}
    </Screen>
  );
}
