import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { LockIcon } from "@/components/icons";
import { Sticker, stickerName } from "@/components/mascot/Sticker";
import { Text } from "@/components/Text";
import { STICKERS, type StickerId } from "@/domain/plus";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { subscriptionService } from "./subscriptionService";
import { haptic } from "@/services/haptics";
import { themed } from "@/theme/themed";

/**
 * Torq sticker reactions on a public build. Everyone sees the counts; only Dynorex+ members can send
 * (the server refuses anyone else). Non-members see the full set locked, with "Dynorex+ only".
 * A count changes only after the server accepted the reaction.
 */
export function StickerReactions({ buildId, isMine }: { buildId: string; isMine: boolean }) {
  const { status } = useAuth();
  const [counts, setCounts] = useState<{ sticker: StickerId; reactions: number }[]>([]);
  const [mine, setMine] = useState<StickerId[]>([]);
  const [plus, setPlus] = useState(false);
  const [open, setOpen] = useState(false);
  const [lockedTap, setLockedTap] = useState<StickerId | null>(null);
  const [busy, setBusy] = useState<StickerId | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [reload, setReload] = useState(0);

  // re-check on focus, e.g. coming back from the paywall
  useFocusEffect(useCallback(() => setReload((n) => n + 1), []));

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, m, caps] = await Promise.all([
        subscriptionService.reactions(buildId),
        status === "signedIn" ? subscriptionService.myReactions(buildId) : Promise.resolve(null),
        status === "signedIn" ? subscriptionService.capabilities() : Promise.resolve(null),
      ]);
      if (!alive) return;
      if (c.ok) setCounts(c.data);
      if (m?.ok) setMine(m.data);
      setPlus(Boolean(caps?.ok && caps.data?.torq_stickers));
    })();
    return () => {
      alive = false;
    };
  }, [buildId, status, reload]);

  const toggle = async (id: StickerId) => {
    if (!plus) return setLockedTap(id);
    setBusy(id);
    setError(null);
    const r = mine.includes(id)
      ? await subscriptionService.unreact(buildId, id)
      : await subscriptionService.react(buildId, id);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    haptic.tap();
    setReload((n) => n + 1);
  };

  const used = counts.filter((c) => c.reactions > 0).sort((a, b) => b.reactions - a.reactions);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="section" accessibilityRole="header">
        Reactions
      </Text>
      {used.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {used.map((c) => (
            <View
              key={c.sticker}
              style={[styles.chip, mine.includes(c.sticker) && styles.chipMine]}
              accessible
              accessibilityLabel={`${stickerName(c.sticker)}: ${c.reactions}${mine.includes(c.sticker) ? ", including yours" : ""}`}
            >
              <Sticker id={c.sticker} size={36} animate={false} />
              <Text variant="bodyStrong">{String(c.reactions)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text muted>No reactions yet.</Text>
      )}
      {!isMine && status === "signedIn" ? (
        <Button title="React with Torq" variant="secondary" onPress={() => setOpen(true)} />
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text variant="title" accessibilityRole="header">
              Torq stickers
            </Text>
            {!plus ? (
              <Text variant="caption" muted>
                Dynorex+ only. Anyone can see them; members can send all 12.
              </Text>
            ) : null}
            <View style={styles.grid}>
              {STICKERS.map((s) => {
                const on = mine.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}. ${s.use}${plus ? (on ? ". Sent, tap to remove" : "") : ". Dynorex+ only"}`}
                    accessibilityState={{ selected: on, busy: busy === s.id }}
                    onPress={() => void toggle(s.id)}
                    style={[styles.cell, on && styles.cellOn]}
                  >
                    <View style={!plus ? styles.locked : undefined}>
                      <Sticker id={s.id} size={52} animate={plus} />
                    </View>
                    {!plus ? (
                      <View style={styles.lock}>
                        <LockIcon color={color.text} />
                      </View>
                    ) : null}
                    <Text variant="caption" numberOfLines={1}>
                      {s.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {lockedTap ? (
              <View style={{ gap: space.xs }}>
                <Text variant="bodyStrong">{`${stickerName(lockedTap)} is Dynorex+ only`}</Text>
                <Button
                  title="See Dynorex+"
                  onPress={() => {
                    setOpen(false);
                    setLockedTap(null);
                    router.push("/plus?source=stickers");
                  }}
                />
              </View>
            ) : null}
            {error ? <InlineError kind={error.key} /> : null}
            <Button title="Close" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { gap: space.sm },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      backgroundColor: color.surface,
      minHeight: touch.min,
    },
    chipMine: { borderWidth: border.regular, borderColor: color.accent },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.lg,
      gap: space.md,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "space-between" },
    cell: {
      width: "23%",
      alignItems: "center",
      gap: 2,
      paddingVertical: space.xs,
      borderRadius: radius.md,
      minHeight: touch.min,
    },
    cellOn: { borderWidth: border.regular, borderColor: color.accent },
    locked: { opacity: 0.45 },
    lock: { position: "absolute", top: 18 },
  }),
);
