/**
 * Which part of the app a person may see right now. Client-side only: this shapes navigation, while
 * the database enforces what anyone can actually read or write.
 *
 *   loading -> welcome -> verify -> username -> onboarding -> app
 *
 * Guests (signed out, "look around first") and builds with no backend get the app shell; anything that
 * needs an account asks them to sign in.
 */
export type Gate = "loading" | "welcome" | "verify" | "username" | "onboarding" | "app";
export type AuthStatus = "loading" | "unconfigured" | "signedOut" | "signedIn";

export interface GateInput {
  status: AuthStatus;
  guest: boolean;
  emailVerified: boolean;
  /** undefined = still loading; null = row not there yet (sign-up trigger lag) */
  profile:
    | {
        username: string | null;
        onboarding_completed_at: string | null;
        onboarding_skipped_at: string | null;
      }
    | null
    | undefined;
}

export function computeGate(i: GateInput): Gate {
  if (i.status === "loading") return "loading";
  if (i.status === "unconfigured" || i.status === "signedOut") return i.guest ? "app" : "welcome";
  if (!i.emailVerified) return "verify";
  if (!i.profile) return "loading";
  if (!i.profile.username) return "username";
  if (!i.profile.onboarding_completed_at && !i.profile.onboarding_skipped_at) return "onboarding";
  return "app";
}
