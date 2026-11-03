import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // PGlite boots a real Postgres in WASM; give the database suite room.
    testTimeout: 30_000,
    // PGlite instances are memory-heavy; one test file at a time keeps the WASM heap stable.
    fileParallelism: false,
    // each test file in a fresh process with headroom; PGlite's WASM heap otherwise crashes on Windows
    pool: "forks",
    isolate: true,
    execArgv: ["--max-old-space-size=4096"],
  },
});
