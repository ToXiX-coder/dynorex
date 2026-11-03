/**
 * Removes sensitive values before anything leaves the device or server in logs, Sentry or analytics.
 * Two passes: sensitive KEYS are redacted whatever their value, and sensitive-looking VALUES
 * (VINs, emails, JWTs, bearer tokens, card numbers, coordinates) are redacted under any key.
 */
export const REDACTED = "[redacted]";

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|vin|email|phone|lat(itude)?$|^lng$|lon(gitude)?$|coord|card|cvc|iban|account[-_]?number|refresh|jwt|bearer|address|signature/i;

const VALUE_PATTERNS: RegExp[] = [
  /\b[A-HJ-NPR-Z0-9]{17}\b/gi, // VIN
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, // JWT
  /\bBearer\s+[\w.~+/=-]+/gi,
  /\b(?:\d[ -]?){13,19}\b/g, // card-like digit runs
  /-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g, // "lat, lng" with 4+ decimals
  /\b(sk|rk|pk)_(live|test)_[\w]+/g, // payment keys
  /\b(sk|tk)\.eyJ[\w.-]+/g, // Mapbox secret/temporary tokens
];

export function scrubString(s: string): string {
  return VALUE_PATTERNS.reduce((acc, re) => acc.replace(re, REDACTED), s);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Deep copy with redactions. Handles cycles and caps depth so it never throws. */
export function scrub<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 8) return REDACTED as unknown as T;
  if (typeof value === "string") return scrubString(value) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]" as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, seen)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : scrub(v, depth + 1, seen);
  }
  return out as T;
}

/** True when a payload contains anything the scrubber would change. Analytics drops such events. */
export function containsSensitive(value: unknown): boolean {
  return JSON.stringify(scrub(value)) !== JSON.stringify(value);
}
