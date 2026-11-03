// npm run pitch:export [-- <folder>]   (default dist/pitch)
// Builds pitch mode for the web as files a link can host (the live demo behind the deck's QR code). The bundle's
// absolute "/assets" and "/_expo" URLs become relative to the page's folder, so the demo works from any sub-path.
// Hosts that refuse paths starting with "_" serve _expo/ as expo/, which is where index.html looks.
// Never usable in production: the app ignores EXPO_PUBLIC_DEMO_MODE when APP_ENV=production.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const arg = process.argv[2] ?? "dist/pitch";
if (!/^[\w./\\:-]+$/.test(arg)) throw new Error("Use a plain folder path");
const out = path.resolve(arg);
const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: "true", APP_ENV: "development" };
execSync(`npx expo export --platform web --output-dir "${out}"`, { stdio: "inherit", env });

const dir = path.join(out, "_expo/static/js/web");
const entry = fs.readdirSync(dir).find((f) => f.startsWith("entry-"));
if (!entry) throw new Error("No entry bundle in " + dir);
const file = path.join(dir, entry);
const BASE = '(globalThis.__DX_BASE||"/")+"';
const js = fs
  .readFileSync(file, "utf8")
  .split('uri:"/assets/').join(`uri:${BASE}assets/`)
  .split('m.exports="/assets/').join(`m.exports=${BASE}assets/`)
  .split(':"/_expo/static/').join(`:${BASE}expo/static/`);
const left = (js.match(/"\/assets\/|"\/_expo\//g) || []).length;
if (left) throw new Error(`${left} absolute paths left in the bundle`);
// a demo link is public once shared: refuse anything that looks like a key
for (const bad of ["sk-ant", "service_role", "sk_live", "eyJhbGci"]) {
  if (js.includes(bad)) throw new Error("Something that looks like a secret is in the bundle: " + bad);
}
fs.writeFileSync(file, js);

fs.writeFileSync(
  path.join(out, "index.html"),
  `<title>Dynorex Pitch</title>
<style>
  /* The app draws its own screens; this page only hosts it, in the brand's single dark look. */
  :root { --asphalt: #111315; color-scheme: dark; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--asphalt); overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script>
  // The app's files sit next to this page wherever it is hosted: remember that folder, show the app's home
  // route ("/") so in-app navigation works, then load the bundle from the remembered folder.
  (function () {
    var base = location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
    globalThis.__DX_BASE = base;
    try { history.replaceState(null, "", "/"); } catch (e) {}
    var s = document.createElement("script");
    s.src = base + "expo/static/js/web/${entry}";
    document.body.appendChild(s);
  })();
</script>
`,
);
console.log(`Pitch demo ready in ${out} (bundle ${entry}). Publish _expo/ as expo/.`);
