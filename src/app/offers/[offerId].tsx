import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ChatHeaderCard, PrivateChat } from "@/components/chat/PrivateChat";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { OFFER_LABEL, priceText } from "@/domain/shop";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { SafetyNote } from "@/features/paddock/shop/ShopBits";
import { shopService } from "@/features/paddock/shopService";
import { useFlags } from "@/providers/AppProviders";
import type { OfferMessage, OfferStatus } from "@/services/supabase/database.types";
import { color, layout, type } from "@/theme/tokens";

type Context = { title: string; other: string; amount: string; status: OfferStatus };
const REFRESH_MS = 15_000;

/**
 * The private chat between a buyer and a seller on one offer. Only those two can read or write it (the server
 * checks); it closes when the offer is declined or withdrawn, or the listing is deleted.
 */
export default function OfferChat() {
  const flags = useFlags();
  const { status } = useAuth();
  if (!flags.marketplace) return <ComingSoon title="Shop" lines={["Buy and sell parts in Paddock"]} />;
  if (status !== "signedIn")
    return (
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <SignInPrompt message="Sign in to see this chat" />
      </View>
    );
  return <Chat />;
}

function Chat() {
  const params = useLocalSearchParams<{ offerId: string; listingId?: string }>();
  const offerId = String(params.offerId ?? "");
  const listingId = typeof params.listingId === "string" && isUuid(params.listingId) ? params.listingId : null;
  const [ctx, setCtx] = useState<Context | null | undefined>(undefined);
  const [messages, setMessages] = useState<OfferMessage[]>([]);

  // who's on the other side: you're either the buyer (your offers) or the seller (offers on your listing)
  const loadContext = useCallback(async (): Promise<Context | null> => {
    if (!isUuid(offerId)) return null;
    const mine = await shopService.myOffers();
    const o = mine.ok ? mine.data.find((x) => x.offer_id === offerId) : undefined;
    if (o)
      return {
        title: o.listing_title,
        other: `@${o.seller_username}`,
        amount: priceText(o.amount_minor, o.currency),
        status: o.status,
      };
    if (!listingId) return null;
    const [l, offers] = await Promise.all([shopService.listing(listingId), shopService.offersFor(listingId)]);
    const s = offers.ok ? offers.data.find((x) => x.offer_id === offerId) : undefined;
    if (!s) return null;
    const listing = l.ok ? l.data : null;
    return {
      title: listing?.title ?? "Your listing",
      other: `@${s.buyer_username}`,
      amount: priceText(s.amount_minor, listing?.currency),
      status: s.status,
    };
  }, [offerId, listingId]);

  const fetchAll = useCallback(() => Promise.all([loadContext(), shopService.thread(offerId)]), [loadContext, offerId]);
  const apply = useCallback(([c, t]: Awaited<ReturnType<typeof fetchAll>>) => {
    setCtx(c);
    if (t.ok) setMessages(t.data);
  }, []);

  // new messages show up without leaving the screen
  useEffect(() => {
    let alive = true;
    const tick = () => void fetchAll().then((r) => alive && apply(r));
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply]);

  if (ctx === undefined) return <LoadingState label="Loading chat" />;
  if (ctx === null)
    return (
      <View style={{ flex: 1, backgroundColor: color.background, padding: layout.screenGutter }}>
        <ErrorState
          kind="buildNotFound"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/paddock"))}
        />
      </View>
    );

  return (
    <>
      <Stack.Screen options={{ title: ctx.other }} />
      <PrivateChat
        header={
          <>
            <ChatHeaderCard label={`${ctx.title}, offer ${ctx.amount}, ${OFFER_LABEL[ctx.status]}`}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {ctx.title}
              </Text>
              <Text style={[type.spec, { fontSize: 20, lineHeight: 24, color: color.accent }]}>{ctx.amount}</Text>
              <Text variant="caption">{OFFER_LABEL[ctx.status]}</Text>
            </ChatHeaderCard>
            <SafetyNote />
          </>
        }
        messages={messages}
        open={ctx.status === "open" || ctx.status === "accepted"}
        to={ctx.other}
        emptyText="No messages yet. Ask about the part or suggest a public place to meet."
        closedText="This offer is closed, so the chat is read-only."
        onSend={async (body) => {
          const r = await shopService.send(offerId, body);
          if (r.ok) apply(await fetchAll());
          return r;
        }}
      />
    </>
  );
}
