import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import { formatDistance, trackDistanceM } from "@/domain/routes";
import { whenText } from "@/domain/when";
import { useOnline } from "@/hooks/useNetwork";
import { space } from "@/theme/tokens";
import { pendingDrives, type PendingDrive } from "./pendingDrives";

/**
 * Drives waiting to upload. Retries when Line opens and when the phone comes back online; tells the person
 * plainly what's waiting and why (offline, or a server refusal such as the monthly limit).
 */
export function PendingDrives({ userId, onUploaded }: { userId: string; onUploaded: () => void }) {
  const online = useOnline();
  const [list, setList] = useState<PendingDrive[]>([]);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    setBusy(true);
    const r = await pendingDrives.sync(userId);
    setBusy(false);
    setList(r.waiting);
    if (r.uploaded.length) onUploaded();
  }, [userId, onUploaded]);

  useFocusEffect(
    useCallback(() => {
      void pendingDrives.list(userId).then((l) => {
        setList(l);
        if (l.length) void sync();
      });
    }, [userId, sync]),
  );
  useEffect(() => {
    if (online === true) void pendingDrives.list(userId).then((l) => l.length && void sync());
  }, [online, userId, sync]);

  if (!list.length) return null;
  return (
    <Card>
      <Text variant="title">{`${list.length} drive${list.length === 1 ? "" : "s"} waiting to upload`}</Text>
      {list.map((d) => (
        <View key={d.clientRef} style={{ gap: space.xs }}>
          <Text variant="bodyStrong">{d.title}</Text>
          <Text variant="caption" muted>
            {`${formatDistance(trackDistanceM(d.points.map(([a, b]) => [a, b])))} · saved ${whenText(d.queuedAt)}${d.share ? " · will be shared" : ""}`}
          </Text>
          {d.lastError ? <InlineError kind={d.lastError} /> : null}
          <Button
            title="Discard this drive"
            variant="secondary"
            onPress={async () => {
              await pendingDrives.discard(userId, d.clientRef);
              setList(await pendingDrives.list(userId));
            }}
          />
        </View>
      ))}
      {online === false ? (
        <Text variant="caption" muted>
          You&apos;re offline. They upload automatically when you&apos;re back.
        </Text>
      ) : (
        <Button title="Try again now" loading={busy} onPress={() => void sync()} />
      )}
    </Card>
  );
}
