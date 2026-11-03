import path from "node:path";
import { defineConfig } from "vitest/config";

/** Database latency measurements (npm run perf:db). Separate from the normal suite: it loads a lot of data. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/perf/**/*.perf.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: "forks",
    execArgv: ["--max-old-space-size=4096"],
  },
});
