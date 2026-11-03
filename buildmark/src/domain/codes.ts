/**
 * Transfer codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX.
 * The server makes them and stores only a hash; this file just tidies what a person types.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeClaimCode(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export const isClaimCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`).test(s);

/** Share and shop links carry a 64-hex token. */
export const isToken = (s: string) => /^[0-9a-f]{64}$/.test(s);
