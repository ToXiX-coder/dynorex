/**
 * Pitch mode: in-memory stand-ins for the Supabase-backed services, so every screen works without an
 * account or a server. They follow the same rules the database enforces (free limits, visibility,
 * blocks, mutes, Dynorex+ checks) so the demo behaves like the real app. Used only when
 * config.demoMode is on, which production builds refuse. Nothing here talks to a network.
 */
import type { ErrorKey } from "@/domain/copy/errors";
import { buildPath } from "@/domain/deepLinks";
import { GEAR_PATTERN } from "@/domain/gear";
import { fillBaseline, matchStockSpec } from "@/domain/stockSpecs";
import { estimateSpecs, deltaInBaseUnit, roundHalfAway, type SpecDeltas } from "@/domain/specs";
import type { AuthServiceApi } from "@/features/auth/authService";
import type { MappedError } from "@/features/auth/errors";
import type { BuildServiceApi } from "@/features/garage/buildService";
import type { PhotoTarget } from "@/services/media/photos";
import type { SubscriptionServiceApi } from "@/features/plus/subscriptionService";
import type { ProfileServiceApi } from "@/features/profiles/profileService";
import type { PublicBuildPage, SocialServiceApi } from "@/features/social/socialService";
import type {
  AdvancedSpecs,
  BuildRow,
  CostSummaryRow,
  FeedItem,
  ModCategory,
  ModRow,
  MySubscriptionRow,
  PublicBuild,
  SearchHit,
  UserRow,
  VehicleRow,
} from "@/services/supabase/database.types";
import { DEMO_ME, seedDemo, type DemoState } from "./data";
import { logRevision, recordGuard } from "./recordHooks";
import { emotoCurrent } from "@/domain/vehicleKind";

const PAGE = 20;
let S: DemoState = seedDemo();
const listeners = new Set<() => void>();

/** Start the pitch over with fresh sample data. */
export function resetDemo() {
  S = seedDemo();
  listeners.forEach((f) => f());
}
export function onDemoReset(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
export const demoMe = () => S.users.find((u) => u.id === DEMO_ME)!;
/** Internals shared with the Phase 7 sample services (src/demo/v2.ts). */
export const demoKit = {
  state: () => S,
  run: <T>(fn: () => T | Promise<T>) => run(fn),
  refuse: (key: ErrorKey): never => refuse(key),
  newId: () => newId(),
  userById: (id: string) => userById(id),
  blockedWith: (id: string) => blockedWith(id),
  muted: (id: string) => muted(id),
  page: <T>(xs: T[], p: number) => page(xs, p),
  isPublicVehicle: (vehicleId: string) => publicBuilds().some((b) => b.vehicle_id === vehicleId),
  /** Public builds (mirrors public_builds), for the sample services that list them. */
  publicBuilds: () => publicBuilds(),
  /** Phase 7 sample services add their own search results (routes, events, clubs) here. */
  addSearch: (f: SearchProvider) => void searchProviders.push(f),
};
type SearchProvider = (hit: (text: string) => boolean, q: string) => SearchHit[];
const searchProviders: SearchProvider[] = [];
export const demoHasPlus = () => S.subscription.plus;

// ---------------------------------------------------------------- plumbing

type Result<T> = { ok: true; data: T } | { ok: false; error: MappedError };
class DemoError {
  constructor(public key: ErrorKey) {}
}
const refuse = (key: ErrorKey): never => {
  throw new DemoError(key);
};
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
async function run<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  await wait();
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: { key: e instanceof DemoError ? e.key : "server" } };
  }
}
const now = () => new Date().toISOString();
const newId = () => `d1000000-0000-4000-8000-${(++S.seq).toString(16).padStart(12, "0")}`;
const page = <T>(xs: T[], p: number) => xs.slice(p * PAGE, p * PAGE + PAGE);

// ---------------------------------------------------------------- visibility (mirrors the public_* views)

const userById = (id: string) => S.users.find((u) => u.id === id);
const blockedWith = (other: string) =>
  S.blocks.some(
    (b) => (b.blocker_id === DEMO_ME && b.blocked_id === other) || (b.blocker_id === other && b.blocked_id === DEMO_ME),
  );
const muted = (other: string) => S.mutes.some((m) => m.muter_id === DEMO_ME && m.muted_id === other);
const vehicleOf = (b: BuildRow) => S.vehicles.find((v) => v.id === b.vehicle_id)!;
const liveMods = (vehicleId: string) =>
  S.mods
    .filter((m) => m.vehicle_id === vehicleId && !m.deleted_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

function isPublic(b: BuildRow) {
  const v = vehicleOf(b);
  const owner = userById(b.owner_id);
  return (
    !b.deleted_at &&
    b.visibility === "public" &&
    !v.deleted_at &&
    v.visibility === "public" &&
    !!owner?.username &&
    !owner.deleted_at &&
    !blockedWith(b.owner_id)
  );
}
function toPublic(b: BuildRow): PublicBuild {
  const v = vehicleOf(b);
  const mods = liveMods(v.id);
  return {
    build_id: b.id,
    vehicle_id: v.id,
    owner_username: userById(b.owner_id)!.username!,
    title: b.title,
    description: b.description,
    updated_at: b.updated_at,
    year: v.year,
    make: v.make,
    model: v.model,
    trim_level: v.trim_level,
    nickname: v.nickname,
    has_hero: !!v.hero_path,
    followers_count: S.buildFollows.filter((f) => f.build_id === b.id).length,
    mods_count: mods.length,
    last_activity_at: [b.updated_at, mods[0]?.created_at].filter(Boolean).sort().pop() ?? null,
    kind: v.kind ?? "car",
    motor_w: v.motor_w ?? null,
    battery_wh: v.battery_wh ?? null,
    range_mi: v.range_mi ?? null,
    top_speed_mph: v.top_speed_mph ?? null,
    engine_cc: v.engine_cc ?? null,
    ebike_class: v.ebike_class ?? null,
    battery_v: v.battery_v ?? null,
    street_legal: v.street_legal ?? null,
    // D-74: same rule as the view (moderation-hidden mods don't count)
    ...(v.kind === "ebike"
      ? emotoCurrent(mods.filter((m) => !m.hidden_at))
      : { mod_motor_w: null, mod_battery_v: null, mod_battery_wh: null }),
  };
}
const publicBuilds = () => S.builds.filter(isPublic).map(toPublic);
const toPublicMod = (m: ModRow) => {
  const b = S.builds.find((x) => x.vehicle_id === m.vehicle_id)!;
  return {
    mod_id: m.id,
    vehicle_id: m.vehicle_id,
    build_id: b.id,
    name: m.name,
    category: m.category,
    brand: m.brand,
    part_number: m.part_number,
    status: m.status,
    installed_on: m.installed_on,
    created_at: m.created_at,
  };
};
function publicProfile(u: UserRow) {
  return {
    user_id: u.id,
    username: u.username!,
    display_name: u.display_name,
    bio: u.bio,
    general_location: u.general_location,
    years_experience: u.years_experience,
    build_goal: u.build_goal,
    reputation: u.reputation,
    business_badge: u.business_badge,
    followers_count: S.follows.filter((f) => f.followee_id === u.id).length,
    following_count: S.follows.filter((f) => f.follower_id === u.id).length,
    plus_member: u.id === DEMO_ME ? S.subscription.plus : S.plusUsers.has(u.id),
    driver_gear: u.driver_gear ?? null,
  };
}
const visibleUser = (u: UserRow | undefined) => !!u && !!u.username && !u.deleted_at && !blockedWith(u.id);

// ---------------------------------------------------------------- garage (buildService)

const mine = (v: VehicleRow | undefined) => (v && v.owner_id === DEMO_ME && !v.deleted_at ? v : undefined);
function setVisibility(vehicleId: string, pub: boolean) {
  const v = mine(S.vehicles.find((x) => x.id === vehicleId)) ?? refuse("buildNotFound");
  v.visibility = pub ? "public" : "private";
  let b = S.builds.find((x) => x.vehicle_id === vehicleId && !x.deleted_at);
  if (!b && pub) {
    b = {
      id: newId(),
      owner_id: DEMO_ME,
      vehicle_id: vehicleId,
      title: (v.nickname || `${v.year} ${v.make} ${v.model}`).slice(0, 80),
      description: null,
      visibility: "public",
      featured: false,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    };
    S.builds.push(b);
  }
  if (b) b.visibility = v.visibility;
  return b?.id ?? "";
}
/** Same rule as the database trigger: blank stock numbers fill from factory specs, typed ones are the owner's. */
const withBaseline = (i: Parameters<typeof fillBaseline>[0] & { kind?: string }) => {
  // D-71: like the database, the factory table only fills cars; a motorcycle or e-bike keeps what was typed
  if (i.kind && i.kind !== "car") {
    const typed = [i.baseline_hp, i.baseline_torque_lbft, i.baseline_weight_lb, i.baseline_zero_to_sixty_s].some(
      (x) => x != null,
    );
    return {
      baseline_source: typed ? ("user_reported" as const) : null,
      baseline_looked_up: [] as string[],
      baseline_lookup_label: null,
    };
  }
  const f = fillBaseline(i);
  return {
    ...f.values,
    baseline_source: f.baseline_source,
    baseline_looked_up: f.baseline_looked_up,
    baseline_lookup_label: f.baseline_lookup_label,
  };
};

/** Mirrors the odometer triggers (D-61, D-68): a reading in miles moves the car's odometer up, never down. */
function bumpOdometer(vehicleId: string, reading: number | null | undefined) {
  const v = S.vehicles.find((x) => x.id === vehicleId && !x.deleted_at && !x.sold_at);
  if (!v || reading == null || v.odometer_unit !== "mi") return;
  if (v.odometer === null || Number(v.odometer) < reading) v.odometer = reading;
}

export const demoBuildService: BuildServiceApi = {
  listVehicles: (p = 0) =>
    run(() =>
      page(
        S.vehicles
          .filter((v) => mine(v))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((v) => ({
            id: v.id,
            year: v.year,
            make: v.make,
            model: v.model,
            trim_level: v.trim_level,
            nickname: v.nickname,
            hero_path: v.hero_path,
            visibility: v.visibility,
            baseline_hp: v.baseline_hp,
            baseline_looked_up: v.baseline_looked_up,
            updated_at: v.updated_at,
            sold_at: v.sold_at ?? null,
            kind: v.kind ?? "car",
            motor_w: v.motor_w ?? null,
          })),
        p,
      ),
    ),
  lookupStockSpecs: (car) =>
    run(() => {
      const s = matchStockSpec(car);
      return s
        ? {
            label: `${s.from === s.to ? s.from : `${s.from}–${s.to}`} ${s.label}`,
            hp: s.hp,
            torque_lbft: s.torque_lbft,
            weight_lb: s.weight_lb,
            zero_to_sixty_s: s.zero_to_sixty_s,
          }
        : null;
    }),
  getVehicle: (id) => run(() => mine(S.vehicles.find((v) => v.id === id)) ?? null),
  createVehicle: (input, clientRef) =>
    run(() => {
      const dup = S.vehicles.find((v) => v.client_ref === clientRef && v.owner_id === DEMO_ME);
      if (dup) return dup.id;
      if (!S.subscription.plus && S.vehicles.filter((v) => mine(v) && !v.sold_at).length >= 2)
        refuse("planLimitVehicles");
      const v: VehicleRow = {
        id: newId(),
        owner_id: DEMO_ME,
        hero_path: null,
        ...input,
        ...withBaseline(input),
        visibility: "private",
        client_ref: clientRef,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        hidden_at: null,
      } as VehicleRow;
      S.vehicles.push(v);
      if (input.visibility === "public") setVisibility(v.id, true);
      return v.id;
    }),
  updateVehicle: (id, input) =>
    run(() => {
      const v = mine(S.vehicles.find((x) => x.id === id)) ?? refuse("buildNotFound");
      // D-64: a buyer's link or transfer code locks the VIN; a sold car's details are read-only
      if (v.vin_locked_at && (input.vin ?? null) !== (v.vin ?? null)) refuse("vinLocked");
      if (v.sold_at && ([input.year, input.make, input.model] as unknown[]).join() !== [v.year, v.make, v.model].join())
        refuse("vehicleSold");
      Object.assign(v, input, withBaseline(input), { updated_at: now() });
      setVisibility(id, input.visibility === "public");
    }),
  setOdometer: (id, odometer) =>
    run(() => {
      const v = mine(S.vehicles.find((x) => x.id === id)) ?? refuse("buildNotFound");
      if (v.sold_at) refuse("vehicleSold");
      if (odometer < 0 || odometer > 2_000_000) refuse("saveFailed");
      Object.assign(v, { odometer, updated_at: now() });
    }),
  setBudget: (id, budget) =>
    run(() => {
      const v = mine(S.vehicles.find((x) => x.id === id)) ?? refuse("buildNotFound");
      Object.assign(v, { budget_minor: budget?.minor ?? null, budget_currency: budget?.currency ?? null });
    }),
  deleteVehicle: (id) =>
    run(() => {
      const v = mine(S.vehicles.find((x) => x.id === id)) ?? refuse("buildNotFound");
      const t = now();
      v.deleted_at = t;
      S.builds.filter((b) => b.vehicle_id === id).forEach((b) => (b.deleted_at = t));
      S.mods.filter((m) => m.vehicle_id === id).forEach((m) => (m.deleted_at = t));
    }),
  specEstimate: (vehicleId) =>
    run(() => {
      const v = mine(S.vehicles.find((x) => x.id === vehicleId));
      if (!v) return null;
      return estimateSpecs(v, liveMods(vehicleId) as never) as never;
    }),
  costSummary: (vehicleId) =>
    run(() => {
      const rows = new Map<string, CostSummaryRow>();
      for (const m of liveMods(vehicleId)) {
        if (m.cost_minor === null || !m.currency) continue;
        const k = `${m.currency}|${m.category}`;
        const r = rows.get(k) ?? {
          currency: m.currency,
          category: m.category,
          spent_minor: 0,
          planned_minor: 0,
          mods: 0,
        };
        if (m.status === "planned") r.planned_minor += m.cost_minor;
        else r.spent_minor += m.cost_minor;
        r.mods += 1;
        rows.set(k, r);
      }
      return [...rows.values()];
    }),
  myPlan: () =>
    run(() =>
      S.subscription.plus
        ? { plus: true, vehicle_limit: null, mods_per_vehicle_limit: null }
        : { plus: false, vehicle_limit: 2, mods_per_vehicle_limit: 20 },
    ),
  listMods: (vehicleId, p = 0) =>
    run(() => (mine(S.vehicles.find((v) => v.id === vehicleId)) ? page(liveMods(vehicleId), p) : [])),
  getMod: (id) => run(() => S.mods.find((m) => m.id === id && m.owner_id === DEMO_ME && !m.deleted_at) ?? null),
  modPhotos: (modId) =>
    run(() => S.photos.filter((p) => p.mod_id === modId && !p.deleted_at).sort((a, b) => a.position - b.position)),
  createMod: (vehicleId, input, deltas, clientRef) =>
    run(() => {
      mine(S.vehicles.find((v) => v.id === vehicleId)) ?? refuse("buildNotFound");
      const dup = S.mods.find((m) => m.client_ref === clientRef);
      if (dup) return dup.id;
      const guard = recordGuard(S, vehicleId, null);
      if (guard) refuse(guard);
      if (!S.subscription.plus && liveMods(vehicleId).filter((m) => !m.inherited_at).length >= 20)
        refuse("planLimitMods");
      const m = {
        id: newId(),
        owner_id: DEMO_ME,
        vehicle_id: vehicleId,
        ...input,
        spec_deltas: deltas,
        client_ref: clientRef,
        status_changed_at: now(),
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        hidden_at: null,
      } as ModRow;
      S.mods.push(m);
      bumpOdometer(vehicleId, m.installed_odometer);
      return m.id;
    }),
  updateMod: (id, input, deltas) =>
    run(() => {
      const m = S.mods.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at) ?? refuse("buildNotFound");
      const guard = recordGuard(S, m.vehicle_id, m.inherited_at);
      if (guard) refuse(guard);
      const before = { ...m };
      if (m.status !== input.status) m.status_changed_at = now();
      Object.assign(m, input, { spec_deltas: deltas, updated_at: now() });
      logRevision(S, "mod", before, m);
      bumpOdometer(m.vehicle_id, m.installed_odometer);
    }),
  setModStatus: (id, status) =>
    run(() => {
      const m = S.mods.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at) ?? refuse("buildNotFound");
      const guard = recordGuard(S, m.vehicle_id, m.inherited_at);
      if (guard) refuse(guard);
      const before = { ...m };
      m.status = status;
      m.status_changed_at = now();
      if (status === "complete" && !m.installed_on) m.installed_on = now().slice(0, 10);
      logRevision(S, "mod", before, m);
    }),
  deleteMod: (id) =>
    run(() => {
      const m = S.mods.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at) ?? refuse("buildNotFound");
      const guard = recordGuard(S, m.vehicle_id, m.inherited_at);
      if (guard) refuse(guard);
      m.deleted_at = now();
    }),
  deletePhoto: (id) =>
    run(() => {
      const p = S.photos.find((x) => x.id === id);
      if (p) p.deleted_at = now();
    }),
  listWishlist: () => run(() => S.wishlist.filter((w) => !w.deleted_at)),
  addWishlist: (item) =>
    run(() => {
      S.wishlist.unshift({
        id: newId(),
        owner_id: DEMO_ME,
        is_affiliate: false,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        ...item,
      });
    }),
  deleteWishlist: (id) =>
    run(() => {
      const w = S.wishlist.find((x) => x.id === id);
      if (w) w.deleted_at = now();
    }),
};

// ---------------------------------------------------------------- photos (local files only)

/** Mirrors can_add_event_photo(): host, going or checked in; an hour before the start to a week after the end. */
export function demoCanAddEventPhoto(eventId: string) {
  const e = S.events.find((x) => x.id === eventId && !x.deleted_at && x.status !== "cancelled");
  if (!e) return false;
  const t = Date.now();
  const open = Date.parse(e.starts_at) - 3_600_000;
  const close = Date.parse(e.ends_at) + 7 * 86_400_000;
  return (
    t >= open &&
    t <= close &&
    (e.organizer_id === DEMO_ME ||
      S.rsvps.some((r) => r.event_id === eventId && r.user_id === DEMO_ME && r.status === "going") ||
      S.checkins.some((c) => c.event_id === eventId && c.user_id === DEMO_ME))
  );
}

/** registerPhoto() in pitch mode: null when accepted, otherwise why not (like the server's answer). */
export function demoRegisterPhotoResult(body: PhotoTarget & { path: string }): ErrorKey | null {
  try {
    demoRegisterPhoto(body);
    return null;
  } catch (e) {
    return e instanceof DemoError ? e.key : "server";
  }
}

/** In pitch mode a "storage path" is just the local file URI; nothing is uploaded. */
export function demoRegisterPhoto(body: PhotoTarget & { path: string }) {
  // D-61: a receipt on your own mod or maintenance record (4 each), or a photo in a meet's album
  if (body.kind === "receipt") {
    const item = body.modId ?? body.maintenanceId;
    const mine = S.vehicles.some((v) => v.id === body.vehicleId && v.owner_id === DEMO_ME && !v.deleted_at);
    const count = S.receipts.filter((r) => (r.mod_id ?? r.maintenance_id) === item).length;
    if (!mine || !item || count >= 4) refuse("photoRejected");
    S.receipts.push({
      id: newId(),
      owner_id: DEMO_ME,
      vehicle_id: body.vehicleId,
      mod_id: body.modId ?? null,
      maintenance_id: body.maintenanceId ?? null,
      storage_path: body.path,
      width: null,
      height: null,
      created_at: now(),
    });
    return;
  }
  if (body.kind === "dyno") {
    const r = S.dynoResults.find((x) => x.id === body.resultId && x.owner_id === DEMO_ME);
    if (!r) refuse("buildNotFound");
    r!.sheet_path = body.path;
    return;
  }
  if (body.kind === "event") {
    if (!demoCanAddEventPhoto(body.eventId)) refuse("eventPhotoClosed");
    S.eventPhotos.push({
      id: newId(),
      event_id: body.eventId,
      owner_id: DEMO_ME,
      storage_path: body.path,
      created_at: now(),
      deleted_at: null,
    });
    return;
  }
  if (body.kind === "gallery") {
    const mine = S.vehicles.some((v) => v.id === body.vehicleId && v.owner_id === DEMO_ME && !v.deleted_at);
    const count = S.vehiclePhotos.filter((p) => p.vehicle_id === body.vehicleId).length;
    if (mine && count < 24)
      S.vehiclePhotos.push({
        id: newId(),
        owner_id: DEMO_ME,
        vehicle_id: body.vehicleId,
        storage_path: body.path,
        position: count,
        width: null,
        height: null,
        created_at: now(),
      });
    return;
  }
  if (body.kind === "listing") {
    const l = S.listings.find((x) => x.id === body.listingId && x.seller_id === DEMO_ME && !x.deleted_at);
    if (l) l.photo_path = body.path;
    return;
  }
  if (body.kind === "hero") {
    const v = S.vehicles.find((x) => x.id === body.vehicleId);
    if (v) v.hero_path = body.path;
    return;
  }
  const count = S.photos.filter((p) => p.mod_id === body.modId && !p.deleted_at).length;
  S.photos.push({
    id: newId(),
    owner_id: DEMO_ME,
    mod_id: body.modId,
    storage_path: body.path,
    role: body.role,
    position: count,
    mime: "image/jpeg",
    bytes: 1,
    width: null,
    height: null,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
  });
}

// ---------------------------------------------------------------- social

const feedFor = (p: number): FeedItem[] => {
  const followedBuilds = new Set(S.buildFollows.filter((f) => f.user_id === DEMO_ME).map((f) => f.build_id));
  const followedUsers = new Set(S.follows.filter((f) => f.follower_id === DEMO_ME).map((f) => f.followee_id));
  const items = S.builds
    .filter((b) => isPublic(b) && (followedBuilds.has(b.id) || followedUsers.has(b.owner_id)) && !muted(b.owner_id))
    .flatMap((b) =>
      liveMods(b.vehicle_id).map((m) => ({
        mod_id: m.id,
        vehicle_id: m.vehicle_id,
        build_title: b.title,
        owner_username: userById(b.owner_id)!.username!,
        mod_name: m.name,
        category: m.category,
        status: m.status,
        created_at: m.created_at,
      })),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return page(items, p);
};

export const demoSocialService: SocialServiceApi = {
  publicBuild: (vehicleId, p = 0) =>
    run<PublicBuildPage>(() => {
      const b = S.builds.find((x) => x.vehicle_id === vehicleId);
      if (!b || !isPublic(b)) {
        const v = S.vehicles.find((x) => x.id === vehicleId);
        return { status: v?.deleted_at && v.visibility === "public" ? "gone" : "not_found" };
      }
      const v = vehicleOf(b);
      const e = estimateSpecs(v, liveMods(v.id) as never);
      return {
        status: "public",
        build: toPublic(b),
        specs: {
          hp: e.hp,
          hp_status: e.hp_status,
          torque_lbft: e.torque_lbft,
          torque_status: e.torque_status,
          weight_lb: e.weight_lb,
          weight_status: e.weight_status,
          zero_to_sixty_s: e.zero_to_sixty_s,
          zero_to_sixty_status: e.zero_to_sixty_status,
          lb_per_hp: e.lb_per_hp,
          lb_per_hp_status: e.lb_per_hp_status,
          completed_mods_counted: e.completed_mods_counted,
        },
        mods: page(liveMods(v.id), p).map(toPublicMod),
      };
    }),
  publicMods: (vehicleId, p) =>
    run(() => {
      const b = S.builds.find((x) => x.vehicle_id === vehicleId);
      return b && isPublic(b) ? page(liveMods(vehicleId), p).map(toPublicMod) : [];
    }),
  publicMod: (vehicleId, modId) =>
    run(() => {
      const b = S.builds.find((x) => x.vehicle_id === vehicleId);
      const m = liveMods(vehicleId).find((x) => x.id === modId);
      if (!b || !isPublic(b) || !m) return null;
      const photos = S.photos
        .filter((p) => p.mod_id === modId && !p.deleted_at)
        .map((p) => ({
          photo_id: p.id,
          mod_id: p.mod_id,
          vehicle_id: vehicleId,
          role: p.role,
          position: p.position,
          width: p.width,
          height: p.height,
        }));
      return { mod: toPublicMod(m), photos };
    }),
  publicBuildsBy: (username) =>
    run(() =>
      publicBuilds()
        .filter((b) => b.owner_username === username)
        .sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "")),
    ),
  publicMedia: ({ heroes = [], photos = [] }) =>
    run(() => {
      const out = { heroes: {} as Record<string, string>, photos: {} as Record<string, string> };
      for (const id of heroes) {
        const v = S.vehicles.find((x) => x.id === id);
        const b = S.builds.find((x) => x.vehicle_id === id);
        if (v?.hero_path && b && isPublic(b)) out.heroes[id] = v.hero_path;
      }
      for (const id of photos) {
        const p = S.photos.find((x) => x.id === id && !x.deleted_at);
        if (p) out.photos[id] = p.storage_path;
      }
      return out;
    }),
  setBuildPublic: (vehicleId, makePublic) => run(() => setVisibility(vehicleId, makePublic)),
  shareLink: (vehicleId) =>
    run(() => {
      const b = S.builds.find((x) => x.vehicle_id === vehicleId);
      if (!b || !isPublic(b)) refuse("notShareable");
      return buildPath(vehicleId);
    }),
  isFollowingBuild: (buildId) => run(() => S.buildFollows.some((f) => f.user_id === DEMO_ME && f.build_id === buildId)),
  followBuild: (buildId) =>
    run(() => {
      const b = S.builds.find((x) => x.id === buildId);
      if (!b || !isPublic(b) || b.owner_id === DEMO_ME) refuse("saveFailed");
      if (!S.buildFollows.some((f) => f.user_id === DEMO_ME && f.build_id === buildId))
        S.buildFollows.push({ user_id: DEMO_ME, build_id: buildId, created_at: now() });
    }),
  unfollowBuild: (buildId) =>
    run(() => {
      S.buildFollows = S.buildFollows.filter((f) => !(f.user_id === DEMO_ME && f.build_id === buildId));
    }),
  isFollowingUser: (userId) => run(() => S.follows.some((f) => f.follower_id === DEMO_ME && f.followee_id === userId)),
  followUser: (userId) =>
    run(() => {
      if (userId === DEMO_ME || blockedWith(userId)) refuse("saveFailed");
      if (!S.follows.some((f) => f.follower_id === DEMO_ME && f.followee_id === userId))
        S.follows.push({ follower_id: DEMO_ME, followee_id: userId, created_at: now() });
    }),
  unfollowUser: (userId) =>
    run(() => {
      S.follows = S.follows.filter((f) => !(f.follower_id === DEMO_ME && f.followee_id === userId));
    }),
  myConnections: (which) =>
    run(() => {
      const ids =
        which === "following"
          ? S.follows.filter((f) => f.follower_id === DEMO_ME).map((f) => f.followee_id)
          : S.follows.filter((f) => f.followee_id === DEMO_ME).map((f) => f.follower_id);
      return ids
        .map(userById)
        .filter(visibleUser)
        .map((u) => publicProfile(u!));
    }),
  discover: (mode, p = 0) =>
    run(() => {
      const me = demoMe();
      const owners = new Map(S.users.map((u) => [u.username, u]));
      const score = (b: PublicBuild) =>
        3 *
          S.buildFollows.filter(
            (f) => f.build_id === b.build_id && Date.parse(f.created_at) > Date.now() - 7 * 86_400_000,
          ).length +
        liveMods(b.vehicle_id).filter((m) => Date.parse(m.created_at) > Date.now() - 14 * 86_400_000).length +
        0.25 * b.followers_count;
      const list = publicBuilds().filter((b) => {
        const o = owners.get(b.owner_username)!;
        return o.id !== DEMO_ME && !muted(o.id);
      });
      list.sort((a, b) => {
        if (mode === "for_you") {
          const ga = owners.get(a.owner_username)!.build_goal === me.build_goal ? 0 : 1;
          const gb = owners.get(b.owner_username)!.build_goal === me.build_goal ? 0 : 1;
          if (ga !== gb) return ga - gb;
        }
        if (mode !== "new") {
          const d = score(b) - score(a);
          if (d !== 0) return d;
        }
        return (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "");
      });
      return page(list, p);
    }),
  nearby: (p = 0) =>
    run(() => {
      if (!S.region) return [];
      // sample: three owners who opted in around the same rough area (no distances, no locations)
      const near = new Set(["trail_ready", "low_and_slow", "commuter_club"]);
      return page(
        publicBuilds().filter((b) => near.has(b.owner_username)),
        p,
      );
    }),
  myRegion: () => run(() => (S.region ? { enabled: true, share_builds: S.region.share_builds } : null)),
  setRegion: (_cell, shareBuilds) =>
    run(() => {
      S.region = { share_builds: shareBuilds };
    }),
  clearRegion: () =>
    run(() => {
      S.region = null;
    }),
  buildKinds: (vehicleIds) =>
    run(() =>
      Object.fromEntries(
        publicBuilds()
          .filter((b) => vehicleIds.includes(b.vehicle_id))
          .map((b) => [b.vehicle_id, b.kind ?? "car"]),
      ),
    ),
  search: (query) =>
    run(() => {
      const words = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 5);
      const q = words.join(" ");
      if (q.length < 2) return [];
      const hit = (text: string) => {
        const toks = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        return words.every((w) => toks.some((t) => t.startsWith(w)));
      };
      const hits: SearchHit[] = [];
      for (const b of publicBuilds()) {
        const o = S.users.find((u) => u.username === b.owner_username)!;
        if (muted(o.id) || !hit(`${b.title} ${b.make} ${b.model} ${b.year} ${b.owner_username}`)) continue;
        const exact = [b.make, b.model, b.title, `${b.make} ${b.model}`, String(b.year), b.owner_username].some(
          (x) => x.toLowerCase() === q,
        );
        hits.push({
          kind: "build",
          id: b.build_id,
          vehicle_id: b.vehicle_id,
          label: b.title,
          sublabel: `${b.year} ${b.make} ${b.model} · @${b.owner_username}`,
          has_hero: b.has_hero,
          exact,
          followers: b.followers_count,
          updated_at: b.last_activity_at,
        });
      }
      for (const u of S.users.filter(visibleUser)) {
        if (muted(u.id) || !hit(`${u.username} ${u.display_name ?? ""}`)) continue;
        const pp = publicProfile(u);
        hits.push({
          kind: "user",
          id: u.id,
          vehicle_id: null,
          label: `@${u.username}`,
          sublabel: u.display_name ?? "",
          has_hero: false,
          exact: u.username === q,
          followers: pp.followers_count,
          updated_at: null,
        });
      }
      for (const b of publicBuilds()) {
        for (const m of liveMods(b.vehicle_id)) {
          if (!hit(`${m.name} ${m.brand ?? ""} ${m.part_number ?? ""}`)) continue;
          hits.push({
            kind: "mod",
            id: m.id,
            vehicle_id: b.vehicle_id,
            label: m.name,
            sublabel: `${b.title} · @${b.owner_username}`,
            has_hero: b.has_hero,
            exact: m.name.toLowerCase() === q,
            followers: b.followers_count,
            updated_at: m.created_at,
          });
        }
      }
      const rank = (a: SearchHit, b: SearchHit) =>
        Number(b.exact) - Number(a.exact) ||
        b.followers - a.followers ||
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      for (const provide of searchProviders) hits.push(...provide(hit, q));
      return (["build", "user", "mod", "route", "event", "club"] as const).flatMap((k) =>
        hits
          .filter((h) => h.kind === k)
          .sort(rank)
          .slice(0, 10),
      );
    }),
  homeFeed: (p = 0) => run(() => feedFor(p)),
  buildOfTheWeek: () =>
    run(() => {
      const pick = publicBuilds().find((b) => b.owner_username === "big_block_shop");
      if (!pick) return null;
      const monday = new Date();
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return {
        week_start: monday.toISOString().slice(0, 10),
        build_id: pick.build_id,
        vehicle_id: pick.vehicle_id,
        owner_username: pick.owner_username,
        title: pick.title,
        year: pick.year,
        make: pick.make,
        model: pick.model,
        has_hero: pick.has_hero,
      };
    }),
  notifications: (p = 0) =>
    run(() =>
      page(
        S.notifications
          .filter((n) => n.recipient_id === DEMO_ME && !(n.actor_id && blockedWith(n.actor_id)))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        p,
      ),
    ),
  unreadCount: () => run(() => S.notifications.filter((n) => n.recipient_id === DEMO_ME && !n.read_at).length),
  markRead: (id) =>
    run(() => {
      const n = S.notifications.find((x) => x.id === id);
      if (n) n.read_at = now();
    }),
  markAllRead: () =>
    run(() => {
      const unread = S.notifications.filter((n) => n.recipient_id === DEMO_ME && !n.read_at);
      unread.forEach((n) => (n.read_at = now()));
      return unread.length;
    }),
  prefs: () => run(() => S.prefs),
  setPref: (category, enabled) =>
    run(() => {
      S.prefs = [
        ...S.prefs.filter((p) => p.category !== category),
        { user_id: DEMO_ME, category, enabled, updated_at: now() },
      ];
      return enabled;
    }),
};

// ---------------------------------------------------------------- profiles

export const demoProfileService: ProfileServiceApi = {
  // a fresh copy, like the server sends: handing back the same object would hide every edit from React
  getMine: () => run(() => ({ ...demoMe() })),
  usernameAvailable: (username) => run(() => !S.users.some((u) => u.username === username)),
  setUsername: (username) =>
    run(() => {
      if (S.users.some((u) => u.username === username && u.id !== DEMO_ME)) refuse("usernameTaken");
      demoMe().username = username;
    }),
  updateProfile: (input) => run(() => Object.assign(demoMe(), input, { updated_at: now() })),
  updateDriver: (input) =>
    run(() => {
      if (input.driver_gear !== null && !new RegExp(GEAR_PATTERN).test(input.driver_gear)) refuse("saveFailed");
      return Object.assign(demoMe(), input, { updated_at: now() });
    }),
  setDefaultVisibility: (visibility) =>
    run(() => {
      demoMe().default_visibility = visibility;
    }),
  setOnboardingStep: (step) =>
    run(() => {
      demoMe().onboarding_step = step;
    }),
  completeOnboarding: (goal) =>
    run(() => {
      Object.assign(demoMe(), { build_goal: goal, onboarding_step: 3, onboarding_completed_at: now() });
    }),
  skipOnboarding: (atStep) =>
    run(() => {
      Object.assign(demoMe(), { onboarding_step: atStep, onboarding_skipped_at: now() });
    }),
  addFirstVehicle: (v) =>
    run(async () => {
      const r = await demoBuildService.createVehicle(
        { year: v.year, make: v.make, model: v.model, nickname: v.nickname ?? null, visibility: "private" } as never,
        newId(),
      );
      if (!r.ok) refuse(r.error.key);
    }),
  getPublic: (username) =>
    run(() => {
      const u = S.users.find((x) => x.username === username.toLowerCase());
      return visibleUser(u) ? publicProfile(u!) : null;
    }),
  myFollowCounts: () =>
    run(() => ({
      followers: S.follows.filter((f) => f.followee_id === DEMO_ME).length,
      following: S.follows.filter((f) => f.follower_id === DEMO_ME).length,
    })),
  block: (userId) =>
    run(() => {
      if (userId === DEMO_ME) refuse("saveFailed");
      S.blocks.push({ blocker_id: DEMO_ME, blocked_id: userId, created_at: now() });
      S.follows = S.follows.filter(
        (f) =>
          !(
            (f.follower_id === DEMO_ME && f.followee_id === userId) ||
            (f.follower_id === userId && f.followee_id === DEMO_ME)
          ),
      );
      const theirBuilds = new Set(S.builds.filter((b) => b.owner_id === userId).map((b) => b.id));
      const myBuilds = new Set(S.builds.filter((b) => b.owner_id === DEMO_ME).map((b) => b.id));
      S.buildFollows = S.buildFollows.filter(
        (f) =>
          !(
            (f.user_id === DEMO_ME && theirBuilds.has(f.build_id)) ||
            (f.user_id === userId && myBuilds.has(f.build_id))
          ),
      );
    }),
  unblock: (userId) =>
    run(() => {
      S.blocks = S.blocks.filter((b) => !(b.blocker_id === DEMO_ME && b.blocked_id === userId));
    }),
  listBlocked: () =>
    run(() =>
      S.blocks
        .filter((b) => b.blocker_id === DEMO_ME)
        .map((b) => ({ blocked_id: b.blocked_id, created_at: b.created_at })),
    ),
  mute: (userId) =>
    run(() => {
      S.mutes.push({ muter_id: DEMO_ME, muted_id: userId, created_at: now() });
    }),
  unmute: (userId) =>
    run(() => {
      S.mutes = S.mutes.filter((m) => !(m.muter_id === DEMO_ME && m.muted_id === userId));
    }),
  report: () => run(() => undefined),
};

// ---------------------------------------------------------------- account actions are off

const off = () => run<never>(() => refuse("demoOnly"));
export const demoAuthService: AuthServiceApi = {
  signUpWithEmail: off,
  signInWithEmail: off,
  resendVerification: off,
  requestPasswordReset: off,
  exchangeCode: off,
  updatePassword: off,
  refresh: off,
  signOut: off,
  appleAvailable: async () => false,
  signInWithApple: off,
  signInWithGoogle: off,
  deleteAccount: off,
  /** Exports the sample data so the export flow can be shown; clearly marked as pitch data. */
  exportData: () =>
    run(() => ({
      pitch_mode_sample_data: true,
      exported_at: now(),
      profile: demoMe(),
      vehicles: S.vehicles.filter((v) => v.owner_id === DEMO_ME),
      mods: S.mods.filter((m) => m.owner_id === DEMO_ME),
      wishlist: S.wishlist,
    })),
};

// ---------------------------------------------------------------- Dynorex+

const capabilities = () => {
  const plus = S.subscription.plus;
  return {
    plus,
    vehicle_limit: plus ? null : 2,
    mods_per_vehicle_limit: plus ? null : 20,
    route_recordings_per_month: plus ? null : 5,
    advanced_specs: plus,
    build_analytics: plus,
    priority_listings: plus,
    torq_stickers: plus,
    profile_badge: plus,
    early_access: plus,
  };
};

/** Pitch-mode "purchase": no store, no money. Turns Dynorex+ on in the sample data. */
export function demoActivatePlus(plan: "monthly" | "annual", platform: "app_store" | "play_store") {
  const days = plan === "annual" ? 365 : 30;
  S.subscription = {
    plus: true,
    status: "active",
    product_id: plan === "annual" ? "dynorex_plus_annual" : "dynorex_plus_monthly",
    platform,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    grace_until: null,
    will_renew: true,
    via_override: false,
  } satisfies MySubscriptionRow;
}

export const demoSubscriptionService: SubscriptionServiceApi = {
  mySubscription: () => run(() => S.subscription),
  capabilities: () => run(capabilities),
  sync: () => run(() => S.subscription),
  advancedSpecs: (vehicleId) =>
    run<AdvancedSpecs>(() => {
      if (!S.subscription.plus) refuse("paywall");
      const v = mine(S.vehicles.find((x) => x.id === vehicleId)) ?? refuse("buildNotFound");
      const mods = liveMods(vehicleId);
      const all = mods.map((m) => m.spec_deltas as SpecDeltas);
      const sum = (f: "hp" | "torque" | "weight" | "zero_to_sixty") =>
        all.reduce((a, d) => a + deltaInBaseUnit(d, f), 0);
      const hp = v.baseline_hp === null ? null : Number(v.baseline_hp) + sum("hp");
      const tq = v.baseline_torque_lbft === null ? null : Number(v.baseline_torque_lbft) + sum("torque");
      const wt = v.baseline_weight_lb === null ? null : Number(v.baseline_weight_lb) + sum("weight");
      const zs = v.baseline_zero_to_sixty_s === null ? null : Number(v.baseline_zero_to_sixty_s) + sum("zero_to_sixty");
      const okHp = hp !== null && hp > 0 && hp < 5000;
      const okWt = wt !== null && wt > 100 && wt < 20000;
      const cats = new Map<ModCategory, { hp: number; torque_lbft: number; weight_lb: number; mods: number }>();
      for (const m of mods.filter((x) => x.status === "complete")) {
        const d = m.spec_deltas as SpecDeltas;
        const c = cats.get(m.category) ?? { hp: 0, torque_lbft: 0, weight_lb: 0, mods: 0 };
        c.hp += deltaInBaseUnit(d, "hp");
        c.torque_lbft += deltaInBaseUnit(d, "torque");
        c.weight_lb += deltaInBaseUnit(d, "weight");
        c.mods += 1;
        cats.set(m.category, c);
      }
      return {
        projected: {
          hp: okHp ? roundHalfAway(hp!) : null,
          torque_lbft: tq !== null && tq > 0 && tq < 5000 ? roundHalfAway(tq) : null,
          weight_lb: okWt ? roundHalfAway(wt!) : null,
          zero_to_sixty_s: zs !== null && zs > 0 && zs < 60 ? roundHalfAway(zs, 1) : null,
          lb_per_hp: okHp && okWt ? roundHalfAway(wt! / hp!, 1) : null,
        },
        by_category: [...cats.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, c]) => ({
            category,
            hp: roundHalfAway(c.hp, 1),
            torque_lbft: roundHalfAway(c.torque_lbft, 1),
            weight_lb: roundHalfAway(c.weight_lb, 1),
            mods: c.mods,
          })),
        pending_mods: mods.filter((m) => m.status !== "complete").length,
      };
    }),
  analytics: (vehicleId) =>
    run(() => {
      if (!S.subscription.plus) refuse("paywall");
      const b = S.builds.find((x) => x.vehicle_id === vehicleId && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!b) refuse("buildNotFound");
      const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const follows = S.buildFollows.filter((f) => f.build_id === b!.id);
      const recent = (days: number) =>
        follows.filter((f) => Date.parse(f.created_at) > Date.now() - days * 86_400_000).length;
      return {
        views_7d: S.views.filter((v) => v.build_id === b!.id && v.day > since(7)).length,
        views_30d: S.views.filter((v) => v.build_id === b!.id && v.day > since(30)).length,
        followers: follows.length,
        new_followers_7d: recent(7),
        new_followers_30d: recent(30),
        reactions: S.reactions.filter((r) => r.build_id === b!.id).length,
      };
    }),
  reactions: (buildId) =>
    run(() => {
      const b = S.builds.find((x) => x.id === buildId);
      if (!b || !isPublic(b)) return [];
      const counts = new Map<string, number>();
      for (const r of S.reactions.filter((x) => x.build_id === buildId && !blockedWith(x.user_id)))
        counts.set(r.sticker, (counts.get(r.sticker) ?? 0) + 1);
      return [...counts.entries()].map(([sticker, reactions]) => ({ sticker: sticker as never, reactions }));
    }),
  myReactions: (buildId) =>
    run(() => S.reactions.filter((r) => r.build_id === buildId && r.user_id === DEMO_ME).map((r) => r.sticker)),
  react: (buildId, sticker) =>
    run(() => {
      const b = S.builds.find((x) => x.id === buildId);
      if (!S.subscription.plus) refuse("paywall");
      if (!b || !isPublic(b)) refuse("buildNotFound");
      if (!S.reactions.some((r) => r.build_id === buildId && r.user_id === DEMO_ME && r.sticker === sticker))
        S.reactions.push({ build_id: buildId, user_id: DEMO_ME, sticker });
    }),
  unreact: (buildId, sticker) =>
    run(() => {
      S.reactions = S.reactions.filter(
        (r) => !(r.build_id === buildId && r.user_id === DEMO_ME && r.sticker === sticker),
      );
    }),
  recordView: () => run(() => undefined),
};
