import * as Sentry from "@sentry/react-native";
import { config } from "@/services/config";
import { sentryOptions } from "./sentryOptions";

let started = false;

/** Starts Sentry only when a DSN is configured. All events and breadcrumbs pass the scrubber. */
export function startMonitoring() {
  if (started) return;
  started = true;
  Sentry.init(
    sentryOptions({ dsn: config.sentryDsn ?? undefined, appEnv: config.appEnv, release: config.release }) as Parameters<
      typeof Sentry.init
    >[0],
  );
}

export { Sentry };
