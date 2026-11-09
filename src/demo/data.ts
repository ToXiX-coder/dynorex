import { analyzeRun, simulatedRun } from "@/domain/perf";
import { fillBaseline } from "@/domain/stockSpecs";
import type { SpecDeltas } from "@/domain/specs";
import type {
  MaintenanceRecord,
  PerfRunRow,
  DynoResultRow,
  RecordConfirmation,
  RecordEntryType,
  ReceiptRow,
  RouteAspects,
  TrackLapRow,
  VehicleRecall,
  RoomType,
  SaveRow,
  VehiclePhotoRow,
  BusinessRow,
  BusinessServiceRow,
  ServiceRequestStatus,
  BuildGoal,
  BuildRow,
  ClubRole,
  ModCategory,
  ModPhotoRow,
  ModRow,
  ModStatus,
  MySubscriptionRow,
  NotificationPrefRow,
  NotificationRow,
  EventRow,
  ListingCondition,
  ListingRow,
  OfferStatus,
  RouteRow,
  RsvpStatus,
  StickerKind,
  UserRow,
  VehicleRow,
  WishlistItemRow,
} from "@/services/supabase/database.types";

/**
 * Pitch-mode sample data. Every person, handle and build here is made up for demos; nothing is a real
 * user. The app shows a permanent "PITCH MODE · sample data" banner whenever this is in use.
 */
export const DEMO_ME = "d0000000-0000-4000-8000-0000000000aa";
const id = (n: number) => `d0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export interface DemoState {
  users: UserRow[];
  plusUsers: Set<string>;
  vehicles: VehicleRow[];
  builds: BuildRow[];
  mods: ModRow[];
  photos: ModPhotoRow[];
  wishlist: WishlistItemRow[];
  follows: { follower_id: string; followee_id: string; created_at: string }[];
  buildFollows: { user_id: string; build_id: string; created_at: string }[];
  notifications: NotificationRow[];
  prefs: NotificationPrefRow[];
  blocks: { blocker_id: string; blocked_id: string; created_at: string }[];
  mutes: { muter_id: string; muted_id: string; created_at: string }[];
  reactions: { build_id: string; user_id: string; sticker: StickerKind }[];
  views: { build_id: string; viewer_id: string; day: string }[];
  region: { share_builds: boolean } | null;
  subscription: MySubscriptionRow;
  seq: number;
  // Phase 7 (Line, Paddock)
  routes: RouteRow[];
  ratings: ({ route_id: string; user_id: string; stars: number; comment: string | null } & Partial<RouteAspects>)[];
  events: EventRow[];
  rsvps: { event_id: string; user_id: string; status: RsvpStatus }[];
  checkins: { event_id: string; user_id: string }[];
  codes: { event_id: string; code: string; expires_at: number }[];
  // Phase 7b (Paddock community)
  clubs: DemoClub[];
  clubMembers: { club_id: string; user_id: string; role: ClubRole }[];
  posts: DemoPost[];
  comments: DemoComment[];
  likes: { post_id: string; user_id: string }[];
  // Shop (D-56)
  listings: ListingRow[];
  offers: DemoOffer[];
  offerMessages: { id: string; offer_id: string; sender_id: string; body: string; created_at: string }[];
  // Services (D-57)
  businesses: BusinessRow[];
  businessServices: BusinessServiceRow[];
  serviceRequests: DemoServiceRequest[];
  requestMessages: { id: string; request_id: string; sender_id: string; body: string; created_at: string }[];
  // D-58
  clubJoinRequests: { club_id: string; user_id: string; created_at: string }[];
  roomMessages: DemoRoomMessage[];
  maintenance: MaintenanceRecord[];
  saves: SaveRow[];
  vehiclePhotos: VehiclePhotoRow[];
  // D-60
  perfRuns: PerfRunRow[];
  /** only your own position is stored; the other drivers are animated along the route */
  drivePositions: { event_id: string; lat: number; lng: number; heading: number | null; updated_at: string }[];
  // D-61
  receipts: ReceiptRow[];
  eventPhotos: {
    id: string;
    event_id: string;
    owner_id: string;
    storage_path: string;
    created_at: string;
    deleted_at: string | null;
  }[];
  historyShares: { vehicle_id: string; token: string; expires_at: string }[];
  // D-62
  dynoResults: DynoResultRow[];
  trackLaps: TrackLapRow[];
  recalls: (Omit<VehicleRecall, "dismissed"> & { vehicle_id: string })[];
  recallDismissals: { vehicle_id: string; campaign: string }[];
  // D-64 (Build Record)
  recordRevisions: {
    id: string;
    owner_id: string;
    vehicle_id: string;
    entry_type: RecordEntryType;
    entry_id: string;
    changed: string[];
    edited_at: string;
  }[];
  recordConfirmations: (RecordConfirmation & {
    id: string;
    owner_id: string;
    vehicle_id: string;
    entry_type: "mod" | "maintenance";
    entry_id: string;
    business_id: string | null;
  })[];
  confirmRequests: {
    id: string;
    owner_id: string;
    vehicle_id: string;
    entry_type: "mod" | "maintenance";
    entry_id: string;
    version: number;
    business_id: string | null;
    token: string | null;
    created_at: string;
    expires_at: string;
    closed_at: string | null;
  }[];
  transfers: { vehicle_id: string; code: string; expires_at: string; closed_at: string | null; failed: number }[];
}
export type DemoRoomMessage = {
  id: string;
  room_type: RoomType;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};
export type DemoServiceRequest = {
  id: string;
  business_id: string;
  service_id: string | null;
  customer_id: string;
  vehicle_text: string | null;
  preferred_date: string | null;
  message: string;
  status: ServiceRequestStatus;
  created_at: string;
};
export type DemoOffer = {
  id: string;
  listing_id: string;
  buyer_id: string;
  amount_minor: number;
  note: string | null;
  status: OfferStatus;
  created_at: string;
};
export type DemoClub = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility?: "public" | "private";
  created_at: string;
  deleted_at: string | null;
};
export type DemoPost = {
  id: string;
  author_id: string;
  club_id: string | null;
  body: string;
  build_vehicle_id: string | null;
  created_at: string;
  deleted_at: string | null;
};
export type DemoComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string | null;
  sticker: StickerKind | null;
  created_at: string;
  deleted_at: string | null;
};

/** A synthetic loop drive around a made-up centre, with timestamps (never anyone's real track). */
function loop(lat0: number, lon0: number, km: number, startedDaysAgo: number): [number, number, number][] {
  const n = Math.round(km * 5);
  const t0 = Date.now() - startedDaysAgo * 86_400_000;
  const r = km / (2 * Math.PI) / 111; // radius in degrees for the requested length
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [lat0 + r * Math.sin(a) + 0.002 * Math.sin(a * 5), lon0 + r * Math.cos(a), t0 + i * 12_000];
  });
}
function route(n: number, owner: string, title: string, km: number, daysAgo: number, pub: boolean): RouteRow {
  const points = loop(34 + n * 0.01, -118.5 - n * 0.01, km, daysAgo);
  const dist = Math.round(km * 1000);
  return {
    id: id(n),
    owner_id: owner,
    title,
    description: null,
    visibility: pub ? "public" : "private",
    points,
    distance_m: dist,
    duration_s: Math.round((points.length - 1) * 12),
    started_at: new Date(points[0]![2]).toISOString(),
    ended_at: new Date(points[points.length - 1]![2]).toISOString(),
    // pitch data: the sample "public" copy simply drops the first and last few points
    public_points: pub ? points.slice(3, -3).map(([la, lo]) => [la, lo] as [number, number]) : null,
    start_cell_lat: null,
    start_cell_lon: null,
    client_ref: null,
    created_at: new Date(points[0]![2]).toISOString(),
    updated_at: new Date(points[0]![2]).toISOString(),
    deleted_at: null,
    hidden_at: null,
  };
}
/**
 * Hours from now until a believable local start time: `days` days ahead at `hour` (decimal, 6.5 = 6:30 am),
 * or with `weekday` (0 = Sunday) the first such weekday at least `days` days ahead.
 */
function hoursUntil(days: number, hour: number, weekday?: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, Math.floor(hour), (hour % 1) * 60);
  if (weekday !== undefined) d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return (d.getTime() - now.getTime()) / 3_600_000;
}

function event(
  n: number,
  organizer: string,
  title: string,
  startsInHours: number,
  hours: number,
  location: string,
  capacity: number | null,
  description: string | null = null,
  extra: Partial<EventRow> = {},
): EventRow {
  // real events start on round times: snap to the quarter hour (the "soon" one stays within check-in time)
  const quarter = 15 * 60_000;
  const start = Math.round((Date.now() + startsInHours * 3_600_000) / quarter) * quarter;
  return {
    id: id(n),
    organizer_id: organizer,
    title,
    description,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + hours * 3_600_000).toISOString(),
    location_text: location,
    capacity,
    status: "scheduled",
    kind: "meet",
    route_id: null,
    club_id: null,
    // sample meeting spots scattered around a made-up city centre, for the events map
    place_lat: 34.05 + ((n % 7) - 3) * 0.012,
    place_lng: -118.25 + ((n % 5) - 2) * 0.016,
    series_id: null,
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
    deleted_at: null,
    hidden_at: null,
    ...extra,
  };
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function user(
  n: number,
  username: string,
  display_name: string | null,
  goal: BuildGoal,
  extra: Partial<UserRow> = {},
): UserRow {
  return {
    id: id(n),
    username,
    display_name,
    bio: null,
    general_location: null,
    years_experience: null,
    avatar_path: null,
    build_goal: goal,
    driver_gear: null,
    onboarding_step: 3,
    onboarding_completed_at: daysAgo(120),
    onboarding_skipped_at: null,
    default_visibility: "private",
    reputation: 0,
    business_badge: false,
    created_at: daysAgo(200),
    updated_at: daysAgo(10),
    deleted_at: null,
    hidden_at: null,
    ...extra,
  };
}

type Spec = [hp: number | null, tq: number | null, wt: number | null, zs: number | null];
function vehicle(
  n: number,
  owner: string,
  year: number,
  make: string,
  model: string,
  nickname: string | null,
  pub: boolean,
  [hp, tq, wt, zs]: Spec,
  extra: Partial<VehicleRow> = {},
): VehicleRow {
  // blank stock numbers fill from factory specs, exactly like the database trigger
  const base = fillBaseline({
    year,
    make,
    model,
    trim_level: extra.trim_level ?? null,
    baseline_hp: hp,
    baseline_torque_lbft: tq,
    baseline_weight_lb: wt,
    baseline_zero_to_sixty_s: zs,
  });
  return {
    id: id(n),
    owner_id: owner,
    year,
    make,
    model,
    trim_level: null,
    nickname,
    vin: null,
    odometer: null,
    odometer_unit: "mi",
    description: null,
    ...base.values,
    baseline_source: base.baseline_source,
    baseline_looked_up: base.baseline_looked_up,
    baseline_lookup_label: base.baseline_lookup_label,
    data_source: "manual",
    nhtsa_make_id: null,
    nhtsa_model_id: null,
    hero_path: null,
    visibility: pub ? "public" : "private",
    client_ref: null,
    created_at: daysAgo(150 - n),
    updated_at: daysAgo(5),
    deleted_at: null,
    hidden_at: null,
    ...extra,
  };
}

function build(n: number, v: VehicleRow, title: string, description: string | null = null): BuildRow {
  return {
    id: id(n),
    owner_id: v.owner_id,
    vehicle_id: v.id,
    title,
    description,
    visibility: v.visibility,
    featured: false,
    created_at: v.created_at,
    updated_at: daysAgo(3),
    deleted_at: null,
  };
}

const d = (o: Partial<Record<"hp" | "torque" | "weight" | "zero_to_sixty", number>>): SpecDeltas => {
  const out: SpecDeltas = { schema_version: 1 };
  if (o.hp !== undefined) out.hp = { delta: o.hp, unit: "hp" };
  if (o.torque !== undefined) out.torque = { delta: o.torque, unit: "lb-ft" };
  if (o.weight !== undefined) out.weight = { delta: o.weight, unit: "lb" };
  if (o.zero_to_sixty !== undefined) out.zero_to_sixty = { delta: o.zero_to_sixty, unit: "s" };
  return out;
};

function mod(
  n: number,
  v: VehicleRow,
  name: string,
  category: ModCategory,
  status: ModStatus,
  cost: number | null,
  deltas: SpecDeltas,
  age: number,
  extra: Partial<ModRow> = {},
): ModRow {
  return {
    id: id(n),
    owner_id: v.owner_id,
    vehicle_id: v.id,
    name,
    category,
    brand: null,
    part_number: null,
    cost_minor: cost,
    currency: cost === null ? null : "USD",
    status,
    spec_deltas: deltas,
    notes: null,
    installed_on: status === "complete" ? daysAgo(age).slice(0, 10) : null,
    status_changed_at: daysAgo(age),
    client_ref: null,
    created_at: daysAgo(age),
    updated_at: daysAgo(age),
    deleted_at: null,
    hidden_at: null,
    ...extra,
  };
}

export function seedDemo(): DemoState {
  const me = user(0xaa, "demo_driver", "Demo Driver", "track_build", {
    bio: "Weekend track days, weekday commutes.",
    general_location: "Sample City",
    years_experience: 8,
    reputation: 42,
  });
  const apex = user(1, "apex_hunter", "Apex Hunter", "track_build", {
    reputation: 310,
    bio: "Late apex, early braking.",
    driver_gear: "headset:race_suit:flag",
  });
  const r33 = user(2, "jdm_garage_42", null, "jdm_build", {
    reputation: 205,
    driver_gear: "headband:mechanic_jacket:wrench",
  });
  const trail = user(3, "trail_ready", "Trail Ready", "off_road", { reputation: 120 });
  const low = user(4, "low_and_slow", null, "stance_build", { reputation: 88 });
  const grand = user(5, "big_block_shop", "Big Block Shop", "restomod", { reputation: 540, business_badge: true });
  const civic = user(6, "commuter_club", null, "daily_driver", { reputation: 15 });

  const wrx = vehicle(0x101, DEMO_ME, 2015, "Subaru", "WRX", "Weekend Warrior", true, [268, 258, 3267, 5.4], {
    trim_level: "Premium",
    odometer: 61200,
    // a made-up VIN, so the buyer's VIN check and the transfer can be shown
    vin: "JF1VA1A60F9800012",
    description: "Daily driven, tracked twice a season.",
    // D-64: bought from an earlier owner, whose work came with it
    previous_owners: 1,
    received_at: daysAgo(800),
    // the car being worked on right now (Ask Torq opens on it)
    updated_at: daysAgo(1),
  });
  const miata = vehicle(0x102, DEMO_ME, 1999, "Mazda", "MX-5 Miata", "Project Zoom", false, [null, null, null, null], {
    odometer: 143000,
  });
  const evo = vehicle(0x111, apex.id, 2008, "Mitsubishi", "Lancer Evolution X", null, true, [291, 300, 3517, 4.9]);
  const gtr = vehicle(0x112, r33.id, 1996, "Nissan", "Skyline GT-R", null, true, [276, 271, 3390, 5.0]);
  const bronco = vehicle(0x113, trail.id, 2021, "Ford", "Bronco", null, true, [300, 325, 4500, 6.5]);
  const gti = vehicle(0x114, low.id, 2016, "Volkswagen", "GTI", null, true, [220, 258, 3100, 5.9]);
  const camaro = vehicle(0x115, grand.id, 1969, "Chevrolet", "Camaro", null, true, [300, 380, 3400, 6.9]);
  const si = vehicle(0x116, civic.id, 2019, "Honda", "Civic Si", null, true, [205, 192, 2900, 6.7]);

  const builds = [
    build(0x201, wrx, "Weekend Warrior", "Street car that earns its keep at the track."),
    build(0x211, evo, "Rally Red Evo"),
    build(0x212, gtr, "R33 Revival", "Imported in pieces, coming back together."),
    build(0x213, bronco, "Dirt Season"),
    build(0x214, gti, "Bagged GTI"),
    build(0x215, camaro, "Big Block Restomod", "Classic body, modern brakes and suspension."),
    build(0x216, si, "Daily Si"),
  ];

  const mods: ModRow[] = [
    mod(0x301, wrx, "Cold air intake", "engine", "complete", 34999, d({ hp: 10, torque: 8 }), 90, {
      installed_by: "Self",
      brand: "SampleFlow",
      part_number: "SF-CAI-15",
      notes: "Noticeably louder induction.",
      // D-64: made-up CARB EO numbers (sample parts)
      compliance: "carb_eo",
      carb_eo: "D-9001-1",
    }),
    mod(0x302, wrx, "Cat-back exhaust", "exhaust", "complete", 89900, d({ hp: 8, weight: -12 }), 60, {
      installed_by: "Garage 42 Tuning",
      brand: "SampleWorks",
      compliance: "carb_eo",
      carb_eo: "D-9002-3",
    }),
    // D-64: the earlier owner's work, copied over when the WRX changed hands (read-only)
    mod(0x307, wrx, "Short shifter", "interior", "complete", null, d({}), 900, {
      installed_by: "Pinecrest Auto",
      brand: "SampleShift",
      inherited_at: daysAgo(800),
    }),
    mod(0x303, wrx, "Lightweight wheels", "wheels", "complete", 120000, d({ weight: -28, zero_to_sixty: -0.1 }), 40),
    mod(0x304, wrx, "Coilovers", "suspension", "in_progress", 145000, d({}), 12, { brand: "SampleRide" }),
    mod(0x305, wrx, "Stage 2 tune", "electronics", "planned", 69900, d({ hp: 45, torque: 60 }), 4),
    mod(0x306, wrx, "Big brake kit", "safety", "planned", 210000, d({ weight: 6 }), 2),
    mod(0x311, miata, "Roll bar", "safety", "complete", 45000, d({ weight: 25 }), 70),
    mod(0x312, miata, "Bucket seats", "interior", "planned", 80000, d({ weight: -30 }), 20),
    mod(0x321, evo, "Front-mount intercooler", "engine", "complete", 95000, d({ hp: 20 }), 30),
    mod(0x322, evo, "Aero kit", "aero", "complete", 180000, d({ weight: 15 }), 8),
    mod(0x331, gtr, "Rebuilt RB26 top end", "engine", "complete", 450000, d({ hp: 60, torque: 40 }), 25),
    mod(0x332, gtr, "Fresh paint", "exterior", "in_progress", 600000, d({}), 1),
    mod(0x341, bronco, "35-inch tires", "wheels", "complete", 200000, d({ weight: 90, zero_to_sixty: 0.6 }), 15),
    mod(0x351, gti, "Air suspension", "suspension", "complete", 300000, d({ weight: 30 }), 50),
    mod(0x361, camaro, "Disc brake conversion", "safety", "complete", 150000, d({}), 18),
    mod(0x362, camaro, "Coilover conversion", "suspension", "complete", 280000, d({ weight: -40 }), 6),
    mod(0x371, si, "Short shifter", "interior", "complete", 22000, d({}), 9),
  ];

  // More sample WRX builds, so Torq chat has community numbers to aggregate in pitch mode (all made up).
  const wrxCommunity = (
    [
      [
        0x118,
        apex.id,
        2016,
        [
          ["Cold air intake", "engine", 8],
          ["Cat-back exhaust", "exhaust", 6],
          ["Stage 2 tune", "electronics", 45],
          ["Coilovers", "suspension", null],
          ["Front-mount intercooler", "engine", 15],
        ],
      ],
      [
        0x119,
        trail.id,
        2017,
        [
          ["Cold air intake", "engine", 12],
          ["Stage 2 tune", "electronics", 55],
          ["Cat-back exhaust", "exhaust", 10],
        ],
      ],
      [
        0x11a,
        low.id,
        2018,
        [
          ["Cold air intake", "engine", 9],
          ["Coilovers", "suspension", null],
          ["Lightweight wheels", "wheels", null],
          ["Front-mount intercooler", "engine", 20],
        ],
      ],
      [
        0x11b,
        civic.id,
        2015,
        [
          ["Cold air intake", "engine", 15],
          ["Stage 2 tune", "electronics", 60],
          ["Cat-back exhaust", "exhaust", 7],
          ["Big brake kit", "safety", null],
        ],
      ],
    ] as const
  ).map(([n, owner, year, list], i) => {
    const v = vehicle(n, owner, year, "Subaru", "WRX", null, true, [268, 258, 3267, 5.4]);
    const b = build(n + 0x100, v, ["Daily WRX", "Rally Blue Daily", "Low WRX", "Commuter WRX"][i]!);
    const ms = list.map(([name, category, hp], j) =>
      mod(n * 16 + j, v, name, category as ModCategory, "complete", null, hp === null ? d({}) : d({ hp }), 20 + j * 7),
    );
    return { v, b, ms };
  });

  // D-71: a sample motorcycle and e-bike, so Discover and the profiles show the new kinds. Stock numbers come from
  // the starter list (domain/twoWheelCatalog.ts), which cites its sources; the owners and their mods are made up.
  const mt07 = vehicle(0x11c, apex.id, 2025, "Yamaha", "MT-07", "Canyon Hooligan", true, [72, 50, 403, null], {
    kind: "motorcycle",
    engine_cc: 689,
    odometer: 4200,
  });
  // D-73: the sample e-moto (stored kind "ebike"), with the owner's 72V pack and controller already in
  const xp3 = vehicle(0x11d, civic.id, 2025, "Sur-Ron", "Light Bee X", "Trail Bee", true, [null, null, 126, null], {
    kind: "ebike",
    motor_w: 8000,
    battery_v: 60,
    battery_wh: 2400,
    range_mi: 47,
    top_speed_mph: 47,
    street_legal: false,
    odometer: 1850,
  });
  const twoWheels = {
    vehicles: [mt07, xp3],
    builds: [
      build(0x21c, mt07, "Canyon Hooligan", "Middleweight naked, set up for back roads."),
      build(0x21d, xp3, "Trail Bee", "Stock frame, everything else is getting the treatment. Trails on weekends."),
    ],
    mods: [
      mod(0x381, mt07, "Slip-on exhaust", "exhaust", "complete", 69900, d({ hp: 2, weight: -6 }), 35, { brand: "SampleCan" }),
      mod(0x382, mt07, "Frame sliders", "safety", "complete", 14900, d({}), 30),
      mod(0x383, mt07, "Fork cartridges", "suspension", "in_progress", 89900, d({}), 6),
      mod(0x384, mt07, "Quickshifter", "controls", "planned", 39900, d({}), 2),
      mod(0x385, xp3, "Controller upgrade", "motor", "complete", 89900, d({}), 40, { brand: "SampleVolt" }),
      mod(0x386, xp3, "72V battery", "battery", "planned", 189900, d({ weight: 6 }), 5),
      mod(0x387, xp3, "Fork upgrade", "suspension", "complete", 99900, d({ weight: -2 }), 22),
      mod(0x388, xp3, "Rear sprocket", "drivetrain", "complete", 7900, d({}), 30),
    ],
  };

  const now = new Date().toISOString();
  return {
    users: [me, apex, r33, trail, low, grand, civic],
    plusUsers: new Set([grand.id, apex.id]),
    vehicles: [wrx, miata, evo, gtr, bronco, gti, camaro, si, ...wrxCommunity.map((x) => x.v), ...twoWheels.vehicles],
    builds: [...builds, ...wrxCommunity.map((x) => x.b), ...twoWheels.builds],
    mods: [...mods, ...wrxCommunity.flatMap((x) => x.ms), ...twoWheels.mods],
    photos: [],
    wishlist: [
      {
        id: id(0x401),
        owner_id: DEMO_ME,
        vehicle_id: wrx.id,
        name: "Track brake pads",
        url: "https://example.com/brake-pads",
        price_minor: 24900,
        currency: "USD",
        notes: null,
        is_affiliate: false,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
        deleted_at: null,
      },
    ],
    follows: [
      { follower_id: apex.id, followee_id: DEMO_ME, created_at: daysAgo(2) },
      { follower_id: trail.id, followee_id: DEMO_ME, created_at: daysAgo(20) },
      { follower_id: DEMO_ME, followee_id: grand.id, created_at: daysAgo(30) },
      { follower_id: civic.id, followee_id: grand.id, created_at: daysAgo(30) },
      { follower_id: r33.id, followee_id: apex.id, created_at: daysAgo(12) },
    ],
    buildFollows: [
      { user_id: DEMO_ME, build_id: id(0x211), created_at: daysAgo(40) },
      { user_id: DEMO_ME, build_id: id(0x212), created_at: daysAgo(35) },
      { user_id: apex.id, build_id: id(0x201), created_at: daysAgo(2) },
      { user_id: trail.id, build_id: id(0x201), created_at: daysAgo(9) },
      { user_id: civic.id, build_id: id(0x201), created_at: daysAgo(25) },
      ...[r33.id, trail.id, low.id, civic.id, DEMO_ME].map((u, i) => ({
        user_id: u,
        build_id: id(0x215),
        created_at: daysAgo(3 + i),
      })),
      ...[apex.id, low.id, civic.id].map((u, i) => ({ user_id: u, build_id: id(0x212), created_at: daysAgo(4 + i) })),
    ],
    notifications: [
      {
        id: id(0x501),
        recipient_id: DEMO_ME,
        category: "new_follower",
        entity_type: "user",
        entity_id: apex.username!,
        title: "New follower",
        body: "@apex_hunter started following you.",
        read_at: null,
        created_at: daysAgo(2),
        actor_id: apex.id,
        push_sent_at: null,
      },
      {
        id: id(0x502),
        recipient_id: DEMO_ME,
        category: "build_update",
        entity_type: "build",
        entity_id: gtr.id,
        title: "Build update",
        body: "@jdm_garage_42 added a mod to R33 Revival.",
        read_at: null,
        created_at: daysAgo(1),
        actor_id: r33.id,
        push_sent_at: null,
      },
      {
        id: id(0x503),
        recipient_id: DEMO_ME,
        category: "new_follower",
        entity_type: "user",
        entity_id: trail.username!,
        title: "New follower",
        body: "@trail_ready started following you.",
        read_at: daysAgo(19),
        created_at: daysAgo(20),
        actor_id: trail.id,
        push_sent_at: null,
      },
    ],
    prefs: [],
    blocks: [],
    mutes: [],
    reactions: [
      { build_id: id(0x201), user_id: apex.id, sticker: "fire" },
      { build_id: id(0x201), user_id: grand.id, sticker: "fire" },
      { build_id: id(0x201), user_id: apex.id, sticker: "track_ready" },
      { build_id: id(0x215), user_id: apex.id, sticker: "money_eyes" },
      { build_id: id(0x212), user_id: grand.id, sticker: "hype" },
    ],
    views: [r33.id, trail.id, low.id, grand.id, civic.id, apex.id].flatMap((u, i) => [
      { build_id: id(0x201), viewer_id: u, day: daysAgo(i).slice(0, 10) },
      { build_id: id(0x201), viewer_id: u, day: daysAgo(10 + i).slice(0, 10) },
    ]),
    region: null,
    subscription: {
      plus: false,
      status: null,
      product_id: null,
      platform: null,
      expires_at: null,
      grace_until: null,
      will_renew: false,
      via_override: false,
    },
    seq: 0x1000 + Math.floor(Date.parse(now) % 1000),
    routes: [
      route(0x601, apex.id, "Canyon run at sunrise", 38, 3, true),
      route(0x602, trail.id, "Fire road loop", 22, 9, true),
      route(0x603, grand.id, "Sunday cruise", 54, 14, true),
      route(0x604, DEMO_ME, "Commute home", 12, 1, false),
    ],
    ratings: [
      // D-61: road reviews rate scenery, surface and traffic (5 = empty road) as well as overall stars
      {
        route_id: id(0x601),
        user_id: grand.id,
        stars: 5,
        comment: "Perfect early, empty road. Watch for gravel after the second hairpin.",
        scenery: 5,
        surface: 4,
        traffic: 5,
      },
      {
        route_id: id(0x601),
        user_id: r33.id,
        stars: 4,
        comment: "Great views at the overlook. Busy with cyclists after 9.",
        scenery: 5,
        surface: 4,
        traffic: 3,
      },
      { route_id: id(0x603), user_id: civic.id, stars: 4, comment: null, scenery: 4, surface: 3, traffic: 4 },
    ],
    events: [
      // a weekly series: four Sundays in a row, each its own event (D-60)
      ...[0x701, 0x707, 0x708, 0x709].map((n, i) =>
        event(
          n,
          grand.id,
          "Cars and Coffee",
          // Sundays at 8 am, starting the first Sunday at least a day away
          hoursUntil(1 + i * 7, 8, 0),
          3,
          "Sample City, north lot",
          60,
          "Bring the build. Coffee's on the shop.",
          { series_id: id(0x7a1) },
        ),
      ),
      // a group drive that's about to start: the live map is open (D-60)
      event(
        0x706,
        apex.id,
        "Tonight's canyon cruise",
        0.1,
        2,
        "Canyon gas station, Sample Hills",
        12,
        "Live map on. Easy pace, regroup at the overlook.",
        { kind: "drive", route_id: id(0x601) },
      ),
      event(0x702, apex.id, "Track walk and briefing", hoursUntil(4, 9), 2, "Sample Raceway paddock", 2),
      event(0x703, trail.id, "Trail day", hoursUntil(2, 7, 6), 6, "Fire road gate, Sample Hills", null),
      // yours, starting soon: shows the organizer check-in tools in a pitch
      event(0x704, DEMO_ME, "Weekend Warrior meetup", 0.5, 2, "Sample Mall, level 3", 25),
      // a club group drive that follows a shared route
      event(
        0x705,
        apex.id,
        "Sunrise canyon group drive",
        hoursUntil(2, 6.5),
        3,
        "Canyon gas station, Sample Hills",
        12,
        "Easy pace, no racing. We follow the shared route and regroup at the overlook.",
        { kind: "drive", route_id: id(0x601), club_id: id(0x801) },
      ),
    ],
    rsvps: [
      { event_id: id(0x701), user_id: apex.id, status: "going" },
      { event_id: id(0x701), user_id: r33.id, status: "going" },
      { event_id: id(0x701), user_id: civic.id, status: "interested" },
      { event_id: id(0x702), user_id: grand.id, status: "going" },
      { event_id: id(0x702), user_id: r33.id, status: "going" },
      { event_id: id(0x704), user_id: apex.id, status: "going" },
      { event_id: id(0x704), user_id: trail.id, status: "going" },
      { event_id: id(0x704), user_id: DEMO_ME, status: "going" },
      { event_id: id(0x706), user_id: DEMO_ME, status: "going" },
      { event_id: id(0x706), user_id: r33.id, status: "going" },
      { event_id: id(0x706), user_id: trail.id, status: "going" },
      { event_id: id(0x706), user_id: grand.id, status: "going" },
    ],
    checkins: [],
    codes: [],
    clubs: [
      {
        id: id(0x801),
        owner_id: apex.id,
        name: "Sample Hills Canyon Club",
        description: "Early-morning canyon drives at a sensible pace. No racing on public roads.",
        created_at: daysAgo(60),
        deleted_at: null,
      },
      {
        id: id(0x802),
        owner_id: r33.id,
        name: "JDM Garage Nights",
        description: "Wrenching, parts swaps and late-night garage sessions.",
        visibility: "private",
        created_at: daysAgo(45),
        deleted_at: null,
      },
      {
        id: id(0x804),
        owner_id: DEMO_ME,
        name: "Weekend Warrior Crew",
        description: "Invite-only crew for track-day carpools.",
        visibility: "private",
        created_at: daysAgo(10),
        deleted_at: null,
      },
      {
        id: id(0x803),
        owner_id: trail.id,
        name: "Dirt Season Crew",
        description: null,
        created_at: daysAgo(20),
        deleted_at: null,
      },
    ],
    clubMembers: [
      { club_id: id(0x801), user_id: apex.id, role: "owner" },
      { club_id: id(0x801), user_id: grand.id, role: "member" },
      { club_id: id(0x801), user_id: DEMO_ME, role: "member" },
      { club_id: id(0x802), user_id: r33.id, role: "owner" },
      { club_id: id(0x802), user_id: low.id, role: "member" },
      { club_id: id(0x803), user_id: trail.id, role: "owner" },
      { club_id: id(0x804), user_id: DEMO_ME, role: "owner" },
      { club_id: id(0x804), user_id: low.id, role: "member" },
    ],
    posts: [
      {
        id: id(0x901),
        author_id: apex.id,
        club_id: id(0x801),
        body: "Group drive is on for this weekend. Route's shared on the event page, meet at the gas station.",
        build_vehicle_id: null,
        created_at: hoursAgo(3),
        deleted_at: null,
      },
      {
        id: id(0x902),
        author_id: grand.id,
        club_id: null,
        body: "Coilover conversion is finally done. Rides like a modern car now.",
        build_vehicle_id: camaro.id,
        created_at: hoursAgo(9),
        deleted_at: null,
      },
      {
        id: id(0x903),
        author_id: r33.id,
        club_id: id(0x802),
        body: "Anyone have a spare RB26 coil pack? Mine's misfiring on cylinder 4.",
        build_vehicle_id: null,
        created_at: hoursAgo(26),
        deleted_at: null,
      },
      {
        id: id(0x904),
        author_id: trail.id,
        club_id: null,
        body: "Fire road loop is dry and open again. Air down before the gate.",
        build_vehicle_id: null,
        created_at: hoursAgo(50),
        deleted_at: null,
      },
    ],
    comments: [
      {
        id: id(0xa01),
        post_id: id(0x902),
        author_id: apex.id,
        body: "That stance is perfect.",
        sticker: null,
        created_at: hoursAgo(8),
        deleted_at: null,
      },
      {
        id: id(0xa02),
        post_id: id(0x902),
        author_id: grand.id,
        body: null,
        sticker: "fire",
        created_at: hoursAgo(7),
        deleted_at: null,
      },
      {
        id: id(0xa03),
        post_id: id(0x901),
        author_id: grand.id,
        body: "I'll bring the Camaro.",
        sticker: null,
        created_at: hoursAgo(2),
        deleted_at: null,
      },
    ],
    likes: [
      { post_id: id(0x901), user_id: grand.id },
      { post_id: id(0x902), user_id: apex.id },
      { post_id: id(0x902), user_id: civic.id },
      { post_id: id(0x902), user_id: r33.id },
      { post_id: id(0x903), user_id: low.id },
    ],
    listings: [
      listing(0xb01, apex.id, "18x9.5 lightweight wheels (set of 4)", "wheels", "used", 90000, 20, {
        fits: "5x114.3, +38 offset",
        description: "Two track seasons, no curb rash. Tires not included.",
      }),
      listing(0xb02, r33.id, "RB26 coil packs (set of 6)", "engine", "like_new", 28000, 30, {
        fits: "Nissan RB26DETT",
        description: "Swapped in last month, then went to a different ignition setup. All six fire.",
      }),
      listing(0xb03, low.id, "Coilovers, two seasons on them", "suspension", "used", 65000, 50, {
        fits: "2015-2021 VW GTI (Mk7)",
        status: "pending",
      }),
      listing(0xb04, trail.id, "Steel front bumper with winch plate", "exterior", "used", 40000, 70, {
        fits: "2021+ Ford Bronco",
      }),
      listing(0xb05, grand.id, "Big brake kit, 6-piston front", "safety", "new", 120000, 10, {
        fits: "1967-1969 Camaro",
        description: "Still boxed. Ordered the wrong spindle size.",
      }),
      listing(0xb06, DEMO_ME, "Stock WRX exhaust", "exhaust", "used", 15000, 40, {
        fits: "2015-2021 Subaru WRX",
        description: "Came off for the cat-back. Hangers and gaskets included.",
      }),
    ],
    offers: [
      offer(0xc01, 0xb06, apex.id, 12000, "Can pick up this weekend.", "open", 30),
      offer(0xc02, 0xb03, DEMO_ME, 60000, "Would these work on a WRX with adapters?", "accepted", 45),
    ],
    offerMessages: [
      {
        id: id(0xd01),
        offer_id: id(0xc02),
        sender_id: low.id,
        body: "Deal. Saturday at the sample parts store lot?",
        created_at: hoursAgo(40),
      },
      { id: id(0xd02), offer_id: id(0xc02), sender_id: DEMO_ME, body: "Works for me. 10am?", created_at: hoursAgo(39) },
    ],
    businesses: [
      business(0xe01, grand.id, "Big Block Garage", ["suspension", "safety", "engine"], {
        about: "Classic muscle with modern brakes and suspension. Sample shop for demos.",
        website: "https://big-block-garage.example",
        phone: "+1 555 0100",
      }),
      business(0xe02, r33.id, "Garage 42 Tuning", ["engine", "electronics"], {
        about: "JDM tuning on our in-house dyno. Sample shop for demos.",
      }),
    ],
    businessServices: [
      svc(
        0xe11,
        0xe01,
        grand.id,
        "Brake upgrade install",
        "safety",
        "from",
        35000,
        "Pads, rotors and lines, or a full big brake kit.",
      ),
      svc(0xe12, 0xe01, grand.id, "Coilover install and alignment", "suspension", "fixed", 45000, null),
      svc(0xe13, 0xe01, grand.id, "Restomod consult", "engine", "quote", null, "Bring your car and your plans."),
      svc(
        0xe21,
        0xe02,
        r33.id,
        "Dyno tune (stage 1-2)",
        "engine",
        "from",
        50000,
        "Before and after pulls on our dyno.",
      ),
      svc(0xe22, 0xe02, r33.id, "Boost leak test", "engine", "fixed", 9000, null),
      svc(0xe23, 0xe02, r33.id, "Custom wiring", "electronics", "quote", null, null),
    ],
    serviceRequests: [
      {
        id: id(0xe31),
        business_id: id(0xe02),
        service_id: id(0xe21),
        customer_id: DEMO_ME,
        vehicle_text: "2015 Subaru WRX",
        preferred_date: null,
        message: "Intake and cat-back are on. Looking for a stage 1 tune.",
        status: "accepted",
        created_at: hoursAgo(30),
      },
    ],
    requestMessages: [
      {
        id: id(0xe41),
        request_id: id(0xe31),
        sender_id: r33.id,
        body: "We can fit you in Thursday morning.",
        created_at: hoursAgo(28),
      },
    ],
    clubJoinRequests: [{ club_id: id(0x804), user_id: civic.id, created_at: hoursAgo(5) }],
    roomMessages: [
      room(0xf01, "club", id(0x801), apex.id, "Route for Saturday is posted. Fuel up before the climb.", 20),
      room(0xf02, "club", id(0x801), grand.id, "I'll sweep at the back.", 18),
      room(0xf03, "club", id(0x801), DEMO_ME, "Count me in with the WRX.", 17),
      room(0xf04, "event", id(0x704), apex.id, "Gate opens at 7. Grab a spot near the overlook.", 6),
    ],
    maintenance: [
      maint(0xf11, wrx.id, "Oil change", 95, 58200, 4900, { next_due_odometer: 63200, next_due_days: 85 }),
      maint(0xf12, wrx.id, "Brake fluid flush", 740, 41000, 12000, { next_due_days: -10 }),
      maint(0xf13, wrx.id, "Tire rotation", 95, 58200, null, { next_due_odometer: 64200 }),
      maint(0xf14, miata.id, "Timing belt", 400, 138000, 64000, { next_due_odometer: 198000 }),
      // D-64: the earlier owner's clutch job (read-only), and an alignment that was logged and later removed
      {
        ...maint(0xf15, wrx.id, "Clutch replacement", 950, 32000, null, {}),
        inherited_at: daysAgo(800),
      },
      { ...maint(0xf16, wrx.id, "Wheel alignment", 200, 47500, null, {}), deleted_at: daysAgo(150) },
    ],
    // a few things already saved, so the Saved screen shows what it's for
    saves: (
      [
        ["build", evo.id, 30],
        ["listing", id(0xb03), 20],
        ["route", id(0x601), 8],
        ["event", id(0x701), 2],
      ] as const
    ).map(([kind, target_id, h]) => ({ user_id: DEMO_ME, kind, target_id, created_at: hoursAgo(h) })),
    // illustrated sample pictures (see demo/sampleMedia.ts), each marked "SAMPLE IMAGE"
    vehiclePhotos: ["garage", "canyon", "track", "meet"].map((name, position) => ({
      id: id(0x1e01 + position),
      owner_id: DEMO_ME,
      vehicle_id: wrx.id,
      storage_path: `sample:wrx-${name}`,
      position,
      width: 800,
      height: 600,
      created_at: daysAgo(30 - position * 7),
    })),
    // D-60: phone-GPS runs on the WRX before and after each mod (made up), the latest one shared on the build
    perfRuns: (
      [
        [0xa01, 100, 5.66],
        [0xa02, 96, 5.58],
        [0xa03, 84, 5.47],
        [0xa04, 71, 5.52],
        [0xa05, 55, 5.39],
        [0xa06, 47, 5.41],
        [0xa07, 33, 5.31],
        [0xa08, 12, 5.27],
      ] as const
    ).map(([n, age, target]) => perfRun(n, wrx, age, target, n === 0xa08)),
    drivePositions: [],
    receipts: [],
    // the cruise that's about to start already has a couple of photos from the meet-up spot (sample images)
    eventPhotos: (
      [
        [0x1e11, apex.id, "meet", 0.3],
        [0x1e12, r33.id, "canyon", 0.2],
      ] as const
    ).map(([n, owner, name, h]) => ({
      id: id(n),
      event_id: id(0x706),
      owner_id: owner,
      storage_path: `sample:wrx-${name}`,
      created_at: hoursAgo(h),
      deleted_at: null,
    })),
    historyShares: [],
    // D-62: a dyno day before each mod and after (same Dynojet, SAE), laps at a track day, and one sample recall
    dynoResults: (
      [
        [0x1f01, 95, 236.2, 248, false],
        [0x1f02, 70, 245.8, 256, false],
        [0x1f03, 50, 253.9, 247, true],
      ] as const
    ).map(([n, age, whp, wtq, shared]) => ({
      id: id(n),
      owner_id: DEMO_ME,
      vehicle_id: wrx.id,
      measured_on: daysAgo(age).slice(0, 10),
      dyno: "dynojet" as const,
      correction: "sae" as const,
      shop: "Garage 42 Tuning",
      whp,
      wtq,
      fuel: "93 octane",
      notes: null,
      // the latest result has a photo of the (sample) sheet on file
      sheet_path: n === 0x1f03 ? "sample:dyno-sheet" : null,
      shared,
      created_at: daysAgo(age),
    })),
    trackLaps: (
      [
        [0x1f11, 100, 105620, false],
        [0x1f12, 55, 104800, false],
        [0x1f13, 20, 103910, true],
      ] as const
    ).map(([n, age, lap_ms, shared]) => ({
      id: id(n),
      owner_id: DEMO_ME,
      vehicle_id: wrx.id,
      track: "Sample Raceway",
      lap_ms,
      driven_on: daysAgo(age).slice(0, 10),
      source: "racechrono" as const,
      notes: null,
      shared,
      created_at: daysAgo(age),
    })),
    recalls: [
      {
        vehicle_id: wrx.id,
        campaign: "00V000001",
        component: "ELECTRICAL SYSTEM:WIRING",
        summary: "Sample recall for pitch mode: a wiring harness may rub against a bracket.",
        consequence: "A worn harness could short and damage a component.",
        remedy: "Dealers will inspect the harness and add a protective sleeve, free of charge.",
        reported_on: daysAgo(30).slice(0, 10),
        park_it: false,
      },
    ],
    recallDismissals: [],
    // D-64: the wheels' install date was corrected once; Garage 42 confirmed the exhaust from its Dynorex page,
    // and the earlier owner's shop confirmed the short shifter through a link. The oil change is waiting on a shop.
    recordRevisions: [
      {
        id: id(0x2001),
        owner_id: DEMO_ME,
        vehicle_id: wrx.id,
        entry_type: "mod",
        entry_id: id(0x303),
        changed: ["installed_on"],
        edited_at: daysAgo(35),
      },
    ],
    recordConfirmations: [
      {
        id: id(0x2011),
        owner_id: DEMO_ME,
        vehicle_id: wrx.id,
        entry_type: "mod",
        entry_id: id(0x302),
        business_id: id(0xe02),
        decision: "confirmed",
        via: "shop_account",
        shop_name: "Garage 42 Tuning",
        shop_city: "Sample City",
        odometer: null,
        note: "Fitted on our lift; sample confirmation.",
        at: daysAgo(58),
        version: 0,
      },
      {
        id: id(0x2012),
        owner_id: DEMO_ME,
        vehicle_id: wrx.id,
        entry_type: "mod",
        entry_id: id(0x307),
        business_id: null,
        decision: "confirmed",
        via: "link",
        shop_name: "Pinecrest Auto",
        shop_city: "Sample Town",
        odometer: null,
        note: null,
        at: daysAgo(895),
        version: 0,
      },
    ],
    confirmRequests: [
      {
        id: id(0x2021),
        owner_id: DEMO_ME,
        vehicle_id: wrx.id,
        entry_type: "maintenance",
        entry_id: id(0xf11),
        version: 0,
        business_id: id(0xe02),
        token: null,
        created_at: daysAgo(2),
        expires_at: daysAgo(-28),
        closed_at: null,
      },
    ],
    transfers: [],
  };
}

/** A sample run: a smooth 10 Hz pull tuned to reach 60 mph in about `zeroSixty` seconds, measured like a real one. */
function perfRun(n: number, v: VehicleRow, age: number, zeroSixty: number, shared: boolean): PerfRunRow {
  const r = analyzeRun(simulatedRun(10, 128, zeroSixty / 0.6325), v.baseline_weight_lb)!;
  return {
    id: id(n),
    owner_id: v.owner_id,
    vehicle_id: v.id,
    ran_at: daysAgo(age),
    zero_sixty_s: r.zeroSixty,
    quarter_s: r.quarter,
    trap_mph: r.trapMph,
    est_whp: r.estWhp,
    weight_lb: v.baseline_weight_lb,
    sample_hz: r.sampleHz,
    quality: r.quality,
    note: null,
    shared,
    samples: r.samples,
    created_at: daysAgo(age),
    deleted_at: null,
  };
}

function business(
  n: number,
  owner: string,
  name: string,
  specialties: ModCategory[],
  extra: Partial<BusinessRow> = {},
): BusinessRow {
  return {
    id: id(n),
    owner_id: owner,
    name,
    about: null,
    location_text: "Sample City",
    website: null,
    phone: null,
    specialties,
    created_at: daysAgo(90),
    updated_at: daysAgo(90),
    deleted_at: null,
    ...extra,
  };
}
function svc(
  n: number,
  biz: number,
  owner: string,
  name: string,
  category: ModCategory,
  price_type: BusinessServiceRow["price_type"],
  price_minor: number | null,
  description: string | null,
): BusinessServiceRow {
  return {
    id: id(n),
    business_id: id(biz),
    owner_id: owner,
    name,
    description,
    category,
    price_type,
    price_minor,
    currency: "USD",
    created_at: daysAgo(80),
    deleted_at: null,
  };
}

function listing(
  n: number,
  seller: string,
  title: string,
  category: ModCategory,
  condition: ListingCondition,
  price: number,
  hours: number,
  extra: Partial<ListingRow> = {},
): ListingRow {
  return {
    id: id(n),
    seller_id: seller,
    title,
    description: null,
    category,
    condition,
    price_minor: price,
    currency: "USD",
    fits: null,
    location_text: "Sample City",
    photo_path: null,
    status: "active",
    sold_at: null,
    created_at: hoursAgo(hours),
    updated_at: hoursAgo(hours),
    deleted_at: null,
    ...extra,
  };
}
function offer(
  n: number,
  listingN: number,
  buyer: string,
  amount: number,
  note: string | null,
  status: OfferStatus,
  hours: number,
): DemoOffer {
  return {
    id: id(n),
    listing_id: id(listingN),
    buyer_id: buyer,
    amount_minor: amount,
    note,
    status,
    created_at: hoursAgo(hours),
  };
}

export const demoId = id;

function room(n: number, type: RoomType, roomId: string, sender: string, body: string, hours: number): DemoRoomMessage {
  return {
    id: id(n),
    room_type: type,
    room_id: roomId,
    sender_id: sender,
    body,
    created_at: hoursAgo(hours),
    deleted_at: null,
  };
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
function maint(
  n: number,
  vehicleId: string,
  title: string,
  daysAgoDone: number,
  odometer: number | null,
  cost: number | null,
  due: { next_due_odometer?: number; next_due_days?: number },
): MaintenanceRecord {
  return {
    id: id(n),
    owner_id: DEMO_ME,
    vehicle_id: vehicleId,
    title,
    done_on: day(-daysAgoDone),
    odometer,
    cost_minor: cost,
    currency: "USD",
    notes: null,
    next_due_on: due.next_due_days === undefined ? null : day(due.next_due_days),
    next_due_odometer: due.next_due_odometer ?? null,
    created_at: daysAgo(daysAgoDone),
    deleted_at: null,
  };
}
