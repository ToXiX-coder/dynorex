import { scrub, scrubString } from "@/domain/privacy/scrub";

/**
 * Pure Sentry option builders so the scrubbing can be unit tested without the native SDK.
 * Sentry is disabled when no DSN is configured (local development by default).
 */
type Obj = Record<string, unknown>;

export function scrubEvent<E extends Obj>(event: E): E | null {
  const e = scrub(event) as Obj;
  // Drop request bodies, cookies and headers entirely rather than trusting key matching.
  if (e.request && typeof e.request === "object") {
    const r = e.request as Obj;
    delete r.data;
    delete r.cookies;
    delete r.headers;
    if (typeof r.url === "string") r.url = stripQuery(r.url);
  }
  // Only a random ID may identify a user. No email, username or IP.
  if (e.user && typeof e.user === "object") {
    const id = (e.user as Obj).id;
    e.user = typeof id === "string" ? { id } : undefined;
  }
  return e as E;
}

export function scrubBreadcrumb<B extends Obj>(crumb: B): B | null {
  const c = scrub(crumb) as Obj;
  if (typeof c.message === "string") c.message = scrubString(c.message);
  const data = c.data as Obj | undefined;
  if (data && typeof data.url === "string") data.url = stripQuery(data.url);
  // Network bodies never go to Sentry.
  if (data) {
    delete data.request_body;
    delete data.response_body;
  }
  return c as B;
}

/** Share and request tokens live in paths and queries; keep only the route shape. */
export function stripQuery(url: string): string {
  const noQuery = url.split(/[?#]/)[0] ?? "";
  return noQuery.replace(/\/(s|submit|reset|verify)\/[^/]+/g, "/$1/[token]");
}

export function sentryOptions(env: { dsn?: string; appEnv: string; release: string }) {
  return {
    dsn: env.dsn || undefined,
    enabled: Boolean(env.dsn),
    environment: env.appEnv,
    release: env.release,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: env.appEnv === "production" ? 0.1 : 1.0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
