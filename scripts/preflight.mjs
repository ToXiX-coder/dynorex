// npm run preflight [-- path/to/.env.production]
// Release configuration check (spec Phase 6: "verify production configuration, secrets ..."). Reads the
// environment (and optionally an env file) the way an EAS production build would, and fails on anything
// unsafe or missing. Prints only variable NAMES and verdicts, never values.
import { Buffer } from "node:buffer";
import fs from "node:fs";
import process from "node:process";

const file = process.argv[2];
const env = { ...process.env };
if (file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const results = [];
const check = (level, name, ok, why) => results.push({ level, name, ok, why });
const has = (k) => Boolean(env[k] && env[k].trim());
const jwtRole = (t) => {
  try {
    return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).role ?? null;
  } catch {
    return null;
  }
};

// --- environment
check("fail", "APP_ENV is production", env.APP_ENV === "production", "production bundle id, no dev overrides");
check("fail", "pitch mode off", env.EXPO_PUBLIC_DEMO_MODE !== "true", "EXPO_PUBLIC_DEMO_MODE must not be set");
check(
  "fail",
  "no flag overrides",
  !has("EXPO_PUBLIC_FLAG_OVERRIDES"),
  "production ignores them; remove to avoid confusion",
);

// --- backend
check(
  "fail",
  "Supabase URL is https",
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.EXPO_PUBLIC_SUPABASE_URL ?? ""),
  "EXPO_PUBLIC_SUPABASE_URL",
);
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
check(
  "fail",
  "Supabase key is the public anon/publishable key",
  Boolean(anon) && !anon.startsWith("sb_secret_") && jwtRole(anon) !== "service_role",
  "never the service role or a secret key",
);

// --- every public value scanned for secrets
const SECRET = /(sk_live_|sk_test_|sb_secret_|sk\.eyJ|-----BEGIN|service_role)/;
const leaked = Object.entries(env).filter(
  ([k, v]) =>
    (k.startsWith("EXPO_PUBLIC_") && SECRET.test(String(v))) ||
    (k.startsWith("EXPO_PUBLIC_") && jwtRole(String(v)) === "service_role"),
);
check("fail", "no secrets in EXPO_PUBLIC_* values", leaked.length === 0, leaked.map(([k]) => k).join(", ") || "clean");
check(
  "fail",
  "Mapbox token is public (pk.) or unset",
  !has("EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN") || env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.startsWith("pk."),
  "EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN",
);

// --- observability, push, purchases
check("fail", "Sentry DSN set", has("EXPO_PUBLIC_SENTRY_DSN"), "crash-free rate can't be measured without it");
check("fail", "EAS project id set", has("EXPO_PUBLIC_EAS_PROJECT_ID"), "push tokens need it");
check(
  "warn",
  "RevenueCat iOS key",
  has("EXPO_PUBLIC_REVENUECAT_IOS_KEY") && env.EXPO_PUBLIC_REVENUECAT_IOS_KEY.startsWith("appl_"),
  "needed to sell Dynorex+ on iOS",
);
check(
  "warn",
  "RevenueCat Android key",
  has("EXPO_PUBLIC_REVENUECAT_ANDROID_KEY") && env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.startsWith("goog_"),
  "needed to sell Dynorex+ on Android",
);

// --- store requirements
for (const k of ["EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_PRIVACY_URL", "EXPO_PUBLIC_GUIDELINES_URL"])
  check("fail", `${k} published (https)`, /^https:\/\//.test(env[k] ?? ""), "required by both stores / the spec");
check(
  "fail",
  "support email set",
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EXPO_PUBLIC_SUPPORT_EMAIL ?? ""),
  "EXPO_PUBLIC_SUPPORT_EMAIL",
);
check(
  "warn",
  "store links for the web banner",
  has("EXPO_PUBLIC_APP_STORE_URL") && has("EXPO_PUBLIC_PLAY_STORE_URL"),
  "optional until listings exist",
);

// --- code-level release switches
const flags = fs.readFileSync(new URL("../src/domain/flags.ts", import.meta.url), "utf8");
const on = (k) => new RegExp(`${k}:\\s*true`).test(flags.slice(flags.indexOf("DEFAULT_FLAGS")));
check(
  "warn",
  "Dynorex+ on sale in this release",
  on("subscriptions"),
  "DEFAULT_FLAGS.subscriptions (a reviewed code change)",
);
check(
  "fail",
  "unfinished v2 features off",
  !on("line") && !on("paddock") && !on("marketplace"),
  "Line / Paddock / marketplace must stay off until their own exit gates pass",
);
const appConfig = fs.readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
check(
  "fail",
  "universal links configured",
  appConfig.includes("applinks:dynorex.app") && appConfig.includes('host: "dynorex.app"'),
  "app.config.ts",
);

// --- report
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "PASS" : r.level === "fail" ? "FAIL" : "WARN";
  if (!r.ok && r.level === "fail") failed++;
  console.log(`${mark.padEnd(5)} ${r.name}${r.ok ? "" : `  (${r.why})`}`);
}
console.log(failed ? `\n${failed} blocking problem(s). Not ready to build for production.` : "\nPreflight passed.");
process.exit(failed ? 1 : 0);
