/**
 * Row types for supabase/migrations (Phases 1-4).
 * Hand-written to match the migration because this machine has no Supabase CLI. Once a local
 * stack is available, replace with:  npx supabase gen types typescript --local > this file
 * (the CI "supabase-db" job regenerates and diffs it).
 */
export type Visibility = "public" | "friends_only" | "private";
export type ModCategory =
  | "engine"
  | "suspension"
  | "exhaust"
  | "aero"
  | "interior"
  | "wheels"
  | "exterior"
  | "electronics"
  | "safety"
  | "brakes"
  | "controls"
  | "luggage"
  | "motor"
  | "battery"
  | "drivetrain"
  | "cockpit";
/** D-71 */
export type VehicleKind = "car" | "motorcycle" | "ebike";
export type ModStatus = "planned" | "in_progress" | "complete";
export type BuildGoal =
  | "daily_driver"
  | "track_build"
  | "show_car"
  | "off_road"
  | "jdm_build"
  | "restomod"
  | "stance_build"
  | "just_browsing";
export type NotificationCategory =
  | "new_follower"
  | "build_update"
  | "event_reminder"
  | "marketplace_offer_received"
  | "marketplace_offer_accepted"
  | "marketplace_sale_complete"
  | "subscription_expiring"
  | "subscription_expired"
  | "build_of_the_week"
  | "service_request_received"
  | "service_request_update"
  // D-61
  | "post_like"
  | "post_comment"
  | "club_event"
  // D-62
  | "recall"
  | "wishlist_match"
  // D-64
  | "record_confirm_request"
  | "record_confirm_answer";

type Ts = string;

export type UserRow = {
  id: string;
  /** null until chosen right after email verification */
  username: string | null;
  display_name: string | null;
  bio: string | null;
  general_location: string | null;
  years_experience: number | null;
  avatar_path: string | null;
  build_goal: BuildGoal | null;
  /** the little car person: "head:outfit:prop" (src/domain/gear.ts), null = dressed for build_goal */
  driver_gear: string | null;
  onboarding_step: number;
  onboarding_completed_at: Ts | null;
  onboarding_skipped_at: Ts | null;
  default_visibility: Visibility;
  reputation: number;
  business_badge: boolean;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
  /** moderation hide, server only */
  hidden_at: Ts | null;
};
export type VehicleRow = {
  id: string;
  owner_id: string;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  nickname: string | null;
  vin: string | null;
  odometer: number | null;
  odometer_unit: "mi" | "km";
  description: string | null;
  baseline_hp: number | null;
  baseline_torque_lbft: number | null;
  baseline_weight_lb: number | null;
  baseline_zero_to_sixty_s: number | null;
  baseline_source: "user_reported" | "external" | null;
  /** stock numbers filled from factory specs (set by the database, never by the app) */
  baseline_looked_up: string[];
  /** what matched, e.g. "2015–2021 Subaru WRX" (null when nothing was looked up) */
  baseline_lookup_label: string | null;
  data_source: "manual" | "nhtsa";
  nhtsa_make_id: number | null;
  nhtsa_model_id: number | null;
  /** set only by the register-photo Edge Function */
  hero_path: string | null;
  visibility: Visibility;
  client_ref: string | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
  hidden_at: Ts | null;
  /** D-64, server only: handed to a buyer (this copy is read-only) */
  sold_at?: Ts | null;
  /** D-64, server only: came from an earlier owner through a transfer */
  received_at?: Ts | null;
  previous_owners?: number;
  /** D-64, server only: a buyer's link or transfer code exists, so the VIN can't change */
  vin_locked_at?: Ts | null;
  /** D-68: what the owner plans to spend on the car (private, like costs), in minor units */
  budget_minor?: number | null;
  /** D-71: missing on rows saved before it existed, which are cars (domain/vehicleKind kindOf) */
  kind?: VehicleKind;
  /** D-71, e-bikes only: stock motor (nominal watts), battery, claimed range and assisted top speed */
  motor_w?: number | null;
  battery_wh?: number | null;
  range_mi?: number | string | null;
  top_speed_mph?: number | string | null;
  /** D-72: motorcycles */
  engine_cc?: number | null;
  /** D-72, e-bikes: US class 1-3, and the frame serial (private like a VIN, never in a public view) */
  ebike_class?: number | null;
  frame_serial?: string | null;
  /** D-73, e-motos: pack voltage, and plated for the road (true) or off-road only (false) */
  battery_v?: number | null;
  street_legal?: boolean | null;
  budget_currency?: string | null;
};
export type BuildRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  featured: boolean;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
};
export type ModRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  name: string;
  category: ModCategory;
  brand: string | null;
  part_number: string | null;
  cost_minor: number | null;
  currency: string | null;
  status: ModStatus;
  spec_deltas: { schema_version: 1 } & Record<string, unknown>;
  notes: string | null;
  installed_on: string | null;
  /** D-62: who fitted it (a shop or "self"), for the insurance list. Private. */
  installed_by?: string | null;
  /** D-68: the car's mileage when it was fitted; on the Build Record, moves the odometer up */
  installed_odometer?: number | null;
  /** D-64: emissions status, for engine / exhaust / electronics parts */
  compliance?: Compliance | null;
  carb_eo?: string | null;
  /** D-64, server only: copied from an earlier owner's record (read-only) */
  inherited_at?: Ts | null;
  status_changed_at: Ts;
  client_ref: string | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
  hidden_at: Ts | null;
};
export type ModPhotoRow = {
  id: string;
  owner_id: string;
  mod_id: string;
  storage_path: string;
  role: "before" | "after" | "gallery";
  position: number;
  mime: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
  width: number | null;
  height: number | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
};
export type FollowRow = {
  follower_id: string;
  followee_id: string;
  created_at: Ts;
};
export type BuildFollowRow = {
  user_id: string;
  build_id: string;
  created_at: Ts;
};
export type ReportTarget =
  | "user"
  | "vehicle"
  | "build"
  | "mod"
  | "route"
  | "event"
  | "club"
  | "post"
  | "comment"
  | "listing"
  | "business"
  | "room_message"
  | "event_photo";
export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual_content"
  | "violence"
  | "impersonation"
  | "scam"
  | "unsafe_activity"
  | "other";
export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";
export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: Ts;
};
export type MuteRow = {
  muter_id: string;
  muted_id: string;
  created_at: Ts;
};
/** Only the columns a reporter may read (column GRANT): no details, no reporter id. */
export type ReportRow = {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: ReportReason;
  status: ReportStatus;
  created_at: Ts;
};
export type WishlistItemRow = {
  id: string;
  owner_id: string;
  vehicle_id: string | null;
  name: string;
  url: string | null;
  price_minor: number | null;
  currency: string | null;
  notes: string | null;
  is_affiliate: boolean;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
};
export type SpecEstimateRow = {
  hp: number | null;
  hp_status: "estimate" | "unknown" | "invalid";
  torque_lbft: number | null;
  torque_status: "estimate" | "unknown" | "invalid";
  weight_lb: number | null;
  weight_status: "estimate" | "unknown" | "invalid";
  zero_to_sixty_s: number | null;
  zero_to_sixty_status: "estimate" | "unknown" | "invalid";
  lb_per_hp: number | null;
  lb_per_hp_status: "estimate" | "unknown" | "invalid";
  completed_mods_counted: number;
  pending_hp_delta: number;
  pending_torque_delta: number;
  pending_weight_delta: number;
  pending_zero_to_sixty_delta: number;
};
export type CostSummaryRow = {
  currency: string;
  category: ModCategory;
  spent_minor: number;
  planned_minor: number;
  mods: number;
};
export type NotificationRow = {
  id: string;
  recipient_id: string;
  category: NotificationCategory;
  entity_type:
    "user" | "build" | "mod" | "event" | "listing" | "subscription" | "botw" | "business" | "service_request";
  entity_id: string;
  title: string;
  body: string;
  read_at: Ts | null;
  created_at: Ts;
  actor_id: string | null;
  push_sent_at: Ts | null;
};
export type NotificationPrefRow = {
  user_id: string;
  category: NotificationCategory;
  enabled: boolean;
  updated_at: Ts;
};
/** Row of the public_builds view (also returned by discover_builds / nearby_builds). */
export type PublicBuild = {
  build_id: string;
  vehicle_id: string;
  owner_username: string;
  title: string;
  description: string | null;
  updated_at: Ts;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  nickname: string | null;
  has_hero: boolean;
  followers_count: number;
  mods_count: number;
  last_activity_at: Ts | null;
  /** D-71 (absent before it, which means a car) */
  kind?: VehicleKind;
  motor_w?: number | null;
  battery_wh?: number | null;
  range_mi?: number | string | null;
  top_speed_mph?: number | string | null;
  /** D-72 */
  engine_cc?: number | null;
  ebike_class?: number | null;
  /** D-73 */
  battery_v?: number | null;
  street_legal?: boolean | null;
};
export type PublicSpecRow = Omit<
  SpecEstimateRow,
  "pending_hp_delta" | "pending_torque_delta" | "pending_weight_delta" | "pending_zero_to_sixty_delta"
>;
export type FeedItem = {
  mod_id: string;
  vehicle_id: string;
  build_title: string;
  owner_username: string;
  mod_name: string;
  category: ModCategory;
  status: ModStatus;
  created_at: Ts;
};
export type SearchHit = {
  kind: "build" | "user" | "mod" | "route" | "event" | "club";
  id: string;
  vehicle_id: string | null;
  label: string;
  sublabel: string;
  has_hero: boolean;
  exact: boolean;
  followers: number;
  updated_at: Ts | null;
};

// ---------------------------------------------------------------- Phase 5
export type StickerKind =
  | "hype"
  | "wrenching"
  | "burnout"
  | "shrug"
  | "thumbs_up"
  | "fire"
  | "cop_spotted"
  | "rev_limiter"
  | "track_ready"
  | "sleeping"
  | "money_eyes"
  | "wave";
export type MySubscriptionRow = {
  plus: boolean;
  status: "active" | "cancelled" | "grace" | "billing_retry" | "expired" | "refunded" | "revoked" | null;
  product_id: string | null;
  platform: "app_store" | "play_store" | null;
  expires_at: Ts | null;
  grace_until: Ts | null;
  will_renew: boolean;
  via_override: boolean;
};
export type CapabilitiesRow = {
  plus: boolean;
  vehicle_limit: number | null;
  mods_per_vehicle_limit: number | null;
  route_recordings_per_month: number | null;
  advanced_specs: boolean;
  build_analytics: boolean;
  priority_listings: boolean;
  torq_stickers: boolean;
  profile_badge: boolean;
  early_access: boolean;
};
export type AdvancedSpecs = {
  projected: {
    hp: number | null;
    torque_lbft: number | null;
    weight_lb: number | null;
    zero_to_sixty_s: number | null;
    lb_per_hp: number | null;
  };
  by_category: { category: ModCategory; hp: number; torque_lbft: number; weight_lb: number; mods: number }[];
  pending_mods: number;
};
export type BuildAnalyticsRow = {
  views_7d: number;
  views_30d: number;
  followers: number;
  new_followers_7d: number;
  new_followers_30d: number;
  reactions: number;
};

// ---------------------------------------------------------------- Phase 7 (Line, Paddock)
export type RouteRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  points: [number, number, number][];
  distance_m: number;
  duration_s: number;
  started_at: Ts;
  ended_at: Ts;
  public_points: [number, number][] | null;
  start_cell_lat: number | null;
  start_cell_lon: number | null;
  client_ref: string | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
  hidden_at: Ts | null;
};
export type PublicRoute = {
  route_id: string;
  owner_username: string;
  title: string;
  description: string | null;
  distance_m: number;
  duration_s: number;
  drive_date: string;
  points: [number, number][];
  created_at: Ts;
  rating_avg: number | null;
  rating_count: number;
};
export type EventStatus = "scheduled" | "cancelled";
export type RsvpStatus = "going" | "interested";
export type PublicEvent = {
  event_id: string;
  organizer_username: string;
  title: string;
  description: string | null;
  starts_at: Ts;
  ends_at: Ts;
  location_text: string;
  capacity: number | null;
  status: EventStatus;
  going_count: number;
  interested_count: number;
  kind: EventKind;
  /** null unless the linked route is still public */
  route_id: string | null;
  club_id: string | null;
  /** the host-picked meeting place (both or neither) */
  place_lat: number | null;
  place_lng: number | null;
};
export type EventKind = "meet" | "drive";
export type EventRow = {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  starts_at: Ts;
  ends_at: Ts;
  location_text: string;
  capacity: number | null;
  status: EventStatus;
  kind: EventKind;
  route_id: string | null;
  club_id: string | null;
  place_lat: number | null;
  place_lng: number | null;
  /** shared by every date of a repeating meet (D-60); null for one-off events */
  series_id: string | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
  hidden_at: Ts | null;
};

// ---------------------------------------------------------------- Phase 7b (Paddock community)
export type ClubRole = "owner" | "moderator" | "member";
export type PublicClub = {
  club_id: string;
  name: string;
  description: string | null;
  owner_username: string;
  created_at: Ts;
  members_count: number;
  /** private clubs list publicly, but their posts are for members only and joining needs approval */
  visibility: "public" | "private";
};
export type MyClub = { club_id: string; name: string; role: ClubRole; members_count: number };
export type PublicPost = {
  post_id: string;
  author_username: string;
  club_id: string | null;
  club_name: string | null;
  body: string;
  /** null unless the linked build is still public */
  build_vehicle_id: string | null;
  created_at: Ts;
  likes_count: number;
  comments_count: number;
};
export type PublicComment = {
  comment_id: string;
  post_id: string;
  author_username: string;
  body: string | null;
  sticker: StickerKind | null;
  created_at: Ts;
};

// ---------------------------------------------------------------- Shop (D-56: no payments)
export type ListingCondition = "new" | "like_new" | "used" | "for_parts";
export type ListingStatus = "active" | "pending" | "sold";
export type OfferStatus = "open" | "accepted" | "declined" | "withdrawn";
export type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  category: ModCategory;
  condition: ListingCondition;
  price_minor: number;
  currency: string;
  fits: string | null;
  location_text: string;
  photo_path: string | null;
  status: ListingStatus;
  sold_at: Ts | null;
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
};
export type PublicListing = {
  listing_id: string;
  seller_username: string;
  title: string;
  description: string | null;
  category: ModCategory;
  condition: ListingCondition;
  price_minor: number;
  currency: string;
  fits: string | null;
  location_text: string;
  has_photo: boolean;
  status: ListingStatus;
  created_at: Ts;
  /** a Dynorex+ seller's listing in its first 3 days */
  boosted: boolean;
};
export type MyListing = {
  listing_id: string;
  title: string;
  category: ModCategory;
  condition: ListingCondition;
  price_minor: number;
  currency: string;
  fits: string | null;
  location_text: string;
  description: string | null;
  photo_path: string | null;
  status: ListingStatus;
  created_at: Ts;
  open_offers: number;
};
export type ListingOffer = {
  offer_id: string;
  buyer_username: string;
  amount_minor: number;
  note: string | null;
  status: OfferStatus;
  created_at: Ts;
};
export type MyOffer = {
  offer_id: string;
  listing_id: string;
  listing_title: string;
  seller_username: string;
  amount_minor: number;
  currency: string;
  note: string | null;
  status: OfferStatus;
  listing_status: ListingStatus;
  created_at: Ts;
};
export type OfferMessage = { message_id: string; mine: boolean; sender_username: string; body: string; created_at: Ts };
export type ListingInput = Pick<
  ListingRow,
  "title" | "description" | "category" | "condition" | "price_minor" | "fits" | "location_text"
>;

// ---------------------------------------------------------------- Services (D-57: no payments)
export type ServicePriceType = "fixed" | "from" | "quote";
export type ServiceRequestStatus = "open" | "accepted" | "declined" | "cancelled" | "completed";
export type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  about: string | null;
  location_text: string;
  website: string | null;
  phone: string | null;
  specialties: ModCategory[];
  created_at: Ts;
  updated_at: Ts;
  deleted_at: Ts | null;
};
export type BusinessInput = Pick<BusinessRow, "name" | "about" | "location_text" | "website" | "phone" | "specialties">;
export type BusinessServiceRow = {
  id: string;
  business_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  category: ModCategory;
  price_type: ServicePriceType;
  price_minor: number | null;
  currency: string;
  created_at: Ts;
  deleted_at: Ts | null;
};
export type ServiceInput = Pick<BusinessServiceRow, "name" | "description" | "category" | "price_type" | "price_minor">;
export type PublicBusiness = {
  business_id: string;
  owner_username: string;
  name: string;
  about: string | null;
  location_text: string;
  website: string | null;
  phone: string | null;
  specialties: ModCategory[];
  /** the staff-granted business badge; nothing else is checked by Dynorex */
  verified: boolean;
  created_at: Ts;
  services_count: number;
  /** requests the shop marked done (owner-reported) */
  jobs_completed: number;
};
export type PublicBusinessService = {
  service_id: string;
  business_id: string;
  name: string;
  description: string | null;
  category: ModCategory;
  price_type: ServicePriceType;
  price_minor: number | null;
  currency: string;
};
export type ServiceRequestDetail = {
  request_id: string;
  role: "business" | "customer";
  business_id: string;
  business_name: string;
  service_name: string | null;
  customer_username: string;
  vehicle_text: string | null;
  preferred_date: string | null;
  message: string;
  status: ServiceRequestStatus;
  created_at: Ts;
};
export type BusinessRequest = {
  request_id: string;
  service_name: string | null;
  customer_username: string;
  vehicle_text: string | null;
  preferred_date: string | null;
  status: ServiceRequestStatus;
  created_at: Ts;
};
export type MyServiceRequest = {
  request_id: string;
  business_id: string;
  business_name: string;
  service_name: string | null;
  preferred_date: string | null;
  status: ServiceRequestStatus;
  created_at: Ts;
};

// ---------------------------------------------------------------- D-58 (garage and community)
export type MaintenanceRecord = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  title: string;
  done_on: string;
  odometer: number | null;
  cost_minor: number | null;
  currency: string;
  notes: string | null;
  next_due_on: string | null;
  next_due_odometer: number | null;
  created_at: Ts;
  deleted_at: Ts | null;
  /** D-64, server only: copied from an earlier owner's record (read-only) */
  inherited_at?: Ts | null;
};
export type MaintenanceInput = Pick<
  MaintenanceRecord,
  "title" | "done_on" | "odometer" | "cost_minor" | "notes" | "next_due_on" | "next_due_odometer"
>;
export type RoomType = "event" | "club";
export type RoomMessage = {
  message_id: string;
  mine: boolean;
  sender_username: string;
  body: string;
  created_at: Ts;
  can_remove: boolean;
};
export type ClubStatus = "owner" | "moderator" | "member" | "requested" | "none";
export type ClubMember = { username: string; role: ClubRole; joined_at: Ts };
export type SaveKind = "post" | "event" | "route" | "listing" | "business" | "build";
export type SaveRow = { user_id: string; kind: SaveKind; target_id: string; created_at: Ts };
export type VehiclePhotoRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  storage_path: string;
  position: number;
  width: number | null;
  height: number | null;
  created_at: Ts;
};

// ---------------------------------------------------------------- D-61 (owner upgrades)
/** A private receipt photo on one mod or one maintenance record (written by register-photo only). */
export type ReceiptRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  mod_id: string | null;
  maintenance_id: string | null;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: Ts;
  /** D-64: fingerprint of the file as uploaded */
  sha256?: string | null;
  inherited_at?: Ts | null;
};

// ---------------------------------------------------------------- D-64 (Build Record)
export type Compliance = "not_emissions_related" | "carb_eo" | "off_road_only" | "stock" | "unknown";
export type RecordEntryType = "mod" | "maintenance" | "dyno";
export type RecordConfirmation = {
  decision: "confirmed" | "declined";
  /** a Dynorex shop answering from its account, or whoever opened a one-time link */
  via: "shop_account" | "link";
  shop_name: string;
  shop_city: string | null;
  odometer: number | null;
  note: string | null;
  at: Ts;
  /** how many edits the entry had when the shop answered */
  version: number;
};
export type RecordEntry = {
  type: RecordEntryType;
  id: string;
  title: string;
  category: ModCategory | null;
  brand: string | null;
  part_number: string | null;
  compliance: Compliance | null;
  carb_eo: string | null;
  /** mods: who fitted it; dyno: the shop that ran it */
  installed_by: string | null;
  date: string;
  odometer: number | null;
  whp: number | null;
  wtq: number | null;
  dyno: string | null;
  correction: string | null;
  logged_at: Ts;
  removed_at: Ts | null;
  /** a finished mod that was set back to planned or in progress */
  reopened: boolean;
  earlier_owner: boolean;
  has_sheet: boolean;
  version: number;
  revisions: { at: Ts; changed: string[] }[];
  receipts: { uploaded_at: Ts; sha256: string | null }[];
  confirmation: RecordConfirmation | null;
};
/** A car's Build Record: the owner's view (my_build_record) and a buyer's (build_record). No VIN, costs, notes, owner. */
export type BuildRecord = {
  car: { year: number; make: string; model: string; trim: string | null };
  odometer: number | null;
  odometer_unit: "mi" | "km";
  owners: number;
  owner_since: Ts;
  sold_at: Ts | null;
  /** buyer's link only */
  expires_at?: Ts;
  entries: RecordEntry[];
};
export type VinCheck = "match" | "no_match" | "no_vin_on_record" | "too_many" | "not_found";
export type ConfirmLinkStatus = "open" | "closed" | "expired" | "changed" | "not_found";
export type ConfirmAnswer = ConfirmLinkStatus | "ok" | "not_allowed";
/** What a shop is shown about a job: the car and the work only. */
export type ConfirmJob = {
  car: BuildRecord["car"];
  entry_type: "mod" | "maintenance";
  entry: {
    title: string;
    category?: ModCategory;
    brand?: string | null;
    part_number?: string | null;
    carb_eo?: string | null;
    compliance?: Compliance | null;
    installed_by?: string | null;
    date: string | null;
    odometer?: number | null;
  };
};
export type ShopConfirmRequest = {
  request_id: string;
  requested_at: Ts;
  customer: string | null;
  job: ConfirmJob;
  status: ConfirmLinkStatus;
};
export type MyConfirmRequest = {
  entry_type: "mod" | "maintenance";
  entry_id: string;
  business_name: string | null;
  token: string | null;
  expires_at: Ts;
};
export type ClaimStatus = "ok" | "code_invalid" | "vin_mismatch" | "own_car" | "rate_limited" | "plan_limit" | "failed";

/** What a buyer sees behind a service-history link: no VIN, costs, notes or owner. */
export type ServiceHistory = {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  odometer: number | null;
  odometer_unit: "mi" | "km";
  expires_at: Ts;
  mods: { name: string; category: ModCategory; brand: string | null; installed_on: string | null; receipt: boolean }[];
  maintenance: { title: string; done_on: string; odometer: number | null; receipt: boolean }[];
};
export type PublicEventPhoto = {
  photo_id: string;
  event_id: string;
  owner_username: string;
  width: number | null;
  height: number | null;
  created_at: Ts;
};
/** Road review aspects, 1-5 each. Traffic: 5 = empty road, 1 = heavy traffic. */
export type RouteAspects = { scenery: number | null; surface: number | null; traffic: number | null };
export type RouteReview = RouteAspects & { username: string; stars: number; comment: string | null; updated_at: Ts };
export type RouteReviewSummary = {
  reviews: number;
  stars: number | null;
  scenery: number | null;
  surface: number | null;
  traffic: number | null;
};

// ---------------------------------------------------------------- D-62 (research picks)
/** An NHTSA recall for a car's make, model and year. "May affect": the owner checks with a dealer by VIN. */
export type VehicleRecall = {
  campaign: string;
  component: string | null;
  summary: string | null;
  consequence: string | null;
  remedy: string | null;
  reported_on: string | null;
  park_it: boolean;
  dismissed: boolean;
};
export type DynoBrand = "dynojet" | "mustang" | "dynapack" | "mainline" | "superflow" | "other";
export type DynoCorrection = "sae" | "std" | "uncorrected" | "unknown";
export type DynoResultRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  measured_on: string;
  dyno: DynoBrand;
  correction: DynoCorrection;
  shop: string | null;
  whp: number;
  wtq: number | null;
  fuel: string | null;
  notes: string | null;
  sheet_path: string | null;
  shared: boolean;
  created_at: Ts;
  /** D-64, server only: copied from an earlier owner's record (read-only) */
  inherited_at?: Ts | null;
};
export type DynoResultInput = Pick<DynoResultRow, "vehicle_id" | "measured_on" | "dyno" | "correction" | "whp"> &
  Partial<Pick<DynoResultRow, "shop" | "wtq" | "fuel" | "notes" | "shared">>;
export type PublicDynoResult = Pick<
  DynoResultRow,
  "vehicle_id" | "measured_on" | "dyno" | "correction" | "shop" | "whp" | "wtq" | "fuel"
> & {
  result_id: string;
  /** D-63: a photo of the shop's sheet is on file (the photo stays private) */ has_sheet: boolean;
};
export type LapSource = "racechrono" | "harrys" | "trackaddict" | "aim" | "other" | "manual";
export type TrackLapRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  track: string;
  lap_ms: number;
  driven_on: string;
  source: LapSource;
  notes: string | null;
  shared: boolean;
  created_at: Ts;
};
export type TrackLapInput = Pick<TrackLapRow, "vehicle_id" | "track" | "lap_ms" | "driven_on" | "source"> &
  Partial<Pick<TrackLapRow, "notes" | "shared">>;
export type PublicTrackLap = Pick<TrackLapRow, "vehicle_id" | "track" | "lap_ms" | "driven_on" | "source"> & {
  lap_id: string;
};

// ---------------------------------------------------------------- D-60 (prove it)
export type PerfQuality = "good" | "fair" | "rough";
export type PerfRunRow = {
  id: string;
  owner_id: string;
  vehicle_id: string;
  ran_at: Ts;
  zero_sixty_s: number | null;
  quarter_s: number | null;
  trap_mph: number | null;
  est_whp: number | null;
  weight_lb: number | null;
  sample_hz: number;
  quality: PerfQuality;
  note: string | null;
  shared: boolean;
  /** [[ms, mph], ...] from launch; owner only */
  samples: [number, number][];
  created_at: Ts;
  deleted_at: Ts | null;
};
export type PerfRunInput = Omit<PerfRunRow, "id" | "owner_id" | "created_at" | "deleted_at">;
export type PublicPerfRun = Pick<
  PerfRunRow,
  "vehicle_id" | "ran_at" | "zero_sixty_s" | "quarter_s" | "trap_mph" | "est_whp" | "sample_hz" | "quality"
> & { run_id: string };
export type FitmentRow = {
  name: string;
  brand: string | null;
  category: string;
  owners: number;
  vehicle_ids: string[];
};
export type DrivePosition = {
  username: string;
  lat: number;
  lng: number;
  heading: number | null;
  seconds_ago: number;
  mine: boolean;
};
export type RepeatRule = "weekly" | "biweekly" | "monthly";

/** Columns a client may write, mirroring the column GRANTs in the migration. */
type Writable<R, K extends keyof R> = Partial<Pick<R, K>>;

/** Clients have no rights to write this (no column GRANT). */
type NoWrite = { [key: string]: never };

type Table<R, I, U> = { Row: R; Insert: I; Update: U; Relationships: [] };
type View<R> = { Row: R; Relationships: [] };

export type Database = {
  // supabase-js reads this to pick the right PostgREST behaviour
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      // profile rows are created by the sign-up trigger; clients only update them
      users: Table<
        UserRow,
        NoWrite,
        Writable<
          UserRow,
          | "username"
          | "display_name"
          | "bio"
          | "general_location"
          | "years_experience"
          | "avatar_path"
          | "build_goal"
          | "onboarding_step"
          | "onboarding_completed_at"
          | "onboarding_skipped_at"
          | "default_visibility"
          | "driver_gear"
        >
      >;
      vehicles: Table<
        VehicleRow,
        Pick<VehicleRow, "year" | "make" | "model"> &
          Writable<
            VehicleRow,
            Exclude<
              keyof VehicleRow,
              | "id"
              | "owner_id"
              | "created_at"
              | "updated_at"
              | "deleted_at"
              | "year"
              | "make"
              | "model"
              | "hero_path"
              | "budget_minor"
              | "budget_currency"
            >
          >,
        Writable<
          VehicleRow,
          Exclude<
            keyof VehicleRow,
            "id" | "owner_id" | "created_at" | "updated_at" | "deleted_at" | "hero_path" | "client_ref"
          >
        >
      >;
      builds: Table<
        BuildRow,
        Pick<BuildRow, "vehicle_id" | "title"> & Writable<BuildRow, "description" | "visibility">,
        Writable<BuildRow, "title" | "description" | "visibility">
      >;
      mods: Table<
        ModRow,
        Pick<ModRow, "vehicle_id" | "name" | "category"> &
          Writable<
            ModRow,
            | "brand"
            | "part_number"
            | "cost_minor"
            | "currency"
            | "status"
            | "spec_deltas"
            | "notes"
            | "installed_on"
            | "installed_by"
            | "installed_odometer"
            | "compliance"
            | "carb_eo"
            | "client_ref"
          >,
        Writable<
          ModRow,
          | "name"
          | "category"
          | "brand"
          | "part_number"
          | "cost_minor"
          | "currency"
          | "status"
          | "spec_deltas"
          | "notes"
          | "installed_on"
          | "installed_by"
          | "installed_odometer"
          | "compliance"
          | "carb_eo"
        >
      >;
      mod_photos: Table<
        ModPhotoRow,
        Pick<ModPhotoRow, "mod_id" | "storage_path" | "mime" | "bytes"> &
          Writable<ModPhotoRow, "role" | "position" | "width" | "height">,
        Writable<ModPhotoRow, "role" | "position">
      >;
      follows: Table<FollowRow, Pick<FollowRow, "followee_id">, NoWrite>;
      build_follows: Table<BuildFollowRow, Pick<BuildFollowRow, "build_id">, NoWrite>;
      notifications: Table<NotificationRow, NoWrite, Pick<NotificationRow, "read_at">>;
      // written only through set_notification_pref()
      notification_prefs: Table<NotificationPrefRow, NoWrite, NoWrite>;
      // Phase 5: insert allowed for Dynorex+ only (RLS); select returns your own reactions
      // Phase 7: routes written only through save_route(); events by organizers; RSVPs through rsvp_event()
      routes: Table<RouteRow, NoWrite, NoWrite>;
      route_ratings: Table<
        {
          route_id: string;
          user_id: string;
          stars: number;
          comment: string | null;
          created_at: Ts;
          updated_at: Ts;
        } & RouteAspects,
        { route_id: string; stars: number; comment?: string | null } & Partial<RouteAspects>,
        { stars?: number; comment?: string | null } & Partial<RouteAspects>
      >;
      events: Table<
        EventRow,
        Pick<EventRow, "title" | "starts_at" | "ends_at" | "location_text"> &
          Partial<
            Pick<EventRow, "description" | "capacity" | "kind" | "route_id" | "club_id" | "place_lat" | "place_lng">
          >,
        Partial<
          Pick<
            EventRow,
            | "title"
            | "description"
            | "starts_at"
            | "ends_at"
            | "location_text"
            | "capacity"
            | "kind"
            | "route_id"
            | "place_lat"
            | "place_lng"
          >
        >
      >;
      // Phase 7b: clubs/memberships written only through functions; posts, comments, likes by RLS
      clubs: Table<
        { id: string; owner_id: string; name: string; description: string | null; created_at: Ts },
        NoWrite,
        { description?: string | null; visibility?: "public" | "private" }
      >;
      club_members: Table<{ club_id: string; user_id: string; role: ClubRole; joined_at: Ts }, NoWrite, NoWrite>;
      posts: Table<
        { id: string; author_id: string; club_id: string | null; body: string; build_vehicle_id: string | null },
        { body: string; club_id?: string | null; build_vehicle_id?: string | null },
        NoWrite
      >;
      comments: Table<
        { id: string; post_id: string; author_id: string; body: string | null; sticker: StickerKind | null },
        { post_id: string; body?: string | null; sticker?: StickerKind | null },
        NoWrite
      >;
      post_likes: Table<{ post_id: string; user_id: string; created_at: Ts }, { post_id: string }, NoWrite>;
      event_rsvps: Table<{ event_id: string; user_id: string; status: RsvpStatus; created_at: Ts }, NoWrite, NoWrite>;
      event_checkins: Table<{ event_id: string; user_id: string; checked_in_at: Ts; method: string }, NoWrite, NoWrite>;
      build_reactions: Table<
        { build_id: string; user_id: string; sticker: StickerKind; created_at: Ts },
        { build_id: string; sticker: StickerKind },
        NoWrite
      >;
      wishlist_items: Table<
        WishlistItemRow,
        Pick<WishlistItemRow, "name"> &
          Writable<WishlistItemRow, "vehicle_id" | "url" | "price_minor" | "currency" | "notes">,
        Writable<WishlistItemRow, "vehicle_id" | "name" | "url" | "price_minor" | "currency" | "notes">
      >;
      // Shop: status and photo change only through functions / register-photo
      listings: Table<ListingRow, ListingInput & { currency?: string }, Partial<ListingInput>>;
      listing_offers: Table<
        {
          id: string;
          listing_id: string;
          buyer_id: string;
          amount_minor: number;
          note: string | null;
          status: OfferStatus;
          created_at: Ts;
        },
        NoWrite,
        NoWrite
      >;
      listing_messages: Table<
        { id: string; offer_id: string; sender_id: string; body: string; created_at: Ts },
        NoWrite,
        NoWrite
      >;
      // Services: requests and their chat are written only through functions
      businesses: Table<BusinessRow, BusinessInput, Partial<BusinessInput>>;
      business_services: Table<
        BusinessServiceRow,
        ServiceInput & { business_id: string; currency?: string },
        Partial<ServiceInput>
      >;
      service_requests: Table<{ id: string; customer_id: string; status: ServiceRequestStatus }, NoWrite, NoWrite>;
      service_request_messages: Table<
        { id: string; request_id: string; sender_id: string; body: string },
        NoWrite,
        NoWrite
      >;
      maintenance_records: Table<
        MaintenanceRecord,
        MaintenanceInput & { vehicle_id: string; currency?: string },
        Partial<MaintenanceInput>
      >;
      saves: Table<SaveRow, Pick<SaveRow, "kind" | "target_id">, NoWrite>;
      vehicle_photos: Table<VehiclePhotoRow, NoWrite, NoWrite>;
      // D-62
      dyno_results: Table<DynoResultRow, DynoResultInput, Partial<Omit<DynoResultInput, "vehicle_id">>>;
      track_laps: Table<TrackLapRow, TrackLapInput, Partial<Omit<TrackLapInput, "vehicle_id">>>;
      recall_dismissals: Table<{ vehicle_id: string; owner_id: string; campaign: string }, NoWrite, NoWrite>;
      // D-61: both written only by register-photo; you read your own
      receipts: Table<ReceiptRow, NoWrite, NoWrite>;
      event_photos: Table<
        { id: string; event_id: string; owner_id: string; storage_path: string; created_at: Ts },
        NoWrite,
        NoWrite
      >;
      perf_runs: Table<PerfRunRow, PerfRunInput, Partial<Pick<PerfRunRow, "note" | "shared">>>;
      room_messages: Table<{ id: string; sender_id: string; body: string }, NoWrite, NoWrite>;
      club_join_requests: Table<{ club_id: string; user_id: string; created_at: Ts }, NoWrite, NoWrite>;
      blocks: Table<BlockRow, Pick<BlockRow, "blocked_id">, NoWrite>;
      mutes: Table<MuteRow, Pick<MuteRow, "muted_id">, NoWrite>;
      reports: Table<
        ReportRow,
        { target_type: ReportTarget; target_id: string; reason: ReportReason; details?: string | null },
        NoWrite
      >;
    };
    Views: {
      public_profiles: View<{
        user_id: string;
        username: string;
        display_name: string | null;
        bio: string | null;
        general_location: string | null;
        years_experience: number | null;
        build_goal: BuildGoal | null;
        reputation: number;
        business_badge: boolean;
        followers_count: number;
        following_count: number;
        /** server-computed Dynorex+ badge */
        plus_member: boolean;
        /** "head:outfit:prop" or null (dressed for the build goal) */
        driver_gear: string | null;
      }>;
      public_build_reactions: View<{ build_id: string; sticker: StickerKind; reactions: number }>;
      public_routes: View<PublicRoute>;
      public_events: View<PublicEvent>;
      public_perf_runs: View<PublicPerfRun>;
      public_clubs: View<PublicClub>;
      public_posts: View<PublicPost>;
      public_comments: View<PublicComment>;
      public_listings: View<PublicListing>;
      public_vehicle_photos: View<{
        photo_id: string;
        vehicle_id: string;
        position: number;
        width: number | null;
        height: number | null;
      }>;
      public_event_photos: View<PublicEventPhoto>;
      public_dyno_results: View<PublicDynoResult>;
      public_track_laps: View<PublicTrackLap>;
      public_businesses: View<PublicBusiness>;
      public_business_services: View<PublicBusinessService>;
      public_vehicles: View<{
        vehicle_id: string;
        owner_username: string;
        year: number;
        make: string;
        model: string;
        trim_level: string | null;
        nickname: string | null;
        created_at: Ts;
        has_hero: boolean;
      }>;
      public_builds: View<PublicBuild>;
      public_mod_photos: View<{
        photo_id: string;
        mod_id: string;
        vehicle_id: string;
        role: "before" | "after" | "gallery";
        position: number;
        width: number | null;
        height: number | null;
      }>;
      public_build_of_the_week: View<{
        week_start: string;
        build_id: string;
        vehicle_id: string;
        owner_username: string;
        title: string;
        year: number;
        make: string;
        model: string;
        has_hero: boolean;
      }>;
      public_mods: View<{
        mod_id: string;
        vehicle_id: string;
        build_id: string;
        name: string;
        category: ModCategory;
        brand: string | null;
        part_number: string | null;
        status: ModStatus;
        installed_on: string | null;
        created_at: Ts;
      }>;
    };
    Functions: {
      soft_delete_vehicle: { Args: { p_vehicle_id: string }; Returns: boolean };
      soft_delete_mod: { Args: { p_mod_id: string }; Returns: boolean };
      current_user_verified: { Args: Record<string, never>; Returns: boolean };
      current_user_has_username: { Args: Record<string, never>; Returns: boolean };
      username_available: { Args: { p_username: string }; Returns: boolean };
      is_blocked_with: { Args: { other: string }; Returns: boolean };
      my_plan: {
        Args: Record<string, never>;
        Returns: { plus: boolean; vehicle_limit: number | null; mods_per_vehicle_limit: number | null }[];
      };
      vehicle_spec_estimate: { Args: { p_vehicle_id: string }; Returns: SpecEstimateRow[] };
      vehicle_cost_summary: { Args: { p_vehicle_id: string }; Returns: CostSummaryRow[] };
      soft_delete_mod_photo: { Args: { p_photo_id: string }; Returns: boolean };
      soft_delete_wishlist_item: { Args: { p_id: string }; Returns: boolean };
      // Phase 4
      publish_build: { Args: { p_vehicle_id: string; p_public: boolean }; Returns: string };
      share_build_link: { Args: { p_vehicle_id: string }; Returns: string };
      public_build_status: { Args: { p_vehicle_id: string }; Returns: "public" | "gone" | "not_found" };
      public_build_specs: { Args: { p_vehicle_id: string }; Returns: PublicSpecRow[] };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: number };
      set_notification_pref: { Args: { p_category: NotificationCategory; p_enabled: boolean }; Returns: boolean };
      register_push_token: { Args: { p_token: string; p_platform: "ios" | "android" }; Returns: boolean };
      unregister_push_token: { Args: { p_token: string }; Returns: boolean };
      my_push_status: { Args: Record<string, never>; Returns: { devices: number }[] };
      home_feed: { Args: { p_page: number }; Returns: FeedItem[] };
      discover_builds: { Args: { p_mode: "trending" | "new" | "for_you"; p_page: number }; Returns: PublicBuild[] };
      nearby_builds: { Args: { p_page: number }; Returns: PublicBuild[] };
      set_my_region: {
        Args: { p_cell_lat: number; p_cell_lon: number; p_share_builds: boolean };
        Returns: boolean;
      };
      clear_my_region: { Args: Record<string, never>; Returns: boolean };
      my_region: {
        Args: Record<string, never>;
        Returns: { enabled: boolean; share_builds: boolean; updated_at: Ts }[];
      };
      search_public: { Args: { p_query: string }; Returns: SearchHit[] };
      // Phase 5
      my_subscription: { Args: Record<string, never>; Returns: MySubscriptionRow[] };
      plan_capabilities: { Args: Record<string, never>; Returns: CapabilitiesRow[] };
      current_user_has_plus: { Args: Record<string, never>; Returns: boolean };
      advanced_spec_estimate: { Args: { p_vehicle_id: string }; Returns: AdvancedSpecs };
      my_build_analytics: { Args: { p_vehicle_id: string }; Returns: BuildAnalyticsRow[] };
      record_build_view: { Args: { p_vehicle_id: string }; Returns: undefined };
      // Phase 7
      save_route: {
        Args: {
          p_client_ref: string;
          p_title: string;
          p_description: string | null;
          p_points: unknown;
          p_public: boolean;
        };
        Returns: string;
      };
      set_route_public: { Args: { p_route: string; p_public: boolean }; Returns: boolean };
      soft_delete_route: { Args: { p_route: string }; Returns: boolean };
      discover_routes: { Args: { p_mode: "top" | "new" | "nearby"; p_page: number }; Returns: PublicRoute[] };
      upcoming_events: { Args: { p_page: number }; Returns: PublicEvent[] };
      rsvp_event: { Args: { p_event: string; p_status: RsvpStatus }; Returns: string };
      cancel_rsvp: { Args: { p_event: string }; Returns: boolean };
      cancel_event: { Args: { p_event: string }; Returns: boolean };
      // D-60
      soft_delete_perf_run: { Args: { p_run: string }; Returns: boolean };
      owner_fitment: {
        Args: { p_make: string; p_model: string; p_year: number; p_category?: string | null; p_terms?: string | null };
        Returns: FitmentRow[];
      };
      create_event_series: {
        Args: {
          p_title: string;
          p_description: string | null;
          p_starts_at: string;
          p_ends_at: string;
          p_location_text: string;
          p_capacity: number | null;
          p_kind: EventKind;
          p_route_id: string | null;
          p_club_id: string | null;
          p_place_lat: number | null;
          p_place_lng: number | null;
          p_repeat: RepeatRule;
          p_count: number;
        };
        Returns: string;
      };
      event_series_dates: { Args: { p_event: string }; Returns: { event_id: string; starts_at: Ts }[] };
      cancel_event_series: { Args: { p_event: string }; Returns: number };
      share_drive_position: {
        Args: { p_event: string; p_lat: number; p_lng: number; p_heading?: number | null };
        Returns: boolean;
      };
      stop_sharing_drive: { Args: { p_event: string }; Returns: boolean };
      drive_positions_for: { Args: { p_event: string }; Returns: DrivePosition[] };
      event_checkin_code: { Args: { p_event: string }; Returns: { code: string; expires_at: Ts }[] };
      check_in_event: { Args: { p_event: string; p_code: string }; Returns: boolean };
      event_attendance: {
        Args: { p_event: string };
        Returns: { going: number; interested: number; checked_in: number }[];
      };
      // Phase 7b
      create_club: { Args: { p_name: string; p_description: string | null }; Returns: string };
      join_club: { Args: { p_club: string }; Returns: boolean };
      leave_club: { Args: { p_club: string }; Returns: boolean };
      soft_delete_club: { Args: { p_club: string }; Returns: boolean };
      my_clubs: { Args: Record<string, never>; Returns: MyClub[] };
      is_club_member: { Args: { p_club: string }; Returns: boolean };
      soft_delete_post: { Args: { p_post: string }; Returns: boolean };
      soft_delete_comment: { Args: { p_comment: string }; Returns: boolean };
      my_route_usage: { Args: Record<string, never>; Returns: { used: number; monthly_limit: number | null }[] };
      paddock_feed: { Args: { p_mode: "following" | "all"; p_page: number }; Returns: PublicPost[] };
      // Torq chat: aggregated public community data (jsonb; shape in src/domain/torq.ts) and the rate limit
      mod_insights: { Args: { p_make: string; p_model: string; p_year: number | null }; Returns: unknown };
      lookup_stock_specs: {
        Args: { p_year: number; p_make: string; p_model: string; p_trim: string | null };
        Returns: unknown;
      };
      torq_chat_allow: { Args: Record<string, never>; Returns: boolean };
      // Shop
      soft_delete_listing: { Args: { p_listing: string }; Returns: boolean };
      make_offer: { Args: { p_listing: string; p_amount: number; p_note: string | null }; Returns: string };
      respond_offer: { Args: { p_offer: string; p_accept: boolean }; Returns: boolean };
      withdraw_offer: { Args: { p_offer: string }; Returns: boolean };
      set_listing_status: { Args: { p_listing: string; p_status: ListingStatus }; Returns: boolean };
      my_listings: { Args: Record<string, never>; Returns: MyListing[] };
      listing_offers_for: { Args: { p_listing: string }; Returns: ListingOffer[] };
      my_offers: { Args: Record<string, never>; Returns: MyOffer[] };
      offer_thread: { Args: { p_offer: string }; Returns: OfferMessage[] };
      send_offer_message: { Args: { p_offer: string; p_body: string }; Returns: string };
      // D-58
      soft_delete_maintenance: { Args: { p_id: string }; Returns: boolean };
      join_or_request_club: { Args: { p_club: string }; Returns: "joined" | "requested" };
      cancel_join_request: { Args: { p_club: string }; Returns: boolean };
      my_club_status: { Args: { p_club: string }; Returns: ClubStatus };
      club_member_list: { Args: { p_club: string }; Returns: ClubMember[] };
      club_join_requests_for: { Args: { p_club: string }; Returns: { username: string; created_at: Ts }[] };
      respond_join_request: { Args: { p_club: string; p_username: string; p_accept: boolean }; Returns: boolean };
      set_club_role: { Args: { p_club: string; p_username: string; p_role: "member" | "moderator" }; Returns: boolean };
      remove_club_member: { Args: { p_club: string; p_username: string }; Returns: boolean };
      club_remove_post: { Args: { p_post: string }; Returns: boolean };
      room_messages_for: { Args: { p_type: RoomType; p_room: string; p_before?: Ts | null }; Returns: RoomMessage[] };
      send_room_message: { Args: { p_type: RoomType; p_room: string; p_body: string }; Returns: string };
      remove_room_message: { Args: { p_message: string }; Returns: boolean };
      achievements: { Args: { p_username: string }; Returns: { id: string }[] };
      soft_delete_vehicle_photo: { Args: { p_photo: string }; Returns: boolean };
      set_cover_photo: { Args: { p_photo: string }; Returns: boolean };
      // Services
      soft_delete_business: { Args: { p_business: string }; Returns: boolean };
      soft_delete_business_service: { Args: { p_service: string }; Returns: boolean };
      request_service: {
        Args: { p_service: string; p_vehicle: string | null; p_date: string | null; p_message: string };
        Returns: string;
      };
      set_request_status: { Args: { p_request: string; p_status: ServiceRequestStatus }; Returns: boolean };
      service_request: { Args: { p_request: string }; Returns: ServiceRequestDetail[] };
      business_requests: { Args: Record<string, never>; Returns: BusinessRequest[] };
      my_service_requests: { Args: Record<string, never>; Returns: MyServiceRequest[] };
      request_thread: { Args: { p_request: string }; Returns: OfferMessage[] };
      send_request_message: { Args: { p_request: string; p_body: string }; Returns: string };
      // D-61
      soft_delete_receipt: { Args: { p_id: string }; Returns: boolean };
      create_history_share: { Args: { p_vehicle: string }; Returns: string };
      revoke_history_share: { Args: { p_vehicle: string }; Returns: boolean };
      my_history_share: { Args: { p_vehicle: string }; Returns: { token: string; expires_at: Ts }[] };
      service_history: { Args: { p_token: string }; Returns: ServiceHistory | null };
      can_add_event_photo: { Args: { p_event: string }; Returns: boolean };
      remove_event_photo: { Args: { p_photo: string }; Returns: boolean };
      my_removable_event_photos: { Args: { p_event: string }; Returns: string[] };
      route_review_summary: { Args: { p_route: string }; Returns: RouteReviewSummary[] };
      route_reviews: { Args: { p_route: string; p_page?: number }; Returns: RouteReview[] };
      // D-62
      my_vehicle_recalls: { Args: { p_vehicle: string }; Returns: VehicleRecall[] };
      set_recall_dismissed: { Args: { p_vehicle: string; p_campaign: string; p_dismissed: boolean }; Returns: boolean };
      soft_delete_dyno_result: { Args: { p_id: string }; Returns: boolean };
      soft_delete_track_lap: { Args: { p_id: string }; Returns: boolean };
      // D-63
      club_builds: { Args: { p_club: string }; Returns: PublicBuild[] };
      // D-64 (Build Record)
      my_build_record: { Args: { p_vehicle: string }; Returns: BuildRecord | null };
      build_record: { Args: { p_token: string }; Returns: BuildRecord | null };
      check_record_vin: { Args: { p_token: string; p_vin: string }; Returns: VinCheck };
      request_record_confirmation: {
        Args: { p_type: "mod" | "maintenance"; p_id: string; p_business: string | null };
        Returns: string;
      };
      my_confirm_requests: { Args: { p_vehicle: string }; Returns: MyConfirmRequest[] };
      shop_confirm_requests: { Args: Record<string, never>; Returns: ShopConfirmRequest[] };
      answer_record_confirmation: {
        Args: { p_request: string; p_decision: "confirmed" | "declined"; p_odometer: number | null; p_note: string | null };
        Returns: ConfirmAnswer;
      };
      confirm_link_view: { Args: { p_token: string }; Returns: (ConfirmJob & { status: ConfirmLinkStatus }) | { status: "not_found" } };
      confirm_by_link: {
        Args: {
          p_token: string;
          p_decision: "confirmed" | "declined";
          p_shop_name: string;
          p_shop_city: string | null;
          p_odometer: number | null;
          p_note: string | null;
        };
        Returns: ConfirmAnswer;
      };
      start_vehicle_transfer: { Args: { p_vehicle: string }; Returns: string };
      cancel_vehicle_transfer: { Args: { p_vehicle: string }; Returns: boolean };
      my_vehicle_transfer: { Args: { p_vehicle: string }; Returns: Ts | null };
      claim_vehicle_transfer: {
        Args: { p_code: string; p_vin: string };
        Returns: { status: ClaimStatus; vehicle_id?: string };
      };
    };
    Enums: {
      visibility: Visibility;
      mod_category: ModCategory;
      mod_status: ModStatus;
      build_goal: BuildGoal;
      notification_category: NotificationCategory;
      report_target: ReportTarget;
      report_reason: ReportReason;
      report_status: ReportStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
