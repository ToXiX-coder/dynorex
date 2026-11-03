const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/**", "dist-demo/**", ".expo/**", "node_modules/**", "research/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "app.config.ts"],
    rules: {
      // Privileged keys must never be referenced from app code.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/service_role|SUPABASE_SERVICE_ROLE_KEY|sk_live_|sk_test_/]",
          message: "Server-only secrets must never appear in client code.",
        },
      ],
    },
  },
]);
