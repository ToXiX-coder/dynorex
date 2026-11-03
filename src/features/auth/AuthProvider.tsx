import type { Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Linking } from "react-native";
import { forgetPhotos } from "@/components/build/SignedImage";
import { DEMO_ME } from "@/demo/data";
import { onDemoReset } from "@/demo/services";
import { isPublicPath } from "@/domain/deepLinks";
import { config } from "@/services/config";
import { store } from "@/services/purchases/store";
import { profileService } from "@/features/profiles/profileService";
import { cache } from "@/services/cache";
import { getSupabase } from "@/services/supabase/client";
import type { UserRow } from "@/services/supabase/database.types";
import { computeGate, type AuthStatus, type Gate } from "./gate";

export interface AuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** "email", "apple", "google": decides how re-authentication works */
  providers: string[];
}

export interface AuthState {
  status: AuthStatus;
  gate: Gate;
  user: AuthUser | null;
  /** undefined while loading, null if the row hasn't appeared yet */
  profile: UserRow | null | undefined;
  guest: boolean;
  enterGuest: () => void;
  exitGuest: () => void;
  refreshProfile: () => Promise<void>;
  /** Re-reads the session from the server (e.g. after verifying email in a browser). */
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    emailVerified: Boolean(u.email_confirmed_at),
    providers: (u.app_metadata?.providers as string[] | undefined) ?? [u.app_metadata?.provider ?? "email"],
  };
}

const PITCH_USER: AuthUser = { id: DEMO_ME, email: null, emailVerified: true, providers: ["pitch"] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  // Pitch mode: no sign-in. The app opens as the sample account on the in-memory sample backend.
  const [status, setStatus] = useState<AuthStatus>(
    config.demoMode ? "signedIn" : supabase ? "loading" : "unconfigured",
  );
  const [user, setUser] = useState<AuthUser | null>(config.demoMode ? PITCH_USER : null);
  const [profile, setProfile] = useState<UserRow | null | undefined>(undefined);
  const [guest, setGuest] = useState(false);
  const retries = useRef(0);

  // Opened from a shared public link (Discover, a build, a profile) while signed out: show it as a
  // guest instead of the welcome screen. Public pages only ever show public data. The gate waits for
  // this check (briefly) so the link isn't redirected away before we know. Launch URL only: signing
  // in clears guest mode, so a later sign-out still lands on the welcome screen.
  const [launchChecked, setLaunchChecked] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = (publicLink: boolean) => {
      if (done) return;
      done = true;
      if (publicLink) setGuest(true);
      setLaunchChecked(true);
    };
    const timer = setTimeout(() => finish(false), 1500);
    void Linking.getInitialURL()
      .then((url) => finish(Boolean(url && isPublicPath(`/${ExpoLinking.parse(url).path ?? ""}`))))
      .catch(() => finish(false));
    return () => clearTimeout(timer);
  }, []);

  // session: initial read from the keychain, then every auth event
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setUser(toUser(data.session));
        setStatus(data.session ? "signedIn" : "signedOut");
      })
      .catch(() => alive && setStatus("signedOut"));
    let lastUserId: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session));
      setStatus(session ? "signedIn" : "signedOut");
      if (session) {
        lastUserId = session.user.id;
        setGuest(false);
      }
      if (!session) {
        setProfile(undefined);
        // signed out (or account deleted): drop this person's offline copy of their garage
        if (lastUserId) {
          void cache.clearUser(lastUserId);
          forgetPhotos();
        }
        lastUserId = null;
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const res = await profileService.getMine();
    if (res.ok) setProfile(res.data);
  }, []);

  // profile: load once signed in and verified; retry briefly if the sign-up trigger hasn't landed yet
  useEffect(() => {
    if (status !== "signedIn" || !user?.emailVerified) return;
    let alive = true;
    retries.current = 0;
    const load = async () => {
      const res = await profileService.getMine();
      if (!alive) return;
      if (res.ok && res.data === null && retries.current < 5) {
        retries.current += 1;
        setTimeout(load, 800);
        return;
      }
      setProfile(res.ok ? res.data : null);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [status, user?.id, user?.emailVerified]);

  // In-app purchases are tied to the Dynorex account id so the server can match verified store events.
  useEffect(() => {
    if (status === "signedIn" && user?.id) void store.start(user.id).catch(() => {});
    if (status === "signedOut") void store.stop().catch(() => {});
  }, [status, user?.id]);

  // Pitch mode "Reset" reloads the sample profile.
  useEffect(() => {
    if (!config.demoMode) return;
    const off = onDemoReset(() => void refreshProfile());
    return () => {
      off();
    };
  }, [refreshProfile]);

  const refreshSession = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.refreshSession();
    if (data.session) setUser(toUser(data.session));
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      profile,
      guest,
      gate: launchChecked
        ? computeGate({ status, guest, emailVerified: Boolean(user?.emailVerified), profile })
        : "loading",
      enterGuest: () => setGuest(true),
      exitGuest: () => setGuest(false),
      refreshProfile,
      refreshSession,
    }),
    [status, user, profile, guest, launchChecked, refreshProfile, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
