import { ODO_MAX } from "@/domain/maintenance";
import type { MaintenanceServiceApi } from "@/features/garage/maintenanceService";
import type { ChatServiceApi } from "@/features/paddock/chatService";
import type { SavesServiceApi } from "@/features/social/savesService";
import type { MaintenanceRecord, RoomType } from "@/services/supabase/database.types";
import { DEMO_ME } from "./data";
import { logRevision, recordGuard } from "./recordHooks";
import { demoKit as K } from "./services";

/** Pitch-mode twins for D-58 (migration 20261020000000_garage_and_community.sql), on sample data. */
const S = () => K.state();
const now = () => new Date().toISOString();
const myVehicle = (id: string) => S().vehicles.some((v) => v.id === id && v.owner_id === DEMO_ME && !v.deleted_at);

export const demoMaintenanceService: MaintenanceServiceApi = {
  list: (vehicleId) =>
    K.run(() =>
      S()
        .maintenance.filter(
          (r) => r.owner_id === DEMO_ME && !r.deleted_at && (!vehicleId || r.vehicle_id === vehicleId),
        )
        .sort((a, b) => b.done_on.localeCompare(a.done_on)),
    ),
  add: (vehicleId, input) =>
    K.run(() => {
      if (!myVehicle(vehicleId)) return K.refuse("buildNotFound");
      const sold = recordGuard(S(), vehicleId, null);
      if (sold) K.refuse(sold);
      if (input.next_due_odometer !== null && input.odometer !== null && input.next_due_odometer <= input.odometer)
        K.refuse("saveFailed");
      // the database's 0 to 2,000,000 check on both readings
      if ([input.odometer, input.next_due_odometer].some((o) => o !== null && (o < 0 || o > ODO_MAX)))
        K.refuse("saveFailed");
      const r: MaintenanceRecord = {
        id: K.newId(),
        owner_id: DEMO_ME,
        vehicle_id: vehicleId,
        ...input,
        currency: "USD",
        created_at: now(),
        deleted_at: null,
      };
      S().maintenance.push(r);
      return r.id;
    }),
  update: (id, input) =>
    K.run(() => {
      const r = S().maintenance.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!r) return K.refuse("buildNotFound");
      const guard = recordGuard(S(), r.vehicle_id, r.inherited_at);
      if (guard) K.refuse(guard);
      const before = { ...r };
      Object.assign(r, input);
      logRevision(S(), "maintenance", before, r);
    }),
  remove: (id) =>
    K.run(() => {
      const r = S().maintenance.find((x) => x.id === id && x.owner_id === DEMO_ME);
      const guard = r && recordGuard(S(), r.vehicle_id, r.inherited_at);
      if (guard) K.refuse(guard);
      if (r) r.deleted_at = now();
    }),
  gallery: (vehicleId) =>
    K.run(() =>
      S()
        .vehiclePhotos.filter((p) => p.vehicle_id === vehicleId && p.owner_id === DEMO_ME)
        .sort((a, b) => a.position - b.position),
    ),
  removePhoto: (photoId) =>
    K.run(() => {
      const p = S().vehiclePhotos.find((x) => x.id === photoId && x.owner_id === DEMO_ME);
      S().vehiclePhotos = S().vehiclePhotos.filter((x) => x !== p);
      // the cover goes with its photo (soft_delete_vehicle_photo)
      const v = p && S().vehicles.find((x) => x.id === p.vehicle_id && x.hero_path === p.storage_path);
      if (v) v.hero_path = null;
    }),
  setCover: (photoId) =>
    K.run(() => {
      const p = S().vehiclePhotos.find((x) => x.id === photoId && x.owner_id === DEMO_ME);
      const v = p && S().vehicles.find((x) => x.id === p.vehicle_id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!p || !v) return K.refuse("buildNotFound");
      Object.assign(v, { hero_path: p.storage_path, updated_at: now() });
    }),
  publicGallery: (vehicleId) =>
    K.run(() =>
      K.isPublicVehicle(vehicleId)
        ? S()
            .vehiclePhotos.filter((p) => p.vehicle_id === vehicleId)
            .sort((a, b) => a.position - b.position)
            .map((p) => ({ photo_id: p.id }))
        : [],
    ),
  publicGalleryUrls: (ids) =>
    K.run(() => {
      const out: Record<string, string> = {};
      for (const p of S().vehiclePhotos)
        if (ids.includes(p.id) && K.isPublicVehicle(p.vehicle_id)) out[p.id] = p.storage_path;
      return out;
    }),
};

/** In a room: an event's host or anyone who RSVP'd; a club's members. */
function inRoom(type: RoomType, id: string) {
  if (type === "event") {
    const e = S().events.find((x) => x.id === id && !x.deleted_at);
    return !!e && (e.organizer_id === DEMO_ME || S().rsvps.some((r) => r.event_id === id && r.user_id === DEMO_ME));
  }
  return S().clubMembers.some((m) => m.club_id === id && m.user_id === DEMO_ME);
}
function roomStaff(type: RoomType, id: string) {
  if (type === "event") return S().events.some((x) => x.id === id && x.organizer_id === DEMO_ME);
  const role = S().clubMembers.find((m) => m.club_id === id && m.user_id === DEMO_ME)?.role;
  return role === "owner" || role === "moderator";
}

export const demoChatService: ChatServiceApi = {
  messages: (type, roomId) =>
    K.run(() => {
      if (!inRoom(type, roomId)) return [];
      const staff = roomStaff(type, roomId);
      return S()
        .roomMessages.filter(
          (m) => m.room_type === type && m.room_id === roomId && !m.deleted_at && !K.blockedWith(m.sender_id),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-100)
        .map((m) => ({
          message_id: m.id,
          mine: m.sender_id === DEMO_ME,
          sender_username: K.userById(m.sender_id)!.username!,
          body: m.body,
          created_at: m.created_at,
          can_remove: m.sender_id === DEMO_ME || staff,
        }));
    }),
  send: (type, roomId, body) =>
    K.run(() => {
      if (!inRoom(type, roomId)) K.refuse("notInRoom");
      const text = body.trim();
      if (!text || text.length > 1000) K.refuse("saveFailed");
      S().roomMessages.push({
        id: K.newId(),
        room_type: type,
        room_id: roomId,
        sender_id: DEMO_ME,
        body: text,
        created_at: now(),
        deleted_at: null,
      });
    }),
  remove: (messageId) =>
    K.run(() => {
      const m = S().roomMessages.find((x) => x.id === messageId && !x.deleted_at);
      if (m && (m.sender_id === DEMO_ME || roomStaff(m.room_type, m.room_id))) m.deleted_at = now();
    }),
};

export const demoSavesService: SavesServiceApi = {
  list: () =>
    K.run(() =>
      S()
        .saves.filter((s) => s.user_id === DEMO_ME)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  isSaved: (kind, id) =>
    K.run(() => S().saves.some((s) => s.user_id === DEMO_ME && s.kind === kind && s.target_id === id)),
  save: (kind, id) =>
    K.run(() => {
      if (!S().saves.some((s) => s.user_id === DEMO_ME && s.kind === kind && s.target_id === id))
        S().saves.push({ user_id: DEMO_ME, kind, target_id: id, created_at: now() });
    }),
  unsave: (kind, id) =>
    K.run(() => {
      S().saves = S().saves.filter((s) => !(s.user_id === DEMO_ME && s.kind === kind && s.target_id === id));
    }),
  achievements: (username) =>
    K.run(() => {
      const u = S().users.find((x) => x.username === username && !x.deleted_at);
      if (!u || K.blockedWith(u.id)) return [];
      const publicVehicles = S()
        .vehicles.filter((v) => v.owner_id === u.id && K.isPublicVehicle(v.id))
        .map((v) => v.id);
      const done = S().mods.filter(
        (m) => publicVehicles.includes(m.vehicle_id) && m.status === "complete" && !m.deleted_at,
      ).length;
      const likes = S().likes.filter((l) =>
        S().posts.some((p) => p.id === l.post_id && p.author_id === u.id && !p.deleted_at),
      ).length;
      const earned: [string, boolean][] = [
        ["first_build", publicVehicles.length > 0],
        ["wrench_10", done >= 10],
        [
          "road_tripper",
          S().routes.filter((r) => r.owner_id === u.id && r.visibility === "public" && !r.deleted_at).length >= 3,
        ],
        [
          "host",
          S().events.some(
            (e) =>
              e.organizer_id === u.id &&
              !e.deleted_at &&
              e.status !== "cancelled" &&
              Date.parse(e.ends_at) < Date.now(),
          ),
        ],
        ["regular", S().checkins.filter((c) => c.user_id === u.id).length >= 5],
        ["club_founder", S().clubs.some((c) => c.owner_id === u.id && !c.deleted_at)],
        ["seller", S().listings.some((l) => l.seller_id === u.id && l.status === "sold")],
        [
          "shop_pro",
          S().serviceRequests.some(
            (r) =>
              r.status === "completed" && S().businesses.some((b) => b.id === r.business_id && b.owner_id === u.id),
          ),
        ],
        ["crowd_favorite", likes >= 25],
      ];
      return earned.filter(([, ok]) => ok).map(([id]) => id);
    }),
};
