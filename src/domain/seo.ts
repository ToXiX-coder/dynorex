// D-74: what the web build tells search engines. Kept in step with public/robots.txt.

/** Paths that must never be indexed: secret links, chats, offers, the owner's own screens. */
export const PRIVATE_PREFIXES = [
  "/history",
  "/confirm",
  "/chat",
  "/offers",
  "/requests",
  "/garage",
  "/settings",
  "/onboarding",
];

/** Whole path segments only: "/garage/v1" is private, "/garages-of-the-world" isn't. */
export const isPrivatePath = (path: string | null | undefined) =>
  !!path && PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

export const pageTitle = (title: string) => (title ? `${title} | Dynorex` : "Dynorex");

/** "Trail Bee: 2025 Sur-Ron Light Bee X build, 4 mods" for a build page's title. */
export function buildTitle(b: {
  nickname?: string | null;
  year: number | null;
  make: string;
  model: string;
  mods?: number;
}) {
  const car = [b.year, b.make, b.model].filter(Boolean).join(" ");
  const mods = b.mods ? `, ${b.mods} ${b.mods === 1 ? "mod" : "mods"}` : "";
  return b.nickname ? `${b.nickname}: ${car} build${mods}` : `${car} build${mods}`;
}

/** One line for search results and previews, at most 160 characters, cut on a word. */
export function metaDescription(...parts: (string | null | undefined)[]) {
  const s = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (s.length <= 160) return s;
  const cut = s.slice(0, 159);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : 159)}…`;
}
