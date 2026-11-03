import { demoShopService } from "@/demo/shop";
import { searchWords } from "@/domain/shop";
import type { ModCategoryId } from "@/domain/validation/build";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  ListingInput,
  ListingOffer,
  ListingStatus,
  MyListing,
  MyOffer,
  OfferMessage,
  PublicListing,
} from "@/services/supabase/database.types";

/**
 * The Shop (D-56): listings, offers and the buyer/seller chat. Listing limits, who may see or answer an offer,
 * blocks, mutes and moderation are all enforced by the database; this only calls it. No payments.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type BrowseQuery = { query?: string; category?: ModCategoryId | null; page?: number };

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
const PAGE = 20;

const realShopService = {
  browse: ({ query = "", category = null, page = 0 }: BrowseQuery) =>
    run(async () => {
      let req = sb().from("public_listings").select("*");
      if (category) req = req.eq("category", category);
      // words are letters and digits only, so they're safe inside the filter
      for (const w of searchWords(query)) req = req.or(`title.ilike.%${w}%,fits.ilike.%${w}%`);
      return must(
        await req
          .order("status")
          .order("boosted", { ascending: false })
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1),
      ) as PublicListing[];
    }),
  listing: (id: string) =>
    run(
      async () =>
        must(await sb().from("public_listings").select("*").eq("listing_id", id).maybeSingle()) as PublicListing | null,
    ),
  /** 5-minute signed photo URLs, after the server re-checks each listing is visible to this viewer. */
  photos: (ids: string[]) =>
    run(async () => {
      if (!ids.length) return {} as Record<string, string>;
      const { data, error } = await sb().functions.invoke<{ listings?: Record<string, string> }>("public-media", {
        body: { listings: ids.slice(0, 30) },
      });
      if (error) throw error;
      return data?.listings ?? {};
    }),
  myListings: () => run(async () => must(await sb().rpc("my_listings")) as MyListing[]),
  create: (input: ListingInput) =>
    run(async () => (must(await sb().from("listings").insert(input).select("id").single()) as { id: string }).id),
  update: (id: string, input: ListingInput) =>
    run(async () => {
      must(await sb().from("listings").update(input).eq("id", id).select("id").single());
    }),
  remove: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_listing", { p_listing: id }));
    }),
  setStatus: (id: string, status: ListingStatus) =>
    run(async () => {
      must(await sb().rpc("set_listing_status", { p_listing: id, p_status: status }));
    }),
  offersFor: (listingId: string) =>
    run(async () => must(await sb().rpc("listing_offers_for", { p_listing: listingId })) as ListingOffer[]),
  myOffers: () => run(async () => must(await sb().rpc("my_offers")) as MyOffer[]),
  makeOffer: (listingId: string, amountMinor: number, note: string | null) =>
    run(
      async () =>
        must(await sb().rpc("make_offer", { p_listing: listingId, p_amount: amountMinor, p_note: note })) as string,
    ),
  respond: (offerId: string, accept: boolean) =>
    run(async () => {
      must(await sb().rpc("respond_offer", { p_offer: offerId, p_accept: accept }));
    }),
  withdraw: (offerId: string) =>
    run(async () => {
      must(await sb().rpc("withdraw_offer", { p_offer: offerId }));
    }),
  thread: (offerId: string) =>
    run(async () => must(await sb().rpc("offer_thread", { p_offer: offerId })) as OfferMessage[]),
  send: (offerId: string, body: string) =>
    run(async () => {
      must(await sb().rpc("send_offer_message", { p_offer: offerId, p_body: body }));
    }),
};

export type ShopServiceApi = typeof realShopService;
export const shopService: ShopServiceApi = config.demoMode ? demoShopService : realShopService;
