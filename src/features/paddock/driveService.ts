import { demoDriveService } from "@/demo/proveIt";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { DrivePosition } from "@/services/supabase/database.types";

/**
 * Live group drive (D-60). Opt-in: your position is sent only while the live screen is open and you've
 * pressed Share. Only the drive's host and people going can see it, only around the drive's time, and the
 * server deletes positions 30 minutes after the drive ends.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };

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

const realDriveService = {
  share: (eventId: string, lat: number, lng: number, heading: number | null) =>
    run(async () => {
      must(
        await sb().rpc("share_drive_position", {
          p_event: eventId,
          p_lat: lat,
          p_lng: lng,
          p_heading: heading === null || heading < 0 ? null : heading % 360,
        }),
      );
    }),
  stop: (eventId: string) =>
    run(async () => {
      must(await sb().rpc("stop_sharing_drive", { p_event: eventId }));
    }),
  positions: (eventId: string) =>
    run(async () => must(await sb().rpc("drive_positions_for", { p_event: eventId })) as DrivePosition[]),
};

export type DriveServiceApi = typeof realDriveService;
export const driveService: DriveServiceApi = config.demoMode ? demoDriveService : realDriveService;
