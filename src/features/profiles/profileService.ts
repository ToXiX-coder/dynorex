import type { BuildGoalId } from "@/domain/onboarding";
import type { ProfileInput } from "@/domain/validation/account";
import { demoProfileService } from "@/demo/services";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type { Database, ReportReason, ReportTarget, UserRow, Visibility } from "@/services/supabase/database.types";

/**
 * Profile, privacy and safety data access. All calls run as the signed-in user under RLS; the
 * database decides what is allowed. Results never throw.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type PublicProfile = Database["public"]["Views"]["public_profiles"]["Row"];

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

async function uid(): Promise<string> {
  const { data, error } = await sb().auth.getUser();
  if (error || !data.user) throw error ?? { code: "session_not_found" };
  return data.user.id;
}

function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const realProfileService = {
  getMine: () =>
    run(async () => {
      const id = await uid();
      return must(await sb().from("users").select("*").eq("id", id).maybeSingle()) as UserRow | null;
    }),

  usernameAvailable: (username: string) =>
    run(async () => must(await sb().rpc("username_available", { p_username: username })) as boolean),

  setUsername: (username: string) =>
    run(async () => {
      const id = await uid();
      must(await sb().from("users").update({ username }).eq("id", id).select("id").single());
    }),

  updateProfile: (input: ProfileInput) =>
    run(async () => {
      const id = await uid();
      return must(await sb().from("users").update(input).eq("id", id).select("*").single()) as UserRow;
    }),

  /** Your driver's look and the build goal it's based on. The database checks the gear string. */
  updateDriver: (input: { build_goal: BuildGoalId | null; driver_gear: string | null }) =>
    run(async () => {
      const id = await uid();
      return must(await sb().from("users").update(input).eq("id", id).select("*").single()) as UserRow;
    }),

  setDefaultVisibility: (visibility: Exclude<Visibility, "friends_only">) =>
    run(async () => {
      const id = await uid();
      must(await sb().from("users").update({ default_visibility: visibility }).eq("id", id).select("id").single());
    }),

  setOnboardingStep: (step: 1 | 2 | 3) =>
    run(async () => {
      const id = await uid();
      must(await sb().from("users").update({ onboarding_step: step }).eq("id", id).select("id").single());
    }),

  completeOnboarding: (goal: BuildGoalId) =>
    run(async () => {
      const id = await uid();
      must(
        await sb()
          .from("users")
          .update({ build_goal: goal, onboarding_step: 3, onboarding_completed_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single(),
      );
    }),

  /** Skip records the step; it never creates placeholder content. */
  skipOnboarding: (atStep: 1 | 2 | 3) =>
    run(async () => {
      const id = await uid();
      must(
        await sb()
          .from("users")
          .update({ onboarding_step: atStep, onboarding_skipped_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single(),
      );
    }),

  /** Onboarding step 1 saves a real, PRIVATE vehicle with year/make/model. */
  addFirstVehicle: (v: { year: number; make: string; model: string; nickname?: string | null }) =>
    run(async () => {
      must(
        await sb()
          .from("vehicles")
          .insert({ year: v.year, make: v.make, model: v.model, nickname: v.nickname ?? null, visibility: "private" })
          .select("id")
          .single(),
      );
    }),

  getPublic: (username: string) =>
    run(async () => {
      return must(
        await sb().from("public_profiles").select("*").eq("username", username.toLowerCase()).maybeSingle(),
      ) as PublicProfile | null;
    }),

  /** Follower/following counts the signed-in user can see about themselves (RLS limits rows to their own edges). */
  myFollowCounts: () =>
    run(async () => {
      const id = await uid();
      const followers = await sb()
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", id);
      const following = await sb()
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", id);
      if (followers.error) throw followers.error;
      if (following.error) throw following.error;
      return { followers: followers.count ?? 0, following: following.count ?? 0 };
    }),

  block: (userId: string) =>
    run(async () => {
      must(await sb().from("blocks").insert({ blocked_id: userId }).select("blocked_id").single());
    }),
  unblock: (userId: string) =>
    run(async () => {
      const id = await uid();
      must(await sb().from("blocks").delete().eq("blocker_id", id).eq("blocked_id", userId));
    }),
  /** Blocked people by username where still visible; blocked users are hidden from the views, so ids are returned too. */
  listBlocked: () =>
    run(async () =>
      must(await sb().from("blocks").select("blocked_id, created_at").order("created_at", { ascending: false })),
    ),

  mute: (userId: string) =>
    run(async () => {
      must(await sb().from("mutes").insert({ muted_id: userId }).select("muted_id").single());
    }),
  unmute: (userId: string) =>
    run(async () => {
      const id = await uid();
      must(await sb().from("mutes").delete().eq("muter_id", id).eq("muted_id", userId));
    }),

  report: (target: { type: ReportTarget; id: string }, reason: ReportReason, details: string | null) =>
    run(async () => {
      must(
        await sb()
          .from("reports")
          .insert({ target_type: target.type, target_id: target.id, reason, details: details?.trim() || null })
          .select("id")
          .single(),
      );
    }),
};

export type ProfileServiceApi = typeof realProfileService;
export const profileService: ProfileServiceApi = config.demoMode ? demoProfileService : realProfileService;
