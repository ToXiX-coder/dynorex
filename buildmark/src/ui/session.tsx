import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { config } from "@/services/config";
import { getSupabase } from "@/services/supabase";

/** Who is signed in. Demo mode is always "signed in" as the sample owner. */
type Session = { state: "loading" | "signed_out" | "signed_in"; email: string | null };
const Ctx = createContext<Session>({ state: "loading", email: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<Session>(() =>
    config.demoMode
      ? { state: "signed_in", email: "sample owner" }
      : { state: getSupabase() ? "loading" : "signed_out", email: null },
  );
  useEffect(() => {
    const sb = config.demoMode ? null : getSupabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) =>
      set(data.session ? { state: "signed_in", email: data.session.user.email ?? null } : { state: "signed_out", email: null }),
    );
    const { data } = sb.auth.onAuthStateChange((_e, session) =>
      set(session ? { state: "signed_in", email: session.user.email ?? null } : { state: "signed_out", email: null }),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
