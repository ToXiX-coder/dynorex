import { demoCommunityService } from "@/demo/v2";
import { mapError, type MappedError } from "@/features/auth/errors";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase/client";
import type {
  PublicBuild,
  ClubMember,
  ClubStatus,
  MyClub,
  PublicClub,
  PublicComment,
  PublicEvent,
  PublicPost,
  StickerKind,
} from "@/services/supabase/database.types";

/**
 * Paddock community: clubs, posts, comments, likes and the feed. Membership, posting rights, Plus-only
 * stickers, rate limits, blocks and moderation are all enforced by the database; this only calls it.
 */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: MappedError };
export type FeedMode = "following" | "all";
export type NewPost = { body: string; club_id?: string | null; build_vehicle_id?: string | null };
export type NewComment = { body?: string | null; sticker?: StickerKind | null };

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

const realCommunityService = {
  feed: (mode: FeedMode, page = 0) =>
    run(async () => must(await sb().rpc("paddock_feed", { p_mode: mode, p_page: page })) as PublicPost[]),
  post: (id: string) =>
    run(
      async () =>
        must(await sb().from("public_posts").select("*").eq("post_id", id).maybeSingle()) as PublicPost | null,
    ),
  comments: (postId: string) =>
    run(
      async () =>
        must(
          await sb().from("public_comments").select("*").eq("post_id", postId).order("created_at").limit(200),
        ) as PublicComment[],
    ),
  createPost: (input: NewPost) =>
    run(async () => (must(await sb().from("posts").insert(input).select("id").single()) as { id: string }).id),
  deletePost: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_post", { p_post: id }));
    }),
  comment: (postId: string, input: NewComment) =>
    run(async () => {
      must(
        await sb()
          .from("comments")
          .insert({ post_id: postId, ...input }),
      );
    }),
  deleteComment: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_comment", { p_comment: id }));
    }),
  /** Which of these posts you've liked (your own rows only, RLS). */
  myLikes: (postIds: string[]) =>
    run(async () =>
      postIds.length
        ? (must(await sb().from("post_likes").select("post_id").in("post_id", postIds)) as { post_id: string }[]).map(
            (r) => r.post_id,
          )
        : [],
    ),
  like: (postId: string) =>
    run(async () => {
      must(await sb().from("post_likes").insert({ post_id: postId }));
    }),
  unlike: (postId: string) =>
    run(async () => {
      must(await sb().from("post_likes").delete().eq("post_id", postId));
    }),
  clubs: (page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_clubs")
            .select("*")
            .order("members_count", { ascending: false })
            .order("club_id")
            .range(page * PAGE, page * PAGE + PAGE - 1),
        ) as PublicClub[],
    ),
  club: (id: string) =>
    run(
      async () =>
        must(await sb().from("public_clubs").select("*").eq("club_id", id).maybeSingle()) as PublicClub | null,
    ),
  myClubs: () => run(async () => must(await sb().rpc("my_clubs")) as MyClub[]),
  createClub: (name: string, description: string | null, visibility: "public" | "private" = "public") =>
    run(async () => {
      const id = must(await sb().rpc("create_club", { p_name: name, p_description: description })) as string;
      if (visibility === "private")
        must(await sb().from("clubs").update({ visibility }).eq("id", id).select("id").single());
      return id;
    }),
  /** Public clubs: joined. Private clubs: a request the owner or a moderator answers. */
  joinClub: (id: string) =>
    run(async () => must(await sb().rpc("join_or_request_club", { p_club: id })) as "joined" | "requested"),
  cancelJoinRequest: (id: string) =>
    run(async () => {
      must(await sb().rpc("cancel_join_request", { p_club: id }));
    }),
  clubStatus: (id: string) => run(async () => must(await sb().rpc("my_club_status", { p_club: id })) as ClubStatus),
  setClubVisibility: (id: string, visibility: "public" | "private") =>
    run(async () => {
      must(await sb().from("clubs").update({ visibility }).eq("id", id).select("id").single());
    }),
  members: (id: string) => run(async () => must(await sb().rpc("club_member_list", { p_club: id })) as ClubMember[]),
  joinRequests: (id: string) =>
    run(
      async () =>
        must(await sb().rpc("club_join_requests_for", { p_club: id })) as { username: string; created_at: string }[],
    ),
  answerJoinRequest: (id: string, username: string, accept: boolean) =>
    run(async () => {
      must(await sb().rpc("respond_join_request", { p_club: id, p_username: username, p_accept: accept }));
    }),
  setMemberRole: (id: string, username: string, role: "member" | "moderator") =>
    run(async () => {
      must(await sb().rpc("set_club_role", { p_club: id, p_username: username, p_role: role }));
    }),
  removeMember: (id: string, username: string) =>
    run(async () => {
      must(await sb().rpc("remove_club_member", { p_club: id, p_username: username }));
    }),
  /** Club owner or moderator takes down a post in their club. */
  removeClubPost: (postId: string) =>
    run(async () => {
      must(await sb().rpc("club_remove_post", { p_post: postId }));
    }),
  leaveClub: (id: string) =>
    run(async () => {
      must(await sb().rpc("leave_club", { p_club: id }));
    }),
  deleteClub: (id: string) =>
    run(async () => {
      must(await sb().rpc("soft_delete_club", { p_club: id }));
    }),
  clubPosts: (clubId: string, page = 0) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_posts")
            .select("*")
            .eq("club_id", clubId)
            .order("created_at", { ascending: false })
            .range(page * PAGE, page * PAGE + PAGE - 1),
        ) as PublicPost[],
    ),
  /** Members' public builds (D-63); an invite-only club's list is for its members only. */
  clubBuilds: (clubId: string) =>
    run(async () => must(await sb().rpc("club_builds", { p_club: clubId })) as PublicBuild[]),
  clubEvents: (clubId: string) =>
    run(
      async () =>
        must(
          await sb()
            .from("public_events")
            .select("*")
            .eq("club_id", clubId)
            .eq("status", "scheduled")
            .gt("ends_at", new Date().toISOString())
            .order("starts_at")
            .limit(20),
        ) as PublicEvent[],
    ),
};

export type CommunityServiceApi = typeof realCommunityService;
export const communityService: CommunityServiceApi = config.demoMode ? demoCommunityService : realCommunityService;
