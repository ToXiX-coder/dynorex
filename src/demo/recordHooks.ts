import type { ErrorKey } from "@/domain/copy/errors";
import type { RecordEntryType } from "@/services/supabase/database.types";
import type { DemoState } from "./data";

/**
 * Pitch-mode mirror of the D-64 triggers: an earlier owner's entries and a sold car are read-only, and after a
 * 24-hour grace period an edit to a record field keeps a revision. Used by the demo twins that write mods,
 * maintenance and dyno results.
 */
const DAY = 86_400_000;
export const RECORD_FIELDS: Record<RecordEntryType, string[]> = {
  mod: [
    "name",
    "category",
    "brand",
    "part_number",
    "installed_on",
    "installed_by",
    "status",
    "compliance",
    "carb_eo",
    "installed_odometer",
  ],
  maintenance: ["title", "done_on", "odometer"],
  dyno: ["measured_on", "dyno", "correction", "shop", "whp", "wtq", "fuel"],
};

/** Why this entry can't be changed, or null. */
export function recordGuard(S: DemoState, vehicleId: string, inheritedAt: string | null | undefined): ErrorKey | null {
  const v = S.vehicles.find((x) => x.id === vehicleId);
  if (v?.deleted_at) return null;
  if (inheritedAt) return "inheritedEntry";
  if (v?.sold_at) return "vehicleSold";
  return null;
}

/** Call with a copy of the row before the edit and the row after it. */
export function logRevision(
  S: DemoState,
  type: RecordEntryType,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  if (after.deleted_at) return;
  if (type === "mod" && before.status !== "complete") return;
  const onRecord = String(type === "mod" ? before.status_changed_at : before.created_at);
  if (Date.parse(onRecord) > Date.now() - DAY) return;
  const changed = RECORD_FIELDS[type].filter((k) => (before[k] ?? null) !== (after[k] ?? null));
  if (changed.length === 0) return;
  S.recordRevisions.push({
    id: `rev-${S.seq++}`,
    owner_id: String(after.owner_id),
    vehicle_id: String(after.vehicle_id),
    entry_type: type,
    entry_id: String(after.id),
    changed,
    edited_at: new Date().toISOString(),
  });
}
