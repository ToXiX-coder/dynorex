const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/**", ".expo/**", ".claude/**", "web-pilot/**", "buildmark/**","supabase/functions/**", "node_modules/**"] },
  {
    // tests deliberately contain fake secret-shaped strings to prove they get scrubbed
    files: ["src/**/*.{ts,tsx}", "app.config.ts"],
    rules: {
      // Privileged keys must never be referenced from app code.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/service_role|SUPABASE_SERVICE_ROLE_KEY|sk_live_|sk_test_|sk\\.eyJ/]",
          message: "Server-only secrets must never appear in client code.",
        },
      ],
    },
  },
]);
