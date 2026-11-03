/** Initials avatars: a stable color per person and readable initials (rules for components/social/Avatar). */

// Muted paint-chip colors that all hold white initials at 4.5:1 or better (checked in tests/unit/finalPass.test.ts).
export const AVATAR_SWATCHES = ["#8E2430", "#1F4F8F", "#2E6B47", "#6A3F99", "#9A4F12", "#1E6A72", "#7A3B5A", "#4A5568"];

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_SWATCHES[h % AVATAR_SWATCHES.length]!;
}

export function initials(name: string) {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s_.-]+/)
    .filter(Boolean);
  const s = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}
