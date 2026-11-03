import { demoChatService } from "@/demo/extras";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { RoomMessage, RoomType } from "@/services/supabase/database.types";

/**
 * Group chat for an event (its host and everyone who RSVP'd) or a club (its members). Who's in the room, blocks,
 * rate limits and who may remove a message are all decided by the database.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: mapError(e) };
  }
}
function sb() {
  const c = getSupabase();
  if (!c) throw new Error("not_configured");
  return c;
}
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const realChatService = {
  messages: (type: RoomType, roomId: string) =>
    run(async () => must(await sb().rpc("room_messages_for", { p_type: type, p_room: roomId })) as RoomMessage[]),
  send: (type: RoomType, roomId: string, body: string) =>
    run(async () => {
      must(await sb().rpc("send_room_message", { p_type: type, p_room: roomId, p_body: body }));
    }),
  remove: (messageId: string) =>
    run(async () => {
      must(await sb().rpc("remove_room_message", { p_message: messageId }));
    }),
};

export type ChatServiceApi = typeof realChatService;
export const chatService: ChatServiceApi = config.demoMode ? demoChatService : realChatService;
