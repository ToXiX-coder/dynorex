import { confirmBlock, normalizeClaimCode, normalizeVin } from "@/domain/record";
import type { RecordServiceApi } from "@/features/record/recordService";
import type {
  BuildRecord,
  ConfirmAnswer,
  ConfirmJob,
  ConfirmLinkStatus,
  RecordEntry,
  VinCheck,
} from "@/services/supabase/database.types";
import { DEMO_ME, type DemoState } from "./data";
import { demoKit as K } from "./services";

/**
 * Pitch-mode twin for D-64 (migration 20261026000000_build_record.sql), on sample data. Same rules as the
 * database: the 24-hour grace period, removals that stay visible, the emissions rule for shop confirmation,
 * a VIN check that never shows the VIN, and a transfer that needs the code and the VIN.
 */
const S = () => K.state();
const now = () => new Date().toISOString();
const DAY = 86_400_000;
const hex = () => Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
/** A car being sold to the demo driver: claim it from the garage with this code and the VIN. */
export const DEMO_CLAIM = { code: "HB3T-9WPZ", vin: "JM1NC2PF0E0234567" };
const DEMO_TRANSFER_CODE = "K7RM-4XQ2";
const vinChecks = new Map<string, number[]>();

const version = (type: string, id: string) =>
  S().recordRevisions.filter((r) => r.entry_type === type && r.entry_id === id).length;
const after24h = (removed: string | null | undefined, onRecord: string) =>
  Boolean(removed) && Date.parse(removed!) > Date.parse(onRecord) + DAY;

function entriesOf(st: DemoState, vehicleId: string): RecordEntry[] {
  const revs = (type: string, id: string) =>
    st.recordRevisions
      .filter((r) => r.entry_type === type && r.entry_id === id)
      .sort((a, b) => a.edited_at.localeCompare(b.edited_at))
      .map((r) => ({ at: r.edited_at, changed: r.changed }));
  const conf = (type: string, id: string) => {
    const c = st.recordConfirmations
      .filter((x) => x.entry_type === type && x.entry_id === id)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    return c
      ? { decision: c.decision, via: c.via, shop_name: c.shop_name, shop_city: c.shop_city, odometer: c.odometer, note: c.note, at: c.at, version: c.version }
      : null;
  };
  const files = (pick: (r: (typeof st.receipts)[number]) => boolean) =>
    st.receipts.filter(pick).map((r) => ({ uploaded_at: r.created_at, sha256: r.sha256 ?? null }));
  const base = {
    category: null,
    brand: null,
    part_number: null,
    compliance: null,
    carb_eo: null,
    installed_by: null,
    odometer: null,
    whp: null,
    wtq: null,
    dyno: null,
    correction: null,
    reopened: false,
    has_sheet: false,
  };

  const mods: RecordEntry[] = st.mods
    .filter((m) => m.vehicle_id === vehicleId)
    .filter((m) => m.status === "complete" || revs("mod", m.id).length > 0)
    .filter((m) => !m.deleted_at || (m.status === "complete" && after24h(m.deleted_at, m.status_changed_at)))
    .map((m) => ({
      ...base,
      type: "mod",
      id: m.id,
      title: m.name,
      category: m.category,
      brand: m.brand,
      part_number: m.part_number,
      compliance: m.compliance ?? null,
      carb_eo: m.carb_eo ?? null,
      installed_by: m.installed_by ?? null,
      date: m.installed_on ?? m.status_changed_at.slice(0, 10),
      odometer: m.installed_odometer ?? null,
      logged_at: m.created_at,
      removed_at: m.deleted_at,
      reopened: m.status !== "complete",
      earlier_owner: Boolean(m.inherited_at),
      version: revs("mod", m.id).length,
      revisions: revs("mod", m.id),
      receipts: files((r) => r.mod_id === m.id),
      confirmation: conf("mod", m.id),
    }));
  const service: RecordEntry[] = st.maintenance
    .filter((r) => r.vehicle_id === vehicleId && (!r.deleted_at || after24h(r.deleted_at, r.created_at)))
    .map((r) => ({
      ...base,
      type: "maintenance",
      id: r.id,
      title: r.title,
      date: r.done_on,
      odometer: r.odometer,
      logged_at: r.created_at,
      removed_at: r.deleted_at,
      earlier_owner: Boolean(r.inherited_at),
      version: revs("maintenance", r.id).length,
      revisions: revs("maintenance", r.id),
      receipts: files((x) => x.maintenance_id === r.id),
      confirmation: conf("maintenance", r.id),
    }));
  const dyno: RecordEntry[] = st.dynoResults
    .filter((d) => d.vehicle_id === vehicleId)
    .map((d) => ({
      ...base,
      type: "dyno",
      id: d.id,
      title: "Dyno run",
      installed_by: d.shop,
      date: d.measured_on,
      whp: d.whp,
      wtq: d.wtq,
      dyno: d.dyno,
      correction: d.correction,
      logged_at: d.created_at,
      removed_at: null,
      earlier_owner: Boolean(d.inherited_at),
      has_sheet: Boolean(d.sheet_path),
      version: revs("dyno", d.id).length,
      revisions: revs("dyno", d.id),
      receipts: [],
      confirmation: null,
    }));
  return [...mods, ...service, ...dyno].sort((a, b) => b.date.localeCompare(a.date) || b.logged_at.localeCompare(a.logged_at));
}

function recordOf(vehicleId: string): BuildRecord | null {
  const v = S().vehicles.find((x) => x.id === vehicleId && !x.deleted_at);
  if (!v) return null;
  return {
    car: { year: v.year, make: v.make, model: v.model, trim: v.trim_level },
    odometer: v.odometer === null ? null : Number(v.odometer),
    odometer_unit: v.odometer_unit,
    owners: (v.previous_owners ?? 0) + 1,
    owner_since: v.received_at ?? v.created_at,
    sold_at: v.sold_at ?? null,
    entries: entriesOf(S(), v.id),
  };
}
const liveShare = (token: string) => S().historyShares.find((x) => x.token === token && Date.parse(x.expires_at) > Date.now());
const myCar = (id: string) => S().vehicles.find((v) => v.id === id && v.owner_id === DEMO_ME && !v.deleted_at);

function entryRow(type: "mod" | "maintenance", id: string) {
  return type === "mod" ? S().mods.find((m) => m.id === id) : S().maintenance.find((m) => m.id === id);
}
function jobOf(r: DemoState["confirmRequests"][number]): ConfirmJob {
  const v = S().vehicles.find((x) => x.id === r.vehicle_id)!;
  const car = { year: v.year, make: v.make, model: v.model, trim: v.trim_level };
  if (r.entry_type === "mod") {
    const m = S().mods.find((x) => x.id === r.entry_id)!;
    return {
      car,
      entry_type: "mod",
      entry: {
        title: m.name,
        category: m.category,
        brand: m.brand,
        part_number: m.part_number,
        carb_eo: m.carb_eo ?? null,
        compliance: m.compliance ?? null,
        installed_by: m.installed_by ?? null,
        date: m.installed_on,
        odometer: m.installed_odometer ?? null,
      },
    };
  }
  const x = S().maintenance.find((m) => m.id === r.entry_id)!;
  return { car, entry_type: "maintenance", entry: { title: x.title, date: x.done_on, odometer: x.odometer } };
}
function statusOf(r: DemoState["confirmRequests"][number]): ConfirmLinkStatus {
  if (r.closed_at) return "closed";
  if (Date.parse(r.expires_at) <= Date.now()) return "expired";
  const v = S().vehicles.find((x) => x.id === r.vehicle_id);
  if (r.version !== version(r.entry_type, r.entry_id) || v?.sold_at || entryRow(r.entry_type, r.entry_id)?.deleted_at)
    return "changed";
  return "open";
}
function answer(
  r: DemoState["confirmRequests"][number],
  a: { decision: "confirmed" | "declined"; via: "shop_account" | "link"; shopName: string; shopCity: string | null; odometer: number | null; note: string | null },
): ConfirmAnswer {
  const status = statusOf(r);
  if (status !== "open") return status;
  const entry = recordOf(r.vehicle_id)?.entries.find((e) => e.id === r.entry_id);
  if (a.decision === "confirmed" && (!entry || confirmBlock(entry))) return "not_allowed";
  S().recordConfirmations.push({
    id: K.newId(),
    owner_id: r.owner_id,
    vehicle_id: r.vehicle_id,
    entry_type: r.entry_type,
    entry_id: r.entry_id,
    business_id: r.business_id,
    decision: a.decision,
    via: a.via,
    shop_name: a.shopName.trim(),
    shop_city: a.shopCity?.trim() || null,
    odometer: a.odometer,
    note: a.note?.trim() || null,
    at: now(),
    version: r.version,
  });
  r.closed_at = now();
  return "ok";
}

export const demoRecordService: RecordServiceApi = {
  myRecord: (vehicleId) => K.run(() => (myCar(vehicleId) ? recordOf(vehicleId) : null)),
  publicRecord: (token) =>
    K.run(() => {
      const s = liveShare(token);
      const v = s && S().vehicles.find((x) => x.id === s.vehicle_id && !x.deleted_at && !x.sold_at);
      const rec = v ? recordOf(v.id) : null;
      return rec && s ? { ...rec, expires_at: s.expires_at } : null;
    }),
  checkVin: (token, vin) =>
    K.run((): VinCheck => {
      const s = liveShare(token);
      if (!s) return "not_found";
      const recent = (vinChecks.get(token) ?? []).filter((t) => t > Date.now() - 3_600_000);
      if (recent.length >= 10) return "too_many";
      vinChecks.set(token, [...recent, Date.now()]);
      const v = S().vehicles.find((x) => x.id === s.vehicle_id);
      if (!v?.vin) return "no_vin_on_record";
      return v.vin === normalizeVin(vin) ? "match" : "no_match";
    }),

  requestConfirmation: (type, id, businessId) =>
    K.run(() => {
      const row = entryRow(type, id);
      if (!row || row.owner_id !== DEMO_ME) return K.refuse("buildNotFound");
      const entry = recordOf(row.vehicle_id)?.entries.find((e) => e.id === id);
      const block = entry ? confirmBlock(entry) : "not_finished";
      if (block === "emissions") K.refuse("emissionsConfirm");
      if (block === "not_finished") K.refuse("notFinished");
      if (block === "already_confirmed") K.refuse("alreadyConfirmed");
      if (block === "earlier_owner") K.refuse("inheritedEntry");
      if (block) K.refuse("saveFailed");
      if (S().vehicles.find((v) => v.id === row.vehicle_id)?.sold_at) K.refuse("vehicleSold");
      const v = version(type, id);
      const reqs = S().confirmRequests;
      if (!businessId) {
        const open = reqs.find((r) => r.entry_id === id && r.token && !r.closed_at && r.version === v);
        if (open) return open.token!;
        reqs.filter((r) => r.entry_id === id && r.token && !r.closed_at).forEach((r) => (r.closed_at = now()));
      } else {
        const b = S().businesses.find((x) => x.id === businessId && !x.deleted_at);
        if (!b) return K.refuse("buildNotFound");
        if (b.owner_id === DEMO_ME) K.refuse("ownBusiness");
        reqs.filter((r) => r.entry_id === id && r.business_id && !r.closed_at).forEach((r) => (r.closed_at = now()));
      }
      const r = {
        id: K.newId(),
        owner_id: DEMO_ME,
        vehicle_id: row.vehicle_id,
        entry_type: type,
        entry_id: id,
        version: v,
        business_id: businessId,
        token: businessId ? null : hex(),
        created_at: now(),
        expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
        closed_at: null,
      };
      reqs.push(r);
      return r.token ?? r.id;
    }),
  myConfirmRequests: (vehicleId) =>
    K.run(() =>
      S()
        .confirmRequests.filter((r) => r.vehicle_id === vehicleId && r.owner_id === DEMO_ME && statusOf(r) === "open")
        .map((r) => ({
          entry_type: r.entry_type,
          entry_id: r.entry_id,
          business_name: S().businesses.find((b) => b.id === r.business_id)?.name ?? null,
          token: r.token,
          expires_at: r.expires_at,
        })),
    ),
  shopRequests: () =>
    K.run(() => {
      const mine = S().businesses.find((b) => b.owner_id === DEMO_ME && !b.deleted_at);
      return mine
        ? S()
            .confirmRequests.filter((r) => r.business_id === mine.id && !r.closed_at)
            .map((r) => ({
              request_id: r.id,
              requested_at: r.created_at,
              customer: K.userById(r.owner_id)?.username ?? null,
              job: jobOf(r),
              status: statusOf(r),
            }))
        : [];
    }),
  answerRequest: (requestId, decision, odometer, note) =>
    K.run((): ConfirmAnswer => {
      const r = S().confirmRequests.find((x) => x.id === requestId);
      const b = r && S().businesses.find((x) => x.id === r.business_id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!r || !b) return "not_found";
      return answer(r, { decision, via: "shop_account", shopName: b.name, shopCity: b.location_text, odometer, note });
    }),
  linkView: (token) =>
    K.run(() => {
      const r = S().confirmRequests.find((x) => x.token === token);
      return r ? { ...jobOf(r), status: statusOf(r) } : { status: "not_found" as const };
    }),
  confirmByLink: (token, a) =>
    K.run((): ConfirmAnswer => {
      const r = S().confirmRequests.find((x) => x.token === token);
      if (!r) return "not_found";
      if (a.shopName.trim().length < 2) K.refuse("saveFailed");
      return answer(r, { ...a, via: "link" });
    }),

  startTransfer: (vehicleId) =>
    K.run(() => {
      const v = myCar(vehicleId) ?? K.refuse("buildNotFound");
      if (v.sold_at) K.refuse("vehicleSold");
      if (!v.vin) K.refuse("vinRequired");
      S().transfers.forEach((t) => t.vehicle_id === vehicleId && (t.closed_at ??= now()));
      S().transfers.push({ vehicle_id: vehicleId, code: DEMO_TRANSFER_CODE, expires_at: new Date(Date.now() + 14 * DAY).toISOString(), closed_at: null, failed: 0 });
      v.vin_locked_at ??= now();
      return DEMO_TRANSFER_CODE;
    }),
  cancelTransfer: (vehicleId) =>
    K.run(() => {
      S().transfers.forEach((t) => t.vehicle_id === vehicleId && (t.closed_at ??= now()));
    }),
  openTransfer: (vehicleId) =>
    K.run(() => S().transfers.find((t) => t.vehicle_id === vehicleId && !t.closed_at)?.expires_at ?? null),
  claimTransfer: (code, vin) =>
    K.run(() => {
      const c = normalizeClaimCode(code);
      if (S().transfers.some((t) => t.code === c && !t.closed_at)) return { status: "own_car" as const, vehicleId: null };
      if (c !== DEMO_CLAIM.code || S().vehicles.some((v) => v.vin === DEMO_CLAIM.vin && v.owner_id === DEMO_ME))
        return { status: "code_invalid" as const, vehicleId: null };
      if (normalizeVin(vin) !== DEMO_CLAIM.vin) return { status: "vin_mismatch" as const, vehicleId: null };
      return { status: "ok" as const, vehicleId: receiveSampleCar() };
    }),
};

/** The MX-5 being sold to the demo driver: a new car in their garage with the seller's record, read-only. */
function receiveSampleCar(): string {
  const st = S();
  const t = now();
  const vid = K.newId();
  const sold = new Date(Date.now() - 60_000).toISOString();
  const base = st.vehicles.find((v) => v.owner_id === DEMO_ME)!;
  st.vehicles.push({
    ...base,
    id: vid,
    owner_id: DEMO_ME,
    year: 2014,
    make: "Mazda",
    model: "MX-5",
    trim_level: "Club",
    nickname: null,
    vin: DEMO_CLAIM.vin,
    odometer: 52800,
    odometer_unit: "mi",
    description: null,
    hero_path: null,
    visibility: "private",
    baseline_hp: null,
    baseline_torque_lbft: null,
    baseline_weight_lb: null,
    baseline_zero_to_sixty_s: null,
    baseline_source: null,
    baseline_looked_up: [],
    baseline_lookup_label: null,
    client_ref: null,
    created_at: t,
    updated_at: t,
    sold_at: null,
    received_at: t,
    previous_owners: 1,
    vin_locked_at: t,
  });
  const modId = K.newId();
  st.mods.push({
    id: modId,
    owner_id: DEMO_ME,
    vehicle_id: vid,
    name: "Cat-back exhaust",
    category: "exhaust",
    brand: "SampleWorks",
    part_number: "SW-MX5-CB",
    cost_minor: null,
    currency: null,
    status: "complete",
    spec_deltas: { schema_version: 1 },
    notes: null,
    installed_on: "2023-07-09",
    installed_by: "Pinecrest Auto",
    compliance: "carb_eo",
    carb_eo: "D-9002-3",
    inherited_at: sold,
    status_changed_at: "2023-07-09T20:00:00.000Z",
    client_ref: null,
    created_at: "2023-07-09T20:00:00.000Z",
    updated_at: t,
    deleted_at: null,
    hidden_at: null,
  });
  st.recordConfirmations.push({
    id: K.newId(),
    owner_id: DEMO_ME,
    vehicle_id: vid,
    entry_type: "mod",
    entry_id: modId,
    business_id: null,
    decision: "confirmed",
    via: "link",
    shop_name: "Pinecrest Auto",
    shop_city: "Sample Town",
    odometer: 52010,
    note: null,
    at: "2023-07-11T15:00:00.000Z",
    version: 0,
  });
  st.maintenance.push({
    id: K.newId(),
    owner_id: DEMO_ME,
    vehicle_id: vid,
    title: "Timing chain inspection",
    done_on: "2024-05-02",
    odometer: 51000,
    cost_minor: null,
    currency: "USD",
    notes: null,
    next_due_on: null,
    next_due_odometer: null,
    created_at: "2024-05-02T18:00:00.000Z",
    deleted_at: null,
    inherited_at: sold,
  });
  return vid;
}
