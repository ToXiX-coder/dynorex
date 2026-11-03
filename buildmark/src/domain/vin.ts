/** VINs: 17 characters, no I, O or Q. The check digit applies to North American VINs only, so it's a hint. */

export const normalizeVin = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isVinShape = (s: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(s));

const VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function vinCheckDigitOk(raw: string): boolean {
  const v = normalizeVin(raw);
  if (!isVinShape(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i]!;
    sum += (/\d/.test(ch) ? Number(ch) : VALUES[ch]!) * WEIGHTS[i]!;
  }
  const r = sum % 11;
  return v[8] === (r === 10 ? "X" : String(r));
}

/** Shown to the owner only, e.g. "…4821". */
export const vinTail = (v: string | null) => (v ? `…${normalizeVin(v).slice(-4)}` : "No VIN");
