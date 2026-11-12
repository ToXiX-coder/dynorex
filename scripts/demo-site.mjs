// npm run demo:site   (output dist/demo-site)
// D-75: the pitch demo as a site served from the root of its own address (Vercel builds this on every push; see
// vercel.json). Unlike pitch:export, paths stay absolute and every route falls back to index.html, so deep links
// such as /build/<id> open directly. Same rules as pitch:export: no .env files, no backend, no keys in the bundle,
// and never usable in production (the app ignores EXPO_PUBLIC_DEMO_MODE when APP_ENV=production).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("dist/demo-site");
const env = {
  ...process.env,
  EXPO_NO_DOTENV: "1",
  EXPO_PUBLIC_SUPABASE_URL: "",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
  EXPO_PUBLIC_DEMO_MODE: "true",
  APP_ENV: "development",
};
fs.rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --clear --output-dir "${out}"`, { stdio: "inherit", env });

// a demo site is public: refuse anything that looks like a key or the live project
const dir = path.join(out, "_expo/static/js/web");
for (const f of fs.readdirSync(dir)) {
  const js = fs.readFileSync(path.join(dir, f), "utf8");
  for (const bad of ["sk-ant", "service_role", "sk_live", "eyJhbGci", "pcawlovgmwhtgtiuyicf"]) {
    if (js.includes(bad)) throw new Error(`Something that looks like a secret or the live backend is in ${f}: ${bad}`);
  }
}
// sample data never belongs in search results: the whole demo is noindex (vercel.json also sends the header)
fs.writeFileSync(
  path.join(out, "robots.txt"),
  "# Dynorex demo with sample data: keep it out of search.\nUser-agent: *\nDisallow: /\n",
);
const html = path.join(out, "index.html");
fs.writeFileSync(
  html,
  fs
    .readFileSync(html, "utf8")
    .replace("<head>", '<head><meta name="robots" content="noindex, nofollow">')
    .replace(/<title>[^<]*<\/title>/, "<title>Dynorex demo</title>"),
);
console.log(`Demo site ready in ${out}.`);
