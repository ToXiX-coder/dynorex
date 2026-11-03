/**
 * Pitch mode for Line and Paddock: in-memory twins of the Phase 7 server functions, following the same
 * rules (monthly limit, server-side trimming, capacity, one check-in code per event, blocks and mutes).
 */
import { seriesDates, SERIES_MAX } from "@/domain/events";
import { trackDistanceM, trimForSharing, type TrackPoint } from "@/domain/routes";
import { deltaInBaseUnit, type SpecDeltas } from "@/domain/specs";
import { aggregateInsights, demoTorqReply, type InsightBuild } from "@/domain/torq";
import type { CommunityServiceApi } from "@/features/paddock/communityService";
import type { TorqServiceApi } from "@/features/torq/torqService";
import type { EventServiceApi, NewEvent } from "@/features/paddock/eventService";
import type { LineServiceApi } from "@/features/line/lineService";
import type {
  EventRow,
  MyClub,
  PublicClub,
  PublicComment,
  PublicEvent,
  PublicPost,
  PublicRoute,
  RouteRow,
  SearchHit,
} from "@/services/supabase/database.types";
import { DEMO_ME, type DemoClub, type DemoPost } from "./data";
import { demoKit as K } from "./services";

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- Line

export function publicRoute(r: RouteRow): PublicRoute | null {
  const owner = K.userById(r.owner_id);
  if (r.deleted_at || r.visibility !== "public" || !r.public_points || !owner?.username || K.blockedWith(r.owner_id))
    return null;
  const rs = K.state().ratings.filter((x) => x.route_id === r.id);
  return {
    route_id: r.id,
    owner_username: owner.username,
    title: r.title,
    description: r.description,
    distance_m: r.distance_m,
    duration_s: r.duration_s,
    drive_date: r.started_at.slice(0, 10),
    points: r.public_points,
    created_at: r.created_at,
    rating_avg: rs.length ? Math.round((rs.reduce((a, x) => a + x.stars, 0) / rs.length) * 10) / 10 : null,
    rating_count: rs.length,
  };
}
const mineRoute = (id: string) => K.state().routes.find((r) => r.id === id && r.owner_id === DEMO_ME && !r.deleted_at);
function applyVisibility(r: RouteRow, pub: boolean) {
  if (!pub) {
    Object.assign(r, { visibility: "private", public_points: null });
    return;
  }
  const trimmed = trimForSharing(r.points);
  if (!trimmed) K.refuse("routeTooShort");
  Object.assign(r, { visibility: "public", public_points: trimmed });
}

export const demoLineService: LineServiceApi = {
  myRoutes: (p = 0) =>
    K.run(() =>
      K.page(
        K.state()
          .routes.filter((r) => r.owner_id === DEMO_ME && !r.deleted_at)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        p,
      ),
    ),
  myRoute: (id) => K.run(() => mineRoute(id) ?? null),
  publicRoute: (id) =>
    K.run(() => {
      const r = K.state().routes.find((x) => x.id === id);
      return r ? publicRoute(r) : null;
    }),
  discover: (mode, p = 0) =>
    K.run(() => {
      if (mode === "nearby" && !K.state().region) return [];
      const list = K.state()
        .routes.filter((r) => r.owner_id !== DEMO_ME && !K.muted(r.owner_id))
        .map(publicRoute)
        .filter((x): x is PublicRoute => x !== null);
      list.sort((a, b) =>
        mode === "top"
          ? (b.rating_avg ?? 0) * Math.log(2 + b.rating_count) - (a.rating_avg ?? 0) * Math.log(2 + a.rating_count)
          : b.created_at.localeCompare(a.created_at),
      );
      return K.page(list, p);
    }),
  save: (clientRef, title, description, points: TrackPoint[], makePublic) =>
    K.run(() => {
      const S = K.state();
      const dup = S.routes.find((r) => r.owner_id === DEMO_ME && r.client_ref === clientRef);
      if (dup) return dup.id;
      if (points.length < 2) K.refuse("invalidRoute");
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const thisMonth = S.routes.filter(
        (r) => r.owner_id === DEMO_ME && Date.parse(r.created_at) >= monthStart.getTime(),
      );
      if (!S.subscription.plus && thisMonth.length >= 5) K.refuse("planLimitRoutes");
      const r: RouteRow = {
        id: K.newId(),
        owner_id: DEMO_ME,
        title,
        description,
        visibility: "private",
        points,
        distance_m: Math.round(trackDistanceM(points.map(([a, b]) => [a, b]))),
        duration_s: Math.round((points[points.length - 1]![2] - points[0]![2]) / 1000),
        started_at: new Date(points[0]![2]).toISOString(),
        ended_at: new Date(points[points.length - 1]![2]).toISOString(),
        public_points: null,
        start_cell_lat: null,
        start_cell_lon: null,
        client_ref: clientRef,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        hidden_at: null,
      };
      if (makePublic) applyVisibility(r, true);
      S.routes.push(r);
      return r.id;
    }),
  setPublic: (id, makePublic) =>
    K.run(() => {
      const r = mineRoute(id) ?? K.refuse("buildNotFound");
      applyVisibility(r, makePublic);
    }),
  remove: (id) =>
    K.run(() => {
      const r = mineRoute(id);
      if (r) Object.assign(r, { deleted_at: now(), public_points: null });
    }),
  usage: () =>
    K.run(() => {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const used = K.state().routes.filter(
        (r) => r.owner_id === DEMO_ME && Date.parse(r.created_at) >= monthStart.getTime(),
      ).length; // deleted drives still count, like the server
      return { used, monthly_limit: K.state().subscription.plus ? null : 5 };
    }),
  myRating: (routeId) =>
    K.run(() => K.state().ratings.find((x) => x.route_id === routeId && x.user_id === DEMO_ME)?.stars ?? null),
  rate: (routeId, stars) =>
    K.run(() => {
      const r = K.state().routes.find((x) => x.id === routeId);
      if (!r || !publicRoute(r) || r.owner_id === DEMO_ME) K.refuse("saveFailed");
      const S = K.state();
      const existing = S.ratings.find((x) => x.route_id === routeId && x.user_id === DEMO_ME);
      if (existing) existing.stars = stars;
      else S.ratings.push({ route_id: routeId, user_id: DEMO_ME, stars, comment: null });
    }),
};

// ---------------------------------------------------------------- Paddock

export function publicEvent(e: EventRow): PublicEvent | null {
  const org = K.userById(e.organizer_id);
  if (e.deleted_at || !org?.username || K.blockedWith(e.organizer_id)) return null;
  const rs = K.state().rsvps.filter((r) => r.event_id === e.id);
  return {
    event_id: e.id,
    organizer_username: org.username,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location_text: e.location_text,
    capacity: e.capacity,
    status: e.status,
    going_count: rs.filter((r) => r.status === "going").length,
    interested_count: rs.filter((r) => r.status === "interested").length,
    kind: e.kind,
    route_id: e.route_id && routeIsPublic(e.route_id) ? e.route_id : null,
    club_id: e.club_id,
    place_lat: e.place_lat,
    place_lng: e.place_lng,
  };
}
const routeIsPublic = (id: string) => {
  const r = K.state().routes.find((x) => x.id === id);
  return Boolean(r && publicRoute(r));
};
const isMember = (clubId: string) => K.state().clubMembers.some((m) => m.club_id === clubId && m.user_id === DEMO_ME);
const myRole = (clubId: string) =>
  K.state().clubMembers.find((m) => m.club_id === clubId && m.user_id === DEMO_ME)?.role ?? null;
const staff = (clubId: string) => myRole(clubId) === "owner" || myRole(clubId) === "moderator";
const memberByName = (clubId: string, username: string) => {
  const u = K.state().users.find((x) => x.username === username);
  return u ? K.state().clubMembers.find((m) => m.club_id === clubId && m.user_id === u.id) : undefined;
};
const eventById = (id: string) => K.state().events.find((e) => e.id === id && !e.deleted_at);
const checkinOpen = (e: EventRow) =>
  e.status === "scheduled" && Date.now() >= Date.parse(e.starts_at) - 3_600_000 && Date.now() <= Date.parse(e.ends_at);

export const demoEventService: EventServiceApi = {
  upcoming: (p = 0) =>
    K.run(() =>
      K.page(
        K.state()
          .events.filter(
            (e) => e.status === "scheduled" && Date.parse(e.ends_at) > Date.now() && !K.muted(e.organizer_id),
          )
          .map(publicEvent)
          .filter((x): x is PublicEvent => x !== null)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        p,
      ),
    ),
  publicEvent: (id) =>
    K.run(() => {
      const e = eventById(id);
      return e ? publicEvent(e) : null;
    }),
  asOrganizer: (id) =>
    K.run(() => K.state().events.find((e) => e.id === id && e.organizer_id === DEMO_ME && !e.deleted_at) ?? null),
  myRsvp: (id) => K.run(() => K.state().rsvps.find((r) => r.event_id === id && r.user_id === DEMO_ME)?.status ?? null),
  myCheckin: (id) => K.run(() => K.state().checkins.some((c) => c.event_id === id && c.user_id === DEMO_ME)),
  // sample check-ins carry no time, so pitch mode counts them all
  myCheckinCount: () => K.run(() => K.state().checkins.filter((c) => c.user_id === DEMO_ME).length),
  rsvp: (id, status) =>
    K.run(() => {
      const S = K.state();
      const e = eventById(id);
      if (!e || !publicEvent(e)) K.refuse("buildNotFound");
      if (e!.status !== "scheduled" || Date.parse(e!.ends_at) < Date.now()) K.refuse("eventClosed");
      const mine = S.rsvps.find((r) => r.event_id === id && r.user_id === DEMO_ME);
      const going = S.rsvps.filter((r) => r.event_id === id && r.status === "going").length;
      if (status === "going" && e!.capacity !== null && mine?.status !== "going" && going >= e!.capacity)
        K.refuse("eventFull");
      if (mine) mine.status = status;
      else S.rsvps.push({ event_id: id, user_id: DEMO_ME, status });
      return status;
    }),
  cancelRsvp: (id) =>
    K.run(() => {
      const S = K.state();
      S.rsvps = S.rsvps.filter((r) => !(r.event_id === id && r.user_id === DEMO_ME));
    }),
  create: (input: NewEvent) =>
    K.run(() => {
      if (Date.parse(input.starts_at) < Date.now()) K.refuse("eventInPast");
      if (input.route_id && !routeIsPublic(input.route_id)) K.refuse("routeNotPublic");
      if (input.kind === "drive" && !input.route_id) K.refuse("routeNotPublic");
      if (input.club_id && !isMember(input.club_id)) K.refuse("clubMemberRequired");
      const e: EventRow = {
        id: K.newId(),
        organizer_id: DEMO_ME,
        ...input,
        kind: input.kind ?? "meet",
        route_id: input.route_id ?? null,
        club_id: input.club_id ?? null,
        place_lat: input.place_lat ?? null,
        place_lng: input.place_lng ?? null,
        series_id: null,
        status: "scheduled",
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        hidden_at: null,
      };
      K.state().events.push(e);
      return e.id;
    }),
  update: (id, patch) =>
    K.run(() => {
      const e =
        K.state().events.find((x) => x.id === id && x.organizer_id === DEMO_ME && !x.deleted_at) ??
        K.refuse("buildNotFound");
      if (e.status !== "scheduled") K.refuse("buildNotFound");
      const movesTime =
        (patch.starts_at && patch.starts_at !== e.starts_at) || (patch.ends_at && patch.ends_at !== e.ends_at);
      if (movesTime && Date.parse(e.starts_at) <= Date.now()) K.refuse("eventInPast");
      Object.assign(e, patch, { updated_at: now() });
    }),
  cancel: (id) =>
    K.run(() => {
      const e = K.state().events.find((x) => x.id === id && x.organizer_id === DEMO_ME);
      if (e && e.status === "scheduled") e.status = "cancelled";
    }),
  checkinCode: (id) =>
    K.run(() => {
      const e = K.state().events.find((x) => x.id === id && x.organizer_id === DEMO_ME);
      if (!e) K.refuse("buildNotFound");
      if (!checkinOpen(e!)) K.refuse("checkinClosed");
      // one code per event, made the first time the host opens check-in (same rule as the server)
      const S = K.state();
      const ends = Date.parse(e!.ends_at);
      let c = S.codes.find((x) => x.event_id === id);
      if (!c) {
        c = { event_id: id, code: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"), expires_at: ends };
        S.codes.push(c);
      }
      return { code: c.code, expires_at: new Date(ends).toISOString() };
    }),
  checkIn: (id, code) =>
    K.run(() => {
      const S = K.state();
      const e = eventById(id);
      if (!e || !checkinOpen(e)) K.refuse("checkinClosed");
      if (!S.rsvps.some((r) => r.event_id === id && r.user_id === DEMO_ME && r.status === "going"))
        K.refuse("rsvpRequired");
      if (!S.codes.some((c) => c.event_id === id && c.code === code)) K.refuse("invalidCode");
      if (!S.checkins.some((c) => c.event_id === id && c.user_id === DEMO_ME))
        S.checkins.push({ event_id: id, user_id: DEMO_ME });
    }),
  createSeries: (input, repeat, count) =>
    K.run(() => {
      if (count < 2 || count > SERIES_MAX) K.refuse("saveFailed");
      if (Date.parse(input.starts_at) < Date.now()) K.refuse("eventInPast");
      if (input.route_id && !routeIsPublic(input.route_id)) K.refuse("routeNotPublic");
      if (input.kind === "drive" && !input.route_id) K.refuse("routeNotPublic");
      if (input.club_id && !isMember(input.club_id)) K.refuse("clubMemberRequired");
      const seriesId = K.newId();
      const ids = seriesDates(input.starts_at, input.ends_at, repeat, count).map((d) => {
        const e: EventRow = {
          id: K.newId(),
          organizer_id: DEMO_ME,
          ...input,
          ...d,
          kind: input.kind ?? "meet",
          route_id: input.route_id ?? null,
          club_id: input.club_id ?? null,
          place_lat: input.place_lat ?? null,
          place_lng: input.place_lng ?? null,
          series_id: seriesId,
          status: "scheduled",
          created_at: now(),
          updated_at: now(),
          deleted_at: null,
          hidden_at: null,
        };
        K.state().events.push(e);
        return e.id;
      });
      return ids[0]!;
    }),
  seriesDates: (id) =>
    K.run(() => {
      const e = eventById(id);
      if (!e?.series_id) return [];
      return K.state()
        .events.filter(
          (x) =>
            x.series_id === e.series_id &&
            x.status === "scheduled" &&
            Date.parse(x.ends_at) > Date.now() &&
            publicEvent(x) !== null,
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((x) => ({ event_id: x.id, starts_at: x.starts_at }));
    }),
  cancelSeries: (id) =>
    K.run(() => {
      const e = K.state().events.find((x) => x.id === id && x.organizer_id === DEMO_ME && !x.deleted_at);
      if (!e?.series_id) return K.refuse("buildNotFound");
      let n = 0;
      for (const x of K.state().events)
        if (x.series_id === e.series_id && x.starts_at >= e.starts_at && x.status === "scheduled") {
          x.status = "cancelled";
          n++;
        }
      return n;
    }),
  attendance: (id) =>
    K.run(() => {
      const S = K.state();
      if (!S.events.some((e) => e.id === id && e.organizer_id === DEMO_ME)) K.refuse("buildNotFound");
      return {
        going: S.rsvps.filter((r) => r.event_id === id && r.status === "going").length,
        interested: S.rsvps.filter((r) => r.event_id === id && r.status === "interested").length,
        checked_in: S.checkins.filter((c) => c.event_id === id).length,
      };
    }),
};

// ---------------------------------------------------------------- Paddock community (clubs, posts, feed)

const S = () => K.state();
function publicClub(c: DemoClub): PublicClub | null {
  const owner = K.userById(c.owner_id);
  if (c.deleted_at || !owner?.username || K.blockedWith(c.owner_id)) return null;
  return {
    club_id: c.id,
    name: c.name,
    description: c.description,
    owner_username: owner.username,
    created_at: c.created_at,
    members_count: S().clubMembers.filter((m) => m.club_id === c.id).length,
    visibility: c.visibility ?? "public",
  };
}
const clubById = (id: string) => {
  const c = S().clubs.find((x) => x.id === id);
  return c ? publicClub(c) : null;
};
function publicPost(p: DemoPost): PublicPost | null {
  const a = K.userById(p.author_id);
  if (p.deleted_at || !a?.username || K.blockedWith(p.author_id)) return null;
  const club = p.club_id ? clubById(p.club_id) : null;
  if (p.club_id && !club) return null;
  // private clubs: posts are for members only
  if (club && club.visibility === "private" && !isMember(club.club_id)) return null;
  return {
    post_id: p.id,
    author_username: a.username,
    club_id: p.club_id,
    club_name: club?.name ?? null,
    body: p.body,
    build_vehicle_id: p.build_vehicle_id && K.isPublicVehicle(p.build_vehicle_id) ? p.build_vehicle_id : null,
    created_at: p.created_at,
    likes_count: S().likes.filter((l) => l.post_id === p.id).length,
    comments_count: S().comments.filter((c) => c.post_id === p.id && !c.deleted_at).length,
  };
}
const postById = (id: string) => {
  const p = S().posts.find((x) => x.id === id);
  return p ? publicPost(p) : null;
};
const newest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

export const demoCommunityService: CommunityServiceApi = {
  feed: (mode, p = 0) =>
    K.run(() => {
      const follows = new Set(
        S()
          .follows.filter((f) => f.follower_id === DEMO_ME)
          .map((f) => f.followee_id),
      );
      const clubs = new Set(
        S()
          .clubMembers.filter((m) => m.user_id === DEMO_ME)
          .map((m) => m.club_id),
      );
      const list = S()
        .posts.filter(
          (x) =>
            !K.muted(x.author_id) &&
            (mode === "all" ||
              x.author_id === DEMO_ME ||
              follows.has(x.author_id) ||
              (x.club_id !== null && clubs.has(x.club_id))),
        )
        .map(publicPost)
        .filter((x): x is PublicPost => x !== null)
        .sort(newest);
      return K.page(list, p);
    }),
  post: (id) => K.run(() => postById(id)),
  comments: (postId) =>
    K.run(() =>
      postById(postId)
        ? S()
            .comments.filter((c) => c.post_id === postId && !c.deleted_at && !K.blockedWith(c.author_id))
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((c): PublicComment => ({
              comment_id: c.id,
              post_id: c.post_id,
              author_username: K.userById(c.author_id)!.username!,
              body: c.body,
              sticker: c.sticker,
              created_at: c.created_at,
            }))
        : [],
    ),
  createPost: (input) =>
    K.run(() => {
      if (input.club_id && !isMember(input.club_id)) K.refuse("clubMemberRequired");
      const body = input.body.trim();
      if (!body || body.length > 2000) K.refuse("saveFailed");
      const post: DemoPost = {
        id: K.newId(),
        author_id: DEMO_ME,
        club_id: input.club_id ?? null,
        body,
        build_vehicle_id: input.build_vehicle_id ?? null,
        created_at: now(),
        deleted_at: null,
      };
      S().posts.push(post);
      return post.id;
    }),
  deletePost: (id) =>
    K.run(() => {
      const p = S().posts.find((x) => x.id === id && x.author_id === DEMO_ME);
      if (p) p.deleted_at = now();
    }),
  comment: (postId, input) =>
    K.run(() => {
      if (!postById(postId)) K.refuse("buildNotFound");
      if (input.sticker && !S().subscription.plus) K.refuse("paywall");
      const body = input.body?.trim() || null;
      if (!body && !input.sticker) K.refuse("saveFailed");
      S().comments.push({
        id: K.newId(),
        post_id: postId,
        author_id: DEMO_ME,
        body,
        sticker: input.sticker ?? null,
        created_at: now(),
        deleted_at: null,
      });
    }),
  deleteComment: (id) =>
    K.run(() => {
      const c = S().comments.find((x) => x.id === id && x.author_id === DEMO_ME);
      if (c) c.deleted_at = now();
    }),
  myLikes: (ids) =>
    K.run(() =>
      S()
        .likes.filter((l) => l.user_id === DEMO_ME && ids.includes(l.post_id))
        .map((l) => l.post_id),
    ),
  like: (postId) =>
    K.run(() => {
      if (!postById(postId)) K.refuse("buildNotFound");
      if (!S().likes.some((l) => l.post_id === postId && l.user_id === DEMO_ME))
        S().likes.push({ post_id: postId, user_id: DEMO_ME });
    }),
  unlike: (postId) =>
    K.run(() => {
      S().likes = S().likes.filter((l) => !(l.post_id === postId && l.user_id === DEMO_ME));
    }),
  clubs: (p = 0) =>
    K.run(() =>
      K.page(
        S()
          .clubs.map(publicClub)
          .filter((x): x is PublicClub => x !== null)
          .sort((a, b) => b.members_count - a.members_count),
        p,
      ),
    ),
  club: (id) => K.run(() => clubById(id)),
  myClubs: () =>
    K.run(() =>
      S()
        .clubMembers.filter((m) => m.user_id === DEMO_ME)
        .flatMap((m): MyClub[] => {
          const c = clubById(m.club_id);
          return c ? [{ club_id: c.club_id, name: c.name, role: m.role, members_count: c.members_count }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  createClub: (name, description, visibility = "public") =>
    K.run(() => {
      const n = name.trim();
      if (n.length < 3 || n.length > 60) K.refuse("saveFailed");
      if (S().clubs.some((c) => !c.deleted_at && c.name.toLowerCase() === n.toLowerCase())) K.refuse("clubNameTaken");
      const c: DemoClub = {
        id: K.newId(),
        owner_id: DEMO_ME,
        name: n,
        description: description?.trim() || null,
        visibility,
        created_at: now(),
        deleted_at: null,
      };
      S().clubs.push(c);
      S().clubMembers.push({ club_id: c.id, user_id: DEMO_ME, role: "owner" });
      return c.id;
    }),
  joinClub: (id) =>
    K.run(() => {
      const c = clubById(id) ?? K.refuse("buildNotFound");
      if (isMember(id)) return "joined" as const;
      if (c.visibility === "public") {
        S().clubMembers.push({ club_id: id, user_id: DEMO_ME, role: "member" });
        return "joined" as const;
      }
      if (!S().clubJoinRequests.some((r) => r.club_id === id && r.user_id === DEMO_ME))
        S().clubJoinRequests.push({ club_id: id, user_id: DEMO_ME, created_at: now() });
      return "requested" as const;
    }),
  cancelJoinRequest: (id) =>
    K.run(() => {
      S().clubJoinRequests = S().clubJoinRequests.filter((r) => !(r.club_id === id && r.user_id === DEMO_ME));
    }),
  clubStatus: (id) =>
    K.run(() => {
      const m = S().clubMembers.find((x) => x.club_id === id && x.user_id === DEMO_ME);
      if (m) return m.role;
      return S().clubJoinRequests.some((r) => r.club_id === id && r.user_id === DEMO_ME) ? "requested" : "none";
    }),
  setClubVisibility: (id, visibility) =>
    K.run(() => {
      const c = S().clubs.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!c) return K.refuse("buildNotFound");
      c.visibility = visibility;
    }),
  members: (id) =>
    K.run(() => {
      if (!isMember(id)) return [];
      const rank = { owner: 0, moderator: 1, member: 2 } as const;
      return S()
        .clubMembers.filter((m) => m.club_id === id && !K.blockedWith(m.user_id))
        .sort((a, b) => rank[a.role] - rank[b.role])
        .map((m) => ({ username: K.userById(m.user_id)!.username!, role: m.role, joined_at: now() }));
    }),
  joinRequests: (id) =>
    K.run(() =>
      staff(id)
        ? S()
            .clubJoinRequests.filter((r) => r.club_id === id && !K.blockedWith(r.user_id))
            .map((r) => ({ username: K.userById(r.user_id)!.username!, created_at: r.created_at }))
        : [],
    ),
  answerJoinRequest: (id, username, accept) =>
    K.run(() => {
      if (!staff(id)) return K.refuse("buildNotFound");
      const u = S().users.find((x) => x.username === username);
      if (!u) return;
      S().clubJoinRequests = S().clubJoinRequests.filter((r) => !(r.club_id === id && r.user_id === u.id));
      if (accept && !S().clubMembers.some((m) => m.club_id === id && m.user_id === u.id))
        S().clubMembers.push({ club_id: id, user_id: u.id, role: "member" });
    }),
  setMemberRole: (id, username, role) =>
    K.run(() => {
      if (myRole(id) !== "owner") return K.refuse("buildNotFound");
      const m = memberByName(id, username);
      if (m && m.role !== "owner") m.role = role;
    }),
  removeMember: (id, username) =>
    K.run(() => {
      const me = myRole(id);
      const m = memberByName(id, username);
      if (!me || me === "member") return K.refuse("buildNotFound");
      if (!m || m.role === "owner" || (me === "moderator" && m.role !== "member")) return;
      S().clubMembers = S().clubMembers.filter((x) => x !== m);
    }),
  removeClubPost: (postId) =>
    K.run(() => {
      const p = S().posts.find((x) => x.id === postId && !x.deleted_at);
      if (p?.club_id && staff(p.club_id)) p.deleted_at = now();
    }),
  leaveClub: (id) =>
    K.run(() => {
      if (S().clubMembers.some((m) => m.club_id === id && m.user_id === DEMO_ME && m.role === "owner"))
        K.refuse("ownerCannotLeave");
      S().clubMembers = S().clubMembers.filter((m) => !(m.club_id === id && m.user_id === DEMO_ME));
    }),
  deleteClub: (id) =>
    K.run(() => {
      const c = S().clubs.find((x) => x.id === id && x.owner_id === DEMO_ME);
      if (c) c.deleted_at = now();
    }),
  clubPosts: (clubId, p = 0) =>
    K.run(() =>
      K.page(
        S()
          .posts.filter((x) => x.club_id === clubId)
          .map(publicPost)
          .filter((x): x is PublicPost => x !== null)
          .sort(newest),
        p,
      ),
    ),
  clubBuilds: (clubId) =>
    K.run(() => {
      const c = K.state().clubs.find((x) => x.id === clubId && !x.deleted_at);
      if (!c || (c.visibility === "private" && !isMember(clubId))) return [];
      const members = new Set(
        K.state()
          .clubMembers.filter((m) => m.club_id === clubId)
          .map((m) => K.userById(m.user_id)?.username),
      );
      return K.publicBuilds()
        .filter((b) => members.has(b.owner_username))
        .slice(0, 12);
    }),
  clubEvents: (clubId) =>
    K.run(() =>
      S()
        .events.filter((e) => e.club_id === clubId && e.status === "scheduled" && Date.parse(e.ends_at) > Date.now())
        .map(publicEvent)
        .filter((x): x is PublicEvent => x !== null)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    ),
};

// ---------------------------------------------------------------- search (mirrors search_public's v2 groups)

K.addSearch((hit, q) => {
  const out: SearchHit[] = [];
  for (const r of S().routes) {
    const pr = r.owner_id === DEMO_ME ? null : publicRoute(r);
    if (!pr || K.muted(r.owner_id) || !hit(pr.title)) continue;
    out.push({
      kind: "route",
      id: pr.route_id,
      vehicle_id: null,
      label: pr.title,
      sublabel: `${(pr.distance_m / 1609.344).toFixed(1)} mi · @${pr.owner_username}`,
      has_hero: false,
      exact: pr.title.toLowerCase() === q,
      followers: pr.rating_count,
      updated_at: pr.created_at,
    });
  }
  for (const e of S().events) {
    const pe = publicEvent(e);
    if (!pe || pe.status !== "scheduled" || Date.parse(pe.ends_at) < Date.now() || K.muted(e.organizer_id)) continue;
    if (!hit(`${pe.title} ${pe.location_text}`)) continue;
    out.push({
      kind: "event",
      id: pe.event_id,
      vehicle_id: null,
      label: pe.title,
      sublabel: `${new Date(pe.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${pe.location_text}`,
      has_hero: false,
      exact: pe.title.toLowerCase() === q,
      followers: pe.going_count,
      updated_at: pe.starts_at,
    });
  }
  for (const c of S().clubs) {
    const pc = publicClub(c);
    if (!pc || !hit(pc.name)) continue;
    out.push({
      kind: "club",
      id: pc.club_id,
      vehicle_id: null,
      label: pc.name,
      sublabel: `${pc.members_count} member${pc.members_count === 1 ? "" : "s"}`,
      has_hero: false,
      exact: pc.name.toLowerCase() === q,
      followers: pc.members_count,
      updated_at: pc.created_at,
    });
  }
  return out;
});

// ---------------------------------------------------------------- Torq chat (pitch mode: rule-based, no AI call)

/** Public sample builds in the shape the insight aggregation takes (same visibility rules as the database). */
function communityBuilds(): InsightBuild[] {
  const S = K.state();
  return S.vehicles
    .filter((v) => K.isPublicVehicle(v.id))
    .map((v) => ({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      mods: S.mods
        .filter((m) => m.vehicle_id === v.id && !m.deleted_at && !m.hidden_at)
        .map((m) => {
          const d = m.spec_deltas as SpecDeltas | null;
          return {
            name: m.name,
            category: m.category,
            brand: m.brand,
            status: m.status,
            hpDelta: d?.hp ? deltaInBaseUnit(d, "hp") : null,
            weightDelta: d?.weight ? deltaInBaseUnit(d, "weight") : null,
          };
        }),
    }));
}

export const demoTorqService: TorqServiceApi = {
  insights: (make, model, year) => K.run(() => aggregateInsights(communityBuilds(), make, model, year)),
  ask: (messages, car) =>
    K.run(() => {
      const question = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const insights = car ? aggregateInsights(communityBuilds(), car.make, car.model, car.year) : null;
      return { reply: demoTorqReply(question, insights, car?.myMods ?? []), insights };
    }),
};
