import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

// On web, NetInfo's reachability probe pings the site root, which fails when the app is hosted under a sub-path
// (a shared preview link) and wrongly shows "offline". The browser's own online/offline state is enough there,
// so the probe is off and its answer ignored.
const web = Platform.OS === "web";
if (web) NetInfo.configure({ reachabilityShouldRun: () => false });

/** true = online, false = definitely offline, null = not known yet (treated as online). */
export function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(
          s.isConnected === false || (!web && s.isInternetReachable === false)
            ? false
            : s.isConnected === null
              ? null
              : true,
        );
      }),
    [],
  );
  return online;
}
