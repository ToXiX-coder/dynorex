import { Stack, router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { notificationHref } from "@/domain/deepLinks";
import { whenText } from "@/domain/when";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { FEED_PAGE, socialService } from "@/features/social/socialService";
import type { NotificationRow } from "@/services/supabase/database.types";
import { color, layout, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";

/**
 * In-app notifications (the bell on Home). Same rows push uses, so the inbox works even when push is
 * off. Read state is saved on the server. Blocked people's notifications are filtered by the server.
 */
export default function Inbox() {
  const { status } = useAuth();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await socialService.notifications(0);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setItems(r.data);
    setPage(0);
    setHasMore(r.data.length >= FEED_PAGE);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (status === "signedIn") void load();
    }, [status, load]),
  );

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to see notifications" />
      </Screen>
    );
  if (items === null && !error) return <LoadingState label="Loading notifications" />;
  if (items === null && error)
    return (
      <View style={styles.pad}>
        <ErrorState kind={error.key} onAction={() => void load()} />
      </View>
    );

  const unread = (items ?? []).filter((n) => !n.read_at).length;
  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      const r = await socialService.markRead(n.id);
      if (r.ok)
        setItems((xs) => (xs ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    const href = notificationHref({ entity_type: n.entity_type, entity_id: n.entity_id });
    if (href) router.push(href as Href);
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} tintColor={color.accent} />}
    >
      <Stack.Screen options={{ title: "Notifications" }} />
      {error ? <InlineError kind={error.key} onAction={() => void load()} /> : null}
      {items!.length === 0 ? (
        <EmptyState
          expression="neutral"
          message="Nothing yet"
          detail="New followers and updates to builds you follow show up here."
        />
      ) : (
        <>
          {unread > 0 ? (
            <Button
              title="Mark all as read"
              variant="secondary"
              onPress={async () => {
                const r = await socialService.markAllRead();
                if (r.ok)
                  setItems((xs) => (xs ?? []).map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
                else setError(r.error);
              }}
            />
          ) : null}
          {items!.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${n.read_at ? "" : "Unread. "}${n.title}. ${n.body}`}
              onPress={() => void open(n)}
              style={withPress({ minHeight: touch.min })}
            >
              <Card featured={!n.read_at}>
                <View style={styles.head}>
                  {n.read_at ? null : <View style={styles.dot} />}
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text variant="caption" muted>
                    {whenText(n.created_at)}
                  </Text>
                </View>
                <Text muted={Boolean(n.read_at)}>{n.body}</Text>
              </Card>
            </Pressable>
          ))}
          {hasMore ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={async () => {
                const next = page + 1;
                const r = await socialService.notifications(next);
                if (!r.ok) return setError(r.error);
                setItems((xs) => [...(xs ?? []), ...r.data]);
                setPage(next);
                if (r.data.length < FEED_PAGE) setHasMore(false);
              }}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pad: { padding: layout.screenGutter, gap: space.md, paddingBottom: space.huge, backgroundColor: color.background },
    head: { flexDirection: "row", alignItems: "center", gap: space.sm },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  }),
);
