import { LISTING_LIMIT, matchesListing, sortListings } from "@/domain/shop";
import type { ShopServiceApi } from "@/features/paddock/shopService";
import type { ListingRow, OfferStatus, PublicListing } from "@/services/supabase/database.types";
import { DEMO_ME, type DemoOffer } from "./data";
import { demoKit as K } from "./services";

/** Pitch-mode Shop: the same rules as migration 20261018000000_shop.sql, on sample data. No payments. */
const S = () => K.state();
const now = () => new Date().toISOString();
const DAY = 86_400_000;
const isPlus = (uid: string) => (uid === DEMO_ME ? S().subscription.plus : S().plusUsers.has(uid));
const live = (o: DemoOffer) => o.status === "open" || o.status === "accepted";

function publicListing(l: ListingRow): PublicListing | null {
  const seller = K.userById(l.seller_id);
  if (l.deleted_at || !seller?.username || K.blockedWith(l.seller_id) || K.muted(l.seller_id)) return null;
  if (l.status === "sold" && (!l.sold_at || Date.now() - Date.parse(l.sold_at) > 7 * DAY)) return null;
  return {
    listing_id: l.id,
    seller_username: seller.username,
    title: l.title,
    description: l.description,
    category: l.category,
    condition: l.condition,
    price_minor: l.price_minor,
    currency: l.currency,
    fits: l.fits,
    location_text: l.location_text,
    has_photo: !!l.photo_path,
    status: l.status,
    created_at: l.created_at,
    boosted: l.status === "active" && Date.now() - Date.parse(l.created_at) < 3 * DAY && isPlus(l.seller_id),
  };
}
const mine = (id: string) => S().listings.find((l) => l.id === id && l.seller_id === DEMO_ME && !l.deleted_at);
const offerById = (id: string) => S().offers.find((o) => o.id === id);
const setOffer = (o: DemoOffer, status: OfferStatus) => void (o.status = status);
/** The offer, if you're its buyer or the listing's seller and it's still live. */
function party(offerId: string) {
  const o = offerById(offerId);
  const l = o && S().listings.find((x) => x.id === o.listing_id);
  if (!o || !l || (o.buyer_id !== DEMO_ME && l.seller_id !== DEMO_ME)) return null;
  return { o, l, live: live(o) && !l.deleted_at };
}

export const demoShopService: ShopServiceApi = {
  browse: ({ query = "", category = null, page = 0 }) =>
    K.run(() =>
      K.page(
        S()
          .listings.map(publicListing)
          .filter((l): l is PublicListing => l !== null && matchesListing(l, query, category))
          .sort(sortListings),
        page,
      ),
    ),
  listing: (id) =>
    K.run(() => {
      const l = S().listings.find((x) => x.id === id);
      return l ? publicListing(l) : null;
    }),
  photos: (ids) =>
    K.run(() => {
      const out: Record<string, string> = {};
      for (const id of ids) {
        const l = S().listings.find((x) => x.id === id);
        if (l?.photo_path && publicListing(l)) out[id] = l.photo_path;
      }
      return out;
    }),
  myListings: () =>
    K.run(() =>
      S()
        .listings.filter((l) => l.seller_id === DEMO_ME && !l.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((l) => ({
          listing_id: l.id,
          title: l.title,
          category: l.category,
          condition: l.condition,
          price_minor: l.price_minor,
          currency: l.currency,
          fits: l.fits,
          location_text: l.location_text,
          description: l.description,
          photo_path: l.photo_path,
          status: l.status,
          created_at: l.created_at,
          open_offers: S().offers.filter((o) => o.listing_id === l.id && o.status === "open").length,
        })),
    ),
  create: (input) =>
    K.run(() => {
      const up = S().listings.filter(
        (l) => l.seller_id === DEMO_ME && !l.deleted_at && (l.status === "active" || l.status === "pending"),
      ).length;
      if (up >= (isPlus(DEMO_ME) ? LISTING_LIMIT.plus : LISTING_LIMIT.free)) K.refuse("planLimitListings");
      const row: ListingRow = {
        id: K.newId(),
        seller_id: DEMO_ME,
        ...input,
        currency: "USD",
        photo_path: null,
        status: "active",
        sold_at: null,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };
      S().listings.push(row);
      return row.id;
    }),
  update: (id, input) =>
    K.run(() => {
      const l = mine(id) ?? K.refuse("buildNotFound");
      Object.assign(l, input, { updated_at: now() });
    }),
  remove: (id) =>
    K.run(() => {
      const l = mine(id);
      if (!l) return;
      l.deleted_at = now();
      S()
        .offers.filter((o) => o.listing_id === id && live(o))
        .forEach((o) => setOffer(o, "declined"));
    }),
  setStatus: (id, status) =>
    K.run(() => {
      const l = mine(id) ?? K.refuse("buildNotFound");
      if (l.status === status) return;
      if (status === "pending") K.refuse("acceptAnOffer");
      const offers = S().offers.filter((o) => o.listing_id === id);
      if (status === "active") {
        offers.filter((o) => o.status === "accepted").forEach((o) => setOffer(o, "declined"));
        Object.assign(l, { status, sold_at: null });
      } else {
        offers.filter((o) => o.status === "open").forEach((o) => setOffer(o, "declined"));
        Object.assign(l, { status, sold_at: now() });
      }
    }),
  offersFor: (listingId) =>
    K.run(() =>
      mine(listingId)
        ? S()
            .offers.filter((o) => o.listing_id === listingId && !K.blockedWith(o.buyer_id))
            .sort((a, b) => Number(live(b)) - Number(live(a)) || b.created_at.localeCompare(a.created_at))
            .map((o) => ({
              offer_id: o.id,
              buyer_username: K.userById(o.buyer_id)!.username!,
              amount_minor: o.amount_minor,
              note: o.note,
              status: o.status,
              created_at: o.created_at,
            }))
        : [],
    ),
  myOffers: () =>
    K.run(() =>
      S()
        .offers.filter((o) => o.buyer_id === DEMO_ME)
        .flatMap((o) => {
          const l = S().listings.find((x) => x.id === o.listing_id && !x.deleted_at);
          if (!l) return [];
          return [
            {
              offer_id: o.id,
              listing_id: l.id,
              listing_title: l.title,
              seller_username: K.userById(l.seller_id)!.username!,
              amount_minor: o.amount_minor,
              currency: l.currency,
              note: o.note,
              status: o.status,
              listing_status: l.status,
              created_at: o.created_at,
            },
          ];
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  makeOffer: (listingId, amount, note) =>
    K.run(() => {
      const l = S().listings.find((x) => x.id === listingId);
      if (!l || !publicListing(l)) K.refuse("buildNotFound");
      if (l!.seller_id === DEMO_ME) K.refuse("ownListing");
      if (l!.status !== "active") K.refuse("listingUnavailable");
      if (S().offers.some((o) => o.listing_id === listingId && o.buyer_id === DEMO_ME && live(o)))
        K.refuse("offerExists");
      const o: DemoOffer = {
        id: K.newId(),
        listing_id: listingId,
        buyer_id: DEMO_ME,
        amount_minor: amount,
        note: note?.trim() || null,
        status: "open",
        created_at: now(),
      };
      S().offers.push(o);
      return o.id;
    }),
  respond: (offerId, accept) =>
    K.run(() => {
      const o = offerById(offerId);
      const l = o && mine(o.listing_id);
      if (!o || !l) return K.refuse("buildNotFound");
      if (o.status !== "open") K.refuse("offerClosed");
      if (!accept) return setOffer(o, "declined");
      if (l.status !== "active") K.refuse("listingUnavailable");
      setOffer(o, "accepted");
      S()
        .offers.filter((x) => x.listing_id === l.id && x.id !== o.id && x.status === "open")
        .forEach((x) => setOffer(x, "declined"));
      l.status = "pending";
    }),
  withdraw: (offerId) =>
    K.run(() => {
      const o = offerById(offerId);
      if (!o || o.buyer_id !== DEMO_ME || !live(o)) return;
      const was = o.status;
      setOffer(o, "withdrawn");
      const l = S().listings.find((x) => x.id === o.listing_id);
      if (was === "accepted" && l?.status === "pending") l.status = "active";
    }),
  thread: (offerId) =>
    K.run(() =>
      party(offerId)
        ? S()
            .offerMessages.filter((m) => m.offer_id === offerId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((m) => ({
              message_id: m.id,
              mine: m.sender_id === DEMO_ME,
              sender_username: K.userById(m.sender_id)!.username!,
              body: m.body,
              created_at: m.created_at,
            }))
        : [],
    ),
  send: (offerId, body) =>
    K.run(() => {
      const p = party(offerId) ?? K.refuse("buildNotFound");
      if (!p.live) K.refuse("offerClosed");
      const other = p.o.buyer_id === DEMO_ME ? p.l.seller_id : p.o.buyer_id;
      if (K.blockedWith(other)) K.refuse("buildNotFound");
      const text = body.trim();
      if (!text || text.length > 1000) K.refuse("saveFailed");
      S().offerMessages.push({ id: K.newId(), offer_id: offerId, sender_id: DEMO_ME, body: text, created_at: now() });
    }),
};
