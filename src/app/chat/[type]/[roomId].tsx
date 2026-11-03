import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ChatHeaderCard, PrivateChat, type ChatMessage } from "@/components/chat/PrivateChat";
import { ActionSheet, type SheetAction } from "@/components/feedback/ActionSheet";
import { LoadingState } from "@/components/feedback/States";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { chatService } from "@/features/paddock/chatService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import type { RoomMessage, RoomType } from "@/services/supabase/database.types";
import { color } from "@/theme/tokens";

const REFRESH_MS = 10_000;

/**
 * Group chat for an event (host + everyone who RSVP'd) or a club (members). The server decides who's in the
 * room; blocked people's messages are left out. Long-press a message for options: remove it (yours, or any if you
 * host the event or run the club) or report someone else's.
 */
export default function RoomChat() {
  const { status } = useAuth();
  if (status !== "signedIn")
    return (
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <SignInPrompt message="Sign in to chat" />
      </View>
    );
  return <Room />;
}

function Room() {
  const params = useLocalSearchParams<{ type: string; roomId: string; title?: string }>();
  const type: RoomType = params.type === "club" ? "club" : "event";
  const roomId = String(params.roomId ?? "");
  const title =
    typeof params.title === "string" && params.title
      ? params.title.slice(0, 80)
      : type === "club"
        ? "Club chat"
        : "Event chat";
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const fetchAll = useCallback(() => chatService.messages(type, roomId), [type, roomId]);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      void fetchAll().then((r) => {
        if (alive) setMessages(r.ok ? r.data : []);
      });
    if (isUuid(roomId)) tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fetchAll, roomId]);

  if (messages === null) return <LoadingState label="Loading chat" />;
  const refresh = async () => {
    const r = await fetchAll();
    if (r.ok) setMessages(r.data);
  };
  const actions: SheetAction[] = menu
    ? [
        ...(menu.can_remove
          ? [
              {
                label: "Remove message",
                destructive: true,
                onPress: () => void chatService.remove(menu.message_id).then(refresh),
              },
            ]
          : []),
        ...(!menu.mine
          ? [
              {
                label: "Report message",
                hint: "Tell Dynorex about a problem.",
                onPress: () => setReporting(menu.message_id),
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <Stack.Screen options={{ title }} />
      <PrivateChat
        header={
          <ChatHeaderCard label={`${title}, group chat`}>
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="caption" muted>
              {type === "club"
                ? "Members only. Be decent; reports go to Dynorex moderators."
                : "For the host and everyone who RSVP'd. Plan the meet and share ETAs. No street racing."}
            </Text>
          </ChatHeaderCard>
        }
        messages={messages}
        open
        to={title}
        showNames
        emptyText="No messages yet. Say hi."
        closedText=""
        onMessageMenu={(m) => setMenu(m)}
        onSend={async (body) => {
          const r = await chatService.send(type, roomId, body);
          if (r.ok) await refresh();
          return r;
        }}
      />
      <ActionSheet
        visible={menu !== null && actions.length > 0}
        title="Message"
        actions={actions}
        onClose={() => setMenu(null)}
      />
      <ReportSheet
        visible={reporting !== null}
        target={{ type: "room_message", id: reporting ?? "" }}
        onClose={() => setReporting(null)}
      />
    </>
  );
}
