import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Web demos only: opening the app once with `?motion=full` plays every animation for the rest of the tab's
 * session, even when the computer asks for reduced motion (a pitch on a borrowed laptop). Phones always follow
 * the OS setting.
 */
function motionForced(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("motion") === "full") {
      window.sessionStorage.setItem("dynorex.motion", "full");
    }
    return window.sessionStorage.getItem("dynorex.motion") === "full";
  } catch {
    return false;
  }
}

/** True when the OS asks for reduced motion. Animations must offer a static path when true. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (motionForced()) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
