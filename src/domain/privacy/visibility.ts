export const VISIBILITIES = ["public", "friends_only", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export interface ViewerContext {
  viewerId: string | null;
  ownerId: string;
  /** True only for an explicitly ACCEPTED mutual relationship. A follow is never enough. */
  acceptedRelationship: boolean;
  /** Either side has blocked the other. */
  blocked: boolean;
  isDeleted: boolean;
}

/**
 * Who may see a record. This mirrors the database policies and views; the database is the
 * enforcement point and this function exists for client UX and for tests that pin the rules.
 *
 * Accepted relationships do not exist in the MVP, so every caller passes
 * acceptedRelationship=false and friends_only behaves like private for everyone except the owner.
 */
export function canView(visibility: Visibility, ctx: ViewerContext): boolean {
  if (ctx.isDeleted) return false;
  if (ctx.viewerId !== null && ctx.viewerId === ctx.ownerId) return true;
  if (ctx.blocked) return false;
  switch (visibility) {
    case "public":
      return true;
    case "friends_only":
      return ctx.viewerId !== null && ctx.acceptedRelationship;
    case "private":
      return false;
  }
}

/** The effective visibility of a child is the most restrictive of itself and its parents. */
export function effectiveVisibility(...levels: Visibility[]): Visibility {
  const rank: Record<Visibility, number> = { public: 0, friends_only: 1, private: 2 };
  return levels.reduce<Visibility>((acc, v) => (rank[v] > rank[acc] ? v : acc), "public");
}
