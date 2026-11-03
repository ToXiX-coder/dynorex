import type { RecordsServiceApi } from "@/features/garage/recordsService";
import type { ReviewServiceApi } from "@/features/line/reviewService";
import type { AlbumServiceApi } from "@/features/paddock/albumService";
import type { PublicEventPhoto, RouteReview } from "@/services/supabase/database.types";
import { DEMO_ME } from "./data";
import { demoCanAddEventPhoto, demoKit as K } from "./services";
import { publicEvent, publicRoute } from "./v2";

/** Pitch-mode twins for D-61 (migration 20261023000000_owner_upgrades.sql), on sample data. */
const S = () => K.state();
const now = () => new Date().toISOString();
const myVehicle = (id: string) => S().vehicles.find((v) => v.id === id && v.owner_id === DEMO_ME && !v.deleted_at);
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null;
};

// ---------------------------------------------------------------- receipts and service history

export const demoRecordsService: RecordsServiceApi = {
  receipts: (vehicleId) =>
    K.run(() =>
      S()
        .receipts.filter((r) => r.vehicle_id === vehicleId && r.owner_id === DEMO_ME)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  removeReceipt: (id) =>
    K.run(() => {
      S().receipts = S().receipts.filter((r) => !(r.id === id && r.owner_id === DEMO_ME));
    }),
  historyShare: (vehicleId) =>
    K.run(() => {
      const s = S().historyShares.find((x) => x.vehicle_id === vehicleId && Date.parse(x.expires_at) > Date.now());
      return myVehicle(vehicleId) && s ? { token: s.token, expires_at: s.expires_at } : null;
    }),
  createHistoryShare: (vehicleId) =>
    K.run(() => {
      const v = myVehicle(vehicleId) ?? K.refuse("buildNotFound");
      if (v.sold_at) K.refuse("buildNotFound");
      // D-64: a buyer's link locks the VIN
      v.vin_locked_at ??= now();
      const token = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      S().historyShares = S().historyShares.filter((x) => x.vehicle_id !== vehicleId);
      S().historyShares.push({
        vehicle_id: vehicleId,
        token,
        expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      });
      return token;
    }),
  revokeHistoryShare: (vehicleId) =>
    K.run(() => {
      S().historyShares = S().historyShares.filter((x) => x.vehicle_id !== vehicleId);
    }),
};

// ---------------------------------------------------------------- meet albums

const visibleEvent = (id: string) => {
  const e = S().events.find((x) => x.id === id);
  return e ? publicEvent(e) : null;
};
const albumRows = (eventId: string) =>
  S().eventPhotos.filter(
    (p) => p.event_id === eventId && !p.deleted_at && !K.blockedWith(p.owner_id) && K.userById(p.owner_id)?.username,
  );
const iHost = (eventId: string) => S().events.some((e) => e.id === eventId && e.organizer_id === DEMO_ME);

export const demoAlbumService: AlbumServiceApi = {
  photos: (eventId) =>
    K.run((): PublicEventPhoto[] =>
      visibleEvent(eventId)
        ? albumRows(eventId).map((p) => ({
            photo_id: p.id,
            event_id: p.event_id,
            owner_username: K.userById(p.owner_id)!.username!,
            width: null,
            height: null,
            created_at: p.created_at,
          }))
        : [],
    ),
  // the "url" is the local file or a "sample:" path; the screen turns samples into bundled images
  urls: (photoIds) =>
    K.run(() =>
      Object.fromEntries(
        S()
          .eventPhotos.filter((p) => photoIds.includes(p.id) && !p.deleted_at)
          .map((p) => [p.id, p.storage_path]),
      ),
    ),
  canAdd: (eventId) => K.run(() => demoCanAddEventPhoto(eventId)),
  removable: (eventId) =>
    K.run(() =>
      S()
        .eventPhotos.filter(
          (p) => p.event_id === eventId && !p.deleted_at && (p.owner_id === DEMO_ME || iHost(eventId)),
        )
        .map((p) => p.id),
    ),
  remove: (photoId) =>
    K.run(() => {
      const p = S().eventPhotos.find((x) => x.id === photoId && !x.deleted_at);
      if (p && (p.owner_id === DEMO_ME || iHost(p.event_id))) p.deleted_at = now();
    }),
};

// ---------------------------------------------------------------- road reviews

const routeIsPublic = (id: string) => {
  const r = S().routes.find((x) => x.id === id);
  return Boolean(r && publicRoute(r));
};
const reviewers = (routeId: string) =>
  S().ratings.filter((x) => x.route_id === routeId && K.userById(x.user_id)?.username && !K.blockedWith(x.user_id));

export const demoReviewService: ReviewServiceApi = {
  summary: (routeId) =>
    K.run(() => {
      const rs = routeIsPublic(routeId) ? reviewers(routeId) : [];
      return {
        reviews: rs.length,
        stars: avg(rs.map((x) => x.stars)),
        scenery: avg(rs.map((x) => x.scenery)),
        surface: avg(rs.map((x) => x.surface)),
        traffic: avg(rs.map((x) => x.traffic)),
      };
    }),
  reviews: (routeId) =>
    K.run((): RouteReview[] =>
      routeIsPublic(routeId)
        ? reviewers(routeId)
            .filter((x) => x.comment)
            .map((x) => ({
              username: K.userById(x.user_id)!.username!,
              stars: x.stars,
              scenery: x.scenery ?? null,
              surface: x.surface ?? null,
              traffic: x.traffic ?? null,
              comment: x.comment,
              updated_at: now(),
            }))
        : [],
    ),
  mine: (routeId) =>
    K.run(() => {
      const r = S().ratings.find((x) => x.route_id === routeId && x.user_id === DEMO_ME);
      return r
        ? {
            stars: r.stars,
            scenery: r.scenery ?? null,
            surface: r.surface ?? null,
            traffic: r.traffic ?? null,
            comment: r.comment,
          }
        : null;
    }),
  save: (routeId, review) =>
    K.run(() => {
      const r = S().routes.find((x) => x.id === routeId);
      if (!r || !publicRoute(r) || r.owner_id === DEMO_ME) K.refuse("saveFailed");
      const existing = S().ratings.find((x) => x.route_id === routeId && x.user_id === DEMO_ME);
      if (existing) Object.assign(existing, review);
      else S().ratings.push({ route_id: routeId, user_id: DEMO_ME, ...review });
    }),
};
