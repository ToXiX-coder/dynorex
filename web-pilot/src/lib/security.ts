import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export class AppError extends Error {
  constructor(
    public code: "not_found" | "invalid" | "conflict" | "forbidden" | "rate_limited",
    message: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** 256 bits of randomness, URL safe. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const addDays = (days: number, from = new Date()) =>
  new Date(from.getTime() + days * 86_400_000).toISOString();

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | undefined,
): Promise<boolean> {
  // Always do the work so a missing account takes about as long as a wrong password.
  const [, saltHex, hashHex] = (stored ?? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`).split("$");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return stored !== undefined && timingSafeEqual(actual, expected);
}

/** Small in-memory limiter. Per process, resets on restart. Fine for a pilot, not for scale. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max)
    throw new AppError("rate_limited", "Too many tries. Please wait a few minutes.");
  recent.push(now);
  hits.set(key, recent);
}
export const resetRateLimits = () => hits.clear();
