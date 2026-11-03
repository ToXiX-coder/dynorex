import * as Sentry from "@sentry/react-native";

/**
 * Startup timing for the spec 15.1 targets, measured from when the JavaScript bundle starts:
 *   shell_ready     the session is known (any gate other than loading); the intro may still be playing
 *   content_visible the intro has lifted and the app is on screen: what the person actually waits for (D-67)
 *   garage_cached   Garage drawn from the on-device cache                       target < 1 s after launch
 *   garage_fresh    Garage refreshed from the server
 * The spec 15.1 cold-start target (< 3 s) is judged on content_visible. Native process start before JS is
 * covered by Sentry's own app-start measurement. Each mark is sent once per launch as a Sentry span (no user
 * data) and printed in development builds.
 */
export type PerfMark = "shell_ready" | "content_visible" | "garage_cached" | "garage_fresh";

const jsStart = Date.now();
const done = new Set<PerfMark>();

export function mark(name: PerfMark): number | null {
  if (done.has(name)) return null;
  done.add(name);
  const ms = Date.now() - jsStart;
  if (__DEV__) console.log(`[perf] ${name} ${ms} ms`);
  try {
    Sentry.startInactiveSpan({ name: `dynorex.${name}`, op: "app.perf", startTime: jsStart / 1000 }).end();
  } catch {
    // monitoring must never break the app
  }
  return ms;
}
