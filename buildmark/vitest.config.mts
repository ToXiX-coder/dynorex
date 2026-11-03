import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // PGlite is memory-heavy; one file at a time keeps its WASM heap stable on Windows.
    fileParallelism: false,
    pool: "forks",
    execArgv: ["--max-old-space-size=4096"],
  },
});
