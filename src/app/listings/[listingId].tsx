import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { isUuid, userPath } from "@/domain/deepLinks";
import { conditionLabel, OFFER_LABEL, parsePrice, priceText } from "@/domain/shop";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { ListingFitment } from "@/features/garage/PerfBits";
import { categoryLabel, PartTile, SafetyNote, StatusTag } from "@/features/paddock/shop/ShopBits";
import { shopService } from "@/features/paddock/shopService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { useGoToSignIn } from "@/features/social/FollowButton";
import { SaveButton } from "@/features/social/SaveButton";
import { useFlags } from "@/providers/AppProviders";
import type { ListingOffer, MyOffer, PublicListing } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, space, touch, type } from "@/theme/tokens";

type Loaded = { listing: PublicListing | null; photo?: string; offers: ListingOffer[]; mine: MyOffer | null };

/**
 * dynorex.app/listings/:listingId. Anyone can look; signed-in buyers make one offer at a time; the seller sees
 * every offer, accepts one (the part goes on hold), chats with that buyer, and marks it sold. No payments.
 */
export default function ListingScreen() {
  const flags = useFlags();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const id = String(listingId ?? "");
  const { status, profile } = useAuth();
  const signed = status === "signedIn";
  const goToSignIn = useGoToSignIn();
  const [data, setData] = useState<Loaded | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSeller = (l: PublicListing | null) => !!l && !!profile?.username && l.seller_username === profile.username;

  const load = useCallback(async (): Promise<Loaded> => {
    if (!isUuid(id)) return { listing: null, offers: [], mine: null };
    const r = await shopService.listing(id);
    const listing = r.ok ? r.data : null;
    if (!listing) return { listing: null, offers: [], mine: null };
    const [photos, offers, mine] = await Promise.all([
      listing.has_photo ? shopService.photos([id]) : Promise.resolve(null),
      signed && isSeller(listing) ? shopService.offersFor(id) : Promise.resolve(null),
      signed && !isSeller(listing) ? shopService.myOffers() : Promise.resolve(null),
    ]);
    return {
      listing,
      photo: photos && photos.ok ? photos.data[id] : undefined,
      offers: offers && offers.ok ? offers.data : [],
      mine:
        mine && mine.ok
          ? (mine.data.find((o) => o.listing_id === id && (o.status === "open" || o.status === "accepted")) ?? null)
          : null,
    };
    // isSeller only reads profile.username
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, signed, profile?.username]);

  useEffect(() => {
    let alive = true;
    void load().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [load, reload]);

  if (!flags.marketplace) return <ComingSoon title="Shop" lines={["Buy and sell parts in Paddock"]} />;
  if (data === undefined) return <LoadingState label="Loading listing" />;
  const l = data.listing;
  if (!l)
    return (
      <Screen>
        <ErrorState
          kind="buildNotFound"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/paddock"))}
        />
      </Screen>
    );

  const seller = isSeller(l);
  const refresh = () => setReload((n) => n + 1);
  const act = async (fn: () => Promise<{ ok: true } | { ok: false; error: MappedError }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    refresh();
  };

  return (
    <Screen onRefresh={refresh}>
      <ScreenMenu
        title={l.title}
        label="Listing options"
        actions={[
          ...(seller
            ? [
                {
                  label: "Edit listing",
                  onPress: () => router.push({ pathname: "/paddock/sell", params: { listingId: id } }),
                },
                ...(l.status === "sold"
                  ? [{ label: "Put it back up", onPress: () => void act(() => shopService.setStatus(id, "active")) }]
                  : []),
                { label: "Delete listing", destructive: true, onPress: () => setConfirmDelete(true) },
              ]
            : []),
          ...(signed && !seller
            ? [
                {
                  label: "Report this listing",
                  hint: "Tell Dynorex about a problem.",
                  onPress: () => setReporting(true),
                },
              ]
            : []),
        ]}
      />
      <View>
        {l.has_photo ? (
          <PublicImage uri={data.photo} alt={`Photo of ${l.title}`} style={styles.photo} />
        ) : (
          <PartTile category={l.category} style={styles.photo} />
        )}
        <View style={{ position: "absolute", top: space.sm, left: space.sm }}>
          <StatusTag status={l.status} />
        </View>
      </View>

      <View style={{ gap: space.xxs }}>
        <Text style={[type.spec, { fontSize: 34, lineHeight: 38, color: color.accent }]}>
          {priceText(l.price_minor, l.currency)}
        </Text>
        <Text variant="title">{l.title}</Text>
        <Text variant="caption">
          {`${conditionLabel(l.condition)} · ${categoryLabel(l.category)} · ${l.location_text}`}
        </Text>
        {l.fits ? <Text variant="caption">{`Fits: ${l.fits}`}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Seller: @${l.seller_username}. Open profile`}
        onPress={() => router.push(userPath(l.seller_username))}
        style={withPress({ minHeight: touch.min, justifyContent: "center" })}
      >
        <Text variant="bodyStrong" style={{ color: color.accent }}>{`Sold by @${l.seller_username} ›`}</Text>
      </Pressable>
      {l.description ? <Text>{l.description}</Text> : null}
      {!seller ? <SaveButton kind="listing" id={id} /> : null}
      {signed && !seller ? <ListingFitment category={l.category} title={l.title} fits={l.fits} /> : null}
      {error ? <InlineError kind={error.key} /> : null}

      {seller ? (
        <SellerPanel listing={l} offers={data.offers} busy={busy} act={act} />
      ) : !signed ? (
        <Button title="Sign in to make an offer" variant="secondary" onPress={goToSignIn} />
      ) : data.mine ? (
        <MyOfferCard
          offer={data.mine}
          busy={busy}
          onWithdraw={() => void act(() => shopService.withdraw(data.mine!.offer_id))}
        />
      ) : l.status === "active" ? (
        <OfferForm listing={l} onSent={refresh} />
      ) : (
        <Text muted>{l.status === "sold" ? "This part is sold." : "This part is on hold for another buyer."}</Text>
      )}
      <SafetyNote />

      <ReportSheet visible={reporting} target={{ type: "listing", id }} onClose={() => setReporting(false)} />
      <ConfirmModal
        visible={confirmDelete}
        kind="deleteListing"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const r = await shopService.remove(id);
          if (!r.ok) return setError(r.error);
          router.replace({ pathname: "/paddock", params: { section: "shop" } });
        }}
      />
    </Screen>
  );
}

type Act = (fn: () => Promise<{ ok: true } | { ok: false; error: MappedError }>) => Promise<void>;

function SellerPanel({
  listing: l,
  offers,
  busy,
  act,
}: {
  listing: PublicListing;
  offers: ListingOffer[];
  busy: boolean;
  act: Act;
}) {
  const live = offers.filter((o) => o.status === "open" || o.status === "accepted");
  const closed = offers.filter((o) => o.status === "declined" || o.status === "withdrawn");
  const accepted = offers.find((o) => o.status === "accepted");
  return (
    <>
      {l.status === "pending" && accepted ? (
        <InlineNotice
          title={`On hold for @${accepted.buyer_username}`}
          body="Arrange pickup in the chat. Mark it sold once the part changes hands, or put it back up if the deal falls through."
        >
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button
              title="Mark sold"
              loading={busy}
              onPress={() => void act(() => shopService.setStatus(l.listing_id, "sold"))}
            />
            <Button
              title="Put back up"
              variant="secondary"
              disabled={busy}
              onPress={() => void act(() => shopService.setStatus(l.listing_id, "active"))}
            />
          </View>
        </InlineNotice>
      ) : null}
      {l.status === "active" ? (
        <Button
          title="Mark sold elsewhere"
          variant="secondary"
          disabled={busy}
          onPress={() => void act(() => shopService.setStatus(l.listing_id, "sold"))}
        />
      ) : null}
      <SectionHeader>Offers</SectionHeader>
      {offers.length === 0 ? <Text muted>No offers yet. You&apos;ll get a notification when one comes in.</Text> : null}
      {[...live, ...closed].map((o) => (
        <Card
          key={o.offer_id}
          style={o.status === "declined" || o.status === "withdrawn" ? { opacity: 0.6 } : undefined}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="bodyStrong">{`@${o.buyer_username}`}</Text>
            <Text style={[type.spec, { fontSize: 20, lineHeight: 24 }]}>{priceText(o.amount_minor, l.currency)}</Text>
          </View>
          {o.note ? <Text>{o.note}</Text> : null}
          <Text variant="caption" muted>
            {o.status === "open" ? "Waiting for your answer" : OFFER_LABEL[o.status]}
          </Text>
          {o.status === "open" ? (
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              {l.status === "active" ? (
                <Button
                  title="Accept"
                  loading={busy}
                  onPress={() => void act(() => shopService.respond(o.offer_id, true))}
                />
              ) : null}
              <Button
                title="Decline"
                variant="secondary"
                disabled={busy}
                onPress={() => void act(() => shopService.respond(o.offer_id, false))}
              />
              <Button title="Chat" variant="secondary" onPress={() => openChat(o.offer_id, l.listing_id)} />
            </View>
          ) : o.status === "accepted" ? (
            <Button title="Open chat" onPress={() => openChat(o.offer_id, l.listing_id)} />
          ) : null}
        </Card>
      ))}
    </>
  );
}

function MyOfferCard({ offer: o, busy, onWithdraw }: { offer: MyOffer; busy: boolean; onWithdraw: () => void }) {
  return (
    <Card>
      <Text variant="label">Your offer</Text>
      <Text style={[type.spec, { fontSize: 26, lineHeight: 30 }]}>{priceText(o.amount_minor, o.currency)}</Text>
      <Text variant="caption">
        {o.status === "accepted" ? "Accepted. Arrange pickup in the chat." : OFFER_LABEL[o.status]}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title="Open chat" onPress={() => openChat(o.offer_id, o.listing_id)} />
        <Button title="Withdraw offer" variant="secondary" loading={busy} onPress={onWithdraw} />
      </View>
    </Card>
  );
}

function OfferForm({ listing: l, onSent }: { listing: PublicListing; onSent: () => void }) {
  const [amount, setAmount] = useState(
    l.price_minor ? (l.price_minor / 100).toFixed(l.price_minor % 100 ? 2 : 0) : "0",
  );
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setError(null);
    const p = parsePrice(amount);
    if (!p.ok) return setAmountError(p.message);
    setAmountError(null);
    setBusy(true);
    const r = await shopService.makeOffer(l.listing_id, p.minor, note.trim() || null);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSent();
  };
  return (
    <Card>
      <SectionHeader>Make an offer</SectionHeader>
      <TextField
        label="Your offer in dollars"
        required
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={amountError}
      />
      <TextField
        label="Note to the seller (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        placeholder="When you could pick it up, questions about the part"
      />
      {error ? <InlineError kind={error.key} /> : null}
      <Button title="Send offer" fullWidth loading={busy} onPress={() => void send()} />
      <Text variant="caption" muted>
        The seller sees your username, offer and note. You two get a private chat on the offer to ask questions and
        arrange pickup.
      </Text>
    </Card>
  );
}

const openChat = (offerId: string, listingId: string) =>
  router.push({ pathname: "/offers/[offerId]", params: { offerId, listingId } });

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12, overflow: "hidden" },
});
