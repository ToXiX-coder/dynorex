import { useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { Appear } from "@/components/motion/Motion";
import { Text } from "@/components/Text";
import type { MappedError } from "@/features/auth/errors";
import type { OfferMessage } from "@/services/supabase/database.types";
import { border, color, layout, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * A two-person chat screen body (Shop offers, service requests): header content on top, bubbles, and an input
 * bar while the conversation is open. The server decides who may read and write; this only shows it.
 */
export type ChatMessage = OfferMessage & { can_remove?: boolean };

export function PrivateChat({
  header,
  messages,
  open,
  to,
  emptyText,
  closedText,
  onSend,
  showNames = false,
  onMessageMenu,
}: {
  header: ReactNode;
  messages: ChatMessage[];
  open: boolean;
  /** who the message goes to, for the input's label ("@speed_shop") */
  to: string;
  emptyText: string;
  closedText: string;
  onSend: (body: string) => Promise<{ ok: true } | { ok: false; error: MappedError }>;
  /** group chats: show who said what */
  showNames?: boolean;
  /** long-press (or the accessibility action) opens options for a message (remove, report) */
  onMessageMenu?: (message: ChatMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const r = await onSend(text);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDraft("");
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {header}
          {messages.length === 0 ? <Text muted>{emptyText}</Text> : null}
          {messages.map((m) => {
            const actionable = !!onMessageMenu;
            return (
              // new bubbles rise in from their side; already-shown ones keep their place (keyed by id)
              <Appear
                key={m.message_id}
                rise={6}
                style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "82%" }}
              >
                <Pressable
                  disabled={!actionable}
                  onLongPress={actionable ? () => onMessageMenu(m) : undefined}
                  style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}
                  accessible
                  accessibilityLabel={`${m.mine ? "You" : `@${m.sender_username}`}: ${m.body}`}
                  accessibilityHint={actionable ? "Long press for message options" : undefined}
                  accessibilityActions={actionable ? [{ name: "menu", label: "Message options" }] : undefined}
                  onAccessibilityAction={actionable ? () => onMessageMenu(m) : undefined}
                >
                  {showNames && !m.mine ? (
                    <Text variant="caption" style={{ color: color.accent }}>{`@${m.sender_username}`}</Text>
                  ) : null}
                  <Text style={m.mine ? { color: color.onAccent } : undefined}>{m.body}</Text>
                </Pressable>
              </Appear>
            );
          })}
          {error ? <InlineError kind={error.key} /> : null}
        </ScrollView>
        {open ? (
          <View style={styles.inputBar}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={color.textMuted}
              selectionColor={color.accent}
              accessibilityLabel={`Message to ${to}`}
              maxLength={1000}
              multiline
              style={styles.input}
            />
            <Button title="Send" disabled={!draft.trim() || busy} onPress={() => void send()} />
          </View>
        ) : (
          <Text muted style={{ padding: space.md, textAlign: "center" }}>
            {closedText}
          </Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The summary card at the top of a chat. */
export function ChatHeaderCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.header} accessible accessibilityLabel={label}>
      {children}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    scroll: {
      padding: layout.screenGutter,
      gap: space.sm,
      width: "100%",
      maxWidth: layout.maxContentWidth,
      alignSelf: "center",
    },
    header: {
      gap: 2,
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: color.surface,
      borderWidth: border.hairline,
      borderColor: color.hairline,
    },
    bubble: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
    mine: { alignSelf: "flex-end", backgroundColor: color.accent, borderBottomRightRadius: radius.sm },
    theirs: {
      alignSelf: "flex-start",
      backgroundColor: color.surface,
      borderWidth: border.hairline,
      borderColor: color.hairline,
      borderBottomLeftRadius: radius.sm,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: space.sm,
      padding: space.sm,
      borderTopWidth: border.hairline,
      borderTopColor: color.hairline,
      backgroundColor: color.background,
    },
    input: {
      ...type.body,
      flex: 1,
      minHeight: touch.min,
      maxHeight: 120,
      color: color.text,
      borderWidth: border.regular,
      borderColor: color.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
  }),
);
