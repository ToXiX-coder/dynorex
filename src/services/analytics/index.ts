import { AppState, Platform } from "react-native";
import { AnalyticsQueue, noopSink } from "./queue";

/**
 * App-wide analytics queue. No vendor is chosen yet (docs/decisions.md D-05), so events go to a
 * no-op sink, and tracking stays OFF until consent/ATT status is known. Wiring is real so events
 * start flowing as soon as a sink and consent UI exist.
 */
const anonymousId = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const analytics = new AnalyticsQueue({
  sink: noopSink,
  anonymousId,
  platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
});

AppState.addEventListener("change", (s) => {
  if (s !== "active") void analytics.flush();
});
