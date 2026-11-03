/**
 * Badges (D-58), earned from activity and counted by the server (public.achievements): public activity, plus how
 * many event check-ins (never which ones). Keep these in step with the migration; the copy says what you did, never
 * how good your car is.
 */
export const ACHIEVEMENTS = [
  { id: "first_build", label: "Garage Open", detail: "Shared a build", glyph: "⚑" },
  { id: "wrench_10", label: "Wrench Time", detail: "10 finished mods on public builds", glyph: "✦" },
  { id: "road_tripper", label: "Road Tripper", detail: "Shared 3 drives", glyph: "➶" },
  { id: "host", label: "Meet Host", detail: "Hosted an event", glyph: "★" },
  { id: "regular", label: "Regular", detail: "Checked in at 5 events", glyph: "◉" },
  { id: "club_founder", label: "Club Founder", detail: "Started a club", glyph: "♜" },
  { id: "seller", label: "Parts Mover", detail: "Sold a part in the Shop", glyph: "⇄" },
  { id: "shop_pro", label: "Shop Pro", detail: "Finished a job through Services", glyph: "⚙" },
  { id: "crowd_favorite", label: "Crowd Favorite", detail: "25 likes on posts", glyph: "♥" },
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

/** Known badges only, in display order (unknown ids from a newer server are ignored). */
export function earnedBadges(ids: readonly string[]) {
  return ACHIEVEMENTS.filter((a) => ids.includes(a.id));
}
