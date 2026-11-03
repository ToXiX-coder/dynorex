// Builds Buildmark for the web with sample data and no backend, then serves it:
//   npm run demo:web [-- --port 8083] [-- --no-build]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-demo");
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const port = Number(arg("--port", "8083"));

if (!process.argv.includes("--no-build")) {
  const r = spawnSync("npx expo export --platform web --output-dir dist-demo --clear", {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, EXPO_PUBLIC_DEMO_MODE: "true", APP_ENV: "development" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf" };
http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(out, path.normalize(url).replace(/^([/\\])+/, ""));
    // single-page app: any route that isn't a file gets index.html
    if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(out, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Buildmark demo on http://localhost:${port}`));
