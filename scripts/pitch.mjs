// npm run pitch [-- --web | --tunnel | --port 8082 ...]
// Starts the dev server in pitch mode: no sign-in, in-memory sample data, "PITCH MODE" badge.
// Never usable in production: the app ignores EXPO_PUBLIC_DEMO_MODE when APP_ENV=production.
import { spawn } from "node:child_process";

const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: "true", APP_ENV: "development" };
// only simple flags/values are passed through to the Expo CLI
const extra = process.argv.slice(2).filter((a) => /^[\w.:=-]+$/.test(a));
const command = ["npx", "expo", "start", "--clear", ...extra].join(" ");
const child = spawn(command, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
