import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Switch, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { RouteTrace } from "@/components/line/RouteTrace";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/forms/TextField";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { formatDistance, formatDuration } from "@/domain/routes";
import { whenText } from "@/domain/when";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { pendingDrives } from "@/features/line/pendingDrives";
import { recorderDrafts, useRecorder, type Draft } from "@/features/line/useRecorder";
import { useFlags } from "@/providers/AppProviders";
import { config } from "@/services/config";
import { color, space } from "@/theme/tokens";
import { haptic } from "@/services/haptics";

/** In a browser there is no phone settings screen to send people to. */
const WEB = Platform.OS === "web";

/**
 * Record a drive: consent → record / pause / stop → review → save (private or shared) or discard.
 * Foreground only in this first slice (background GPS needs its own consent work). Nothing leaves the
 * phone until Save.
 */
export default function RecordDrive() {
  const flags = useFlags();
  const { status, user } = useAuth();
  const userId = user?.id ?? "signed-out";
  const rec = useRecorder(userId);
  const [queued, setQueued] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const clientRef = useRef<string | null>(null);

  // an unsaved drive from last time (app closed, crash) is offered back
  useEffect(() => {
    if (user?.id) void recorderDrafts.load(user.id).then(setDraft);
  }, [user?.id]);
  // keep the clock moving while recording, even when the car is stopped
  useEffect(() => {
    if (rec.state !== "recording") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rec.state]);

  if (!flags.line) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to record drives" />
      </Screen>
    );

  const save = async () => {
    setBusy(true);
    setError(null);
    clientRef.current ??= Crypto.randomUUID();
    const name = title.trim() || "Drive";
    const r = await lineService.save(clientRef.current, name, null, rec.points, share);
    if (!r.ok && r.error.key === "offline") {
      // keep it on the phone with the same client_ref; it uploads when the connection is back
      await pendingDrives.add(userId, { clientRef: clientRef.current, title: name, share, points: rec.points });
      await recorderDrafts.clear(userId);
      setBusy(false);
      return setQueued(true);
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    haptic.success();
    await recorderDrafts.clear(userId);
    router.replace(`/route/${r.data}`);
  };

  if (queued)
    return (
      <Screen>
        <InlineNotice
          title="Saved on this phone"
          body="You're offline. Dynorex uploads this drive when you're back online. It stays private until then."
        >
          <Button title="Back to Line" onPress={() => router.replace("/line")} />
        </InlineNotice>
      </Screen>
    );

  // ------------------------------------------------ review
  if (rec.state === "stopped") {
    return (
      <Screen>
        <SectionHeader>Review your drive</SectionHeader>
        {rec.points.length > 1 ? (
          <RouteTrace points={rec.points.map(([a, b]) => [a, b])} label="Shape of this drive" />
        ) : null}
        <Text>{`${formatDistance(rec.distanceM)} · ${formatDuration(rec.durationS)} · ${rec.points.length} GPS points`}</Text>
        <TextField label="Name" value={title} onChangeText={setTitle} maxLength={80} placeholder="Canyon run" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Switch
            value={share}
            onValueChange={setShare}
            trackColor={{ true: color.accent, false: color.border }}
            accessibilityLabel="Share this drive publicly"
          />
          <Text style={{ flex: 1 }}>Share this drive publicly</Text>
        </View>
        <Text variant="caption" muted>
          {share
            ? "Others see the route shape, distance, time taken and the date. Dynorex removes the first and last half kilometre and the start time, so your start and finish points stay private."
            : "Only you can see it. You can share it later."}
        </Text>
        {error ? <InlineError kind={error.key} /> : null}
        <Button
          title="Save drive"
          fullWidth
          loading={busy}
          disabled={rec.points.length < 2}
          onPress={() => void save()}
        />
        <Button title="Discard" variant="secondary" fullWidth onPress={() => setConfirmDiscard(true)} />
        <ConfirmModal
          visible={confirmDiscard}
          kind="discardDrive"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={async () => {
            setConfirmDiscard(false);
            await rec.discard();
            setDraft(null);
          }}
        />
      </Screen>
    );
  }

  // ------------------------------------------------ recording / paused
  if (rec.state === "recording" || rec.state === "paused") {
    const live = rec.state === "recording";
    const elapsed = rec.points.length ? Math.max(0, Math.round((nowMs - rec.points[0]![2]) / 1000)) : 0;
    return (
      <Screen>
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={live ? "Recording" : "Paused"}
          style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {/* drawn marks: a lit dot while recording, two bars when paused */}
            {live ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color.accent }} />
            ) : (
              <View style={{ flexDirection: "row", gap: 4 }}>
                <View style={{ width: 5, height: 18, backgroundColor: color.text }} />
                <View style={{ width: 5, height: 18, backgroundColor: color.text }} />
              </View>
            )}
            <Text variant="display" style={{ color: live ? color.accent : color.text }}>
              {live ? "RECORDING" : "PAUSED"}
            </Text>
          </View>
          <Text variant="title">{formatDistance(rec.distanceM)}</Text>
          <Text muted>{formatDuration(live ? elapsed : rec.durationS)}</Text>
        </View>
        {live ? (
          <Button title="Pause" variant="secondary" fullWidth onPress={rec.pause} />
        ) : (
          <Button title="Resume" fullWidth onPress={() => void rec.resume()} />
        )}
        <Button title="Stop and review" fullWidth onPress={rec.stop} />
        <Text variant="caption" muted>
          Keep Dynorex open while recording. Location stops as soon as you pause or stop.
        </Text>
      </Screen>
    );
  }

  // ------------------------------------------------ before recording
  return (
    <Screen>
      {draft ? (
        <InlineNotice
          headsUp
          title="Unsaved drive found"
          body={`${draft.points.length} GPS points, saved ${whenText(draft.savedAt)}.`}
        >
          <Button title="Review it" onPress={() => rec.restore(draft)} />
          <Button
            title="Discard it"
            variant="secondary"
            onPress={async () => {
              await recorderDrafts.clear(userId);
              setDraft(null);
            }}
          />
        </InlineNotice>
      ) : null}
      <Card>
        <Text variant="title">Before you go</Text>
        <Text>
          Dynorex uses your precise location only while this screen is recording, to draw your drive. It never runs in
          the background.
        </Text>
        <Text>Your drive stays on this phone until you save it, and stays private unless you share it.</Text>
        <Text variant="bodyStrong">Set it up before you drive. Don&apos;t use your phone while driving.</Text>
      </Card>
      {rec.permission === "denied" ? (
        <InlineNotice
          headsUp
          title="Location is off for Dynorex"
          body={`Everything else still works. You can allow it in your ${WEB ? "browser's site settings" : "phone's settings"}.`}
        >
          {/* a web page can't open settings, so the words say where instead */}
          {WEB ? null : (
            <Button title="Open phone settings" variant="secondary" onPress={() => void Linking.openSettings()} />
          )}
        </InlineNotice>
      ) : null}
      <Button title="Start recording" fullWidth onPress={() => void rec.start()} />
      {config.demoMode ? (
        <Button title="Simulate a drive (pitch mode)" variant="secondary" fullWidth onPress={rec.simulate} />
      ) : null}
    </Screen>
  );
}
