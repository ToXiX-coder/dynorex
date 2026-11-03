import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Share } from "react-native";
import type { Api } from "@/services/api";
import { errorText } from "@/services/errors";
import { getApi } from "@/services";

/** Loads data whenever the screen comes into focus; reload() after a change. */
export function useLoad<T>(fn: (api: Api) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(deps);
  const reload = useCallback(
    async () => {
      const api = getApi();
      if (!api) return setError("Buildmark isn't connected to a backend yet.");
      try {
        setData(await fn(api));
        setError(null);
      } catch (e) {
        setError(errorText(e));
      }
    },
    // the caller's deps decide when to reload, not the identity of the inline function
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { data, error, reload };
}

/** Copy on the web; the share sheet on phones. Resolves to what happened, so the screen can say so honestly. */
export async function shareText(text: string): Promise<"copied" | "shared" | "failed"> {
  try {
    if (Platform.OS === "web") {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    const r = await Share.share({ message: text });
    return r.action === Share.sharedAction ? "shared" : "failed";
  } catch {
    return "failed";
  }
}
