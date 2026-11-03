/** Component tests (React Native renderer). Logic and database tests run in Vitest instead. */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/component/**/*.test.tsx"],
  setupFiles: ["<rootDir>/tests/component/setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
