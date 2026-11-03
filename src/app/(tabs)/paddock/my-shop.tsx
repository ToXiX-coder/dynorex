import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { OFFER_LABEL, priceText, STATUS_LABEL } from "@/domain/shop";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { shopService } from "@/features/paddock/shopService";
import { useFlags } from "@/providers/AppProviders";
import type { MyListing, MyOffer } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, space, touch, type } from "@/theme/tokens";

/** Your side of the Shop: what you're selling (with open offers) and the offers you've made. */
export default function MyShop() {
  const flags = useFlags();
  const { status } = useAuth();
  const [tab, setTab] = useState<"selling" | "buying">("selling");
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(() => {
    void Promise.all([shopService.myListings(), shopService.myOffers()]).then(([l, o]) => {
      if (!l.ok) return setError(l.error);
      if (!o.ok) return setError(o.error);
      setError(null);
      setListings(l.data);
      setOffers(o.data);
    });
  }, []);
  useFocusEffect(load);

  if (!flags.marketplace) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to see your shop" />
      </Screen>
    );

  const row = (key: string, label: string, onPress: () => void, children: React.ReactNode) => (
    <Pressable
      key={key}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={withPress({ minHeight: touch.min })}
    >
      <Card>{children}</Card>
    </Pressable>
  );

  return (
    <Screen onRefresh={load}>
      <View style={{ flexDirection: "row", gap: space.xs }} accessibilityRole="tablist">
        <Chip label="Selling" selected={tab === "selling"} onPress={() => setTab("selling")} />
        <Chip label="Buying" selected={tab === "buying"} onPress={() => setTab("buying")} />
      </View>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {listings === null && !error ? <LoadingState label="Loading your shop" /> : null}

      {tab === "selling" && listings ? (
        <>
          <Button title="Sell a part" onPress={() => router.push("/paddock/sell")} />
          {listings.length === 0 ? <EmptyState message="Nothing listed" detail="Parts you sell show up here." /> : null}
          {listings.map((l) => {
            const offersText = l.open_offers
              ? `${l.open_offers} open offer${l.open_offers === 1 ? "" : "s"}`
              : "No open offers";
            return row(
              l.listing_id,
              `${l.title}, ${priceText(l.price_minor, l.currency)}, ${STATUS_LABEL[l.status]}, ${offersText}`,
              () => router.push(`/listings/${l.listing_id}`),
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                    {l.title}
                  </Text>
                  <Text style={[type.spec, { fontSize: 20, lineHeight: 24 }]}>
                    {priceText(l.price_minor, l.currency)}
                  </Text>
                </View>
                <Text variant="caption">
                  {`${STATUS_LABEL[l.status]} · `}
                  <Text variant="caption" style={l.open_offers ? { color: color.accent } : undefined}>
                    {offersText}
                  </Text>
                </Text>
              </>,
            );
          })}
        </>
      ) : null}

      {tab === "buying" && offers ? (
        <>
          {offers.length === 0 ? (
            <EmptyState message="No offers yet" detail="Offers you make on parts show up here." />
          ) : null}
          {offers.map((o) => {
            const live = o.status === "open" || o.status === "accepted";
            return row(
              o.offer_id,
              `${o.listing_title}: your offer ${priceText(o.amount_minor, o.currency)}, ${OFFER_LABEL[o.status]}`,
              () =>
                live
                  ? router.push({ pathname: "/offers/[offerId]", params: { offerId: o.offer_id } })
                  : router.push(`/listings/${o.listing_id}`),
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                    {o.listing_title}
                  </Text>
                  <Text style={[type.spec, { fontSize: 20, lineHeight: 24 }]}>
                    {priceText(o.amount_minor, o.currency)}
                  </Text>
                </View>
                <Text variant="caption">{`${OFFER_LABEL[o.status]} · from @${o.seller_username}`}</Text>
              </>,
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}
