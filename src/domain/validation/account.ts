import { z } from "zod";

/**
 * Account and profile rules. These mirror the database constraints and supabase/config.toml exactly
 * (tests/unit/account.test.ts checks the reserved list against the migration), so the app can explain
 * problems before the server rejects them. The server remains the authority.
 */

/** Must match public.is_reserved_username() in the Phase 1 migration. */
export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "staff",
  "mod",
  "moderator",
  "dynorex",
  "dynorexplus",
  "torq",
  "official",
  "team",
  "security",
  "settings",
  "discover",
  "build",
  "builds",
  "garage",
  "u",
  "v",
  "api",
  "app",
  "www",
  "login",
  "signup",
  "account",
  "me",
  "null",
  "undefined",
  "events",
  "marketplace",
  "route",
] as const;

const CONTROL_CHARS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/** Same policy as supabase/config.toml: 10+ characters with a lowercase, an uppercase and a digit. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use 128 characters or fewer")
  .refine((s) => /[a-z]/.test(s), "Add a lowercase letter")
  .refine((s) => /[A-Z]/.test(s), "Add an uppercase letter")
  .refine((s) => /\d/.test(s), "Add a number");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: letters, numbers and _ only")
  .refine((s) => !(RESERVED_USERNAMES as readonly string[]).includes(s), "That name is reserved");

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v),
    z
      .string()
      .max(max, `${label}: ${max} characters max`)
      .refine((s) => !CONTROL_CHARS.test(s), `${label} has characters we can't store`)
      .nullable(),
  );

export const profileSchema = z.object({
  display_name: optionalText(40, "Display name"),
  bio: optionalText(280, "Bio"),
  general_location: optionalText(60, "Location"),
  years_experience: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int("Whole years only").min(0, "Can't be negative").max(80, "80 years max").nullable(),
  ),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema });
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password") });

/** First issue per field, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
