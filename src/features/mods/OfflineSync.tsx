import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useOnline } from "@/hooks/useNetwork";
import { syncQueuedMods } from "./sync";

/** Sends mods saved offline as soon as the connection is back (and once at start-up). Renders nothing. */
export function OfflineSync() {
  const { status, user } = useAuth();
  const online = useOnline();
  const running = useRef(false);

  useEffect(() => {
    if (status !== "signedIn" || !user || online === false || running.current) return;
    running.current = true;
    void syncQueuedMods(user.id).finally(() => {
      running.current = false;
    });
  }, [status, user, online]);

  return null;
}
