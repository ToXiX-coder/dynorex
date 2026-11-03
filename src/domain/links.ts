/**
 * Wishlist links: only plain https links to a real host are allowed. Same rule as the database CHECK.
 * Rejects javascript:, data:, file:, intent:, custom app schemes, credentials (user:pass@), localhost
 * and private-network addresses, and anything with whitespace.
 */
export type LinkCheck = { ok: true; url: string; host: string } | { ok: false; reason: string };

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

export function checkProductLink(raw: string): LinkCheck {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "Add a link" };
  if (s.length > 2048) return { ok: false, reason: "That link is too long" };
  if (/\s/.test(s)) return { ok: false, reason: "Links can't contain spaces" };
  if (!/^https:\/\//i.test(s)) return { ok: false, reason: "Use a link that starts with https://" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "That doesn't look like a link" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Use a link that starts with https://" };
  if (u.username || u.password || s.slice(8).split("/")[0]!.includes("@")) {
    return { ok: false, reason: "Links with a username or password aren't allowed" };
  }
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST.test(host))
    return { ok: false, reason: "That link doesn't go to a public website" };
  return { ok: true, url: u.toString(), host };
}
