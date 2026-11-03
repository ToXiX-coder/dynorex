import type { ExpoConfig } from "expo/config";

/** Only EXPO_PUBLIC_* values reach the app bundle. Demo mode is refused in production builds. */
const APP_ENV = process.env.APP_ENV ?? "development";
const PAPER = "#F4F1EA";

const config: ExpoConfig = {
  name: APP_ENV === "production" ? "Buildmark" : "Buildmark (Dev)",
  slug: "buildmark",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "buildmark",
  // A paper record: one light look on purpose.
  userInterfaceStyle: "light",
  backgroundColor: PAPER,
  ios: {
    bundleIdentifier: APP_ENV === "production" ? "app.buildmark" : "app.buildmark.dev",
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: APP_ENV === "production" ? "app.buildmark" : "app.buildmark.dev",
    blockedPermissions: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"],
  },
  web: { bundler: "metro", output: "single" },
  plugins: [
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission: "Buildmark uses your photos so you can attach receipts and dyno sheets to a record.",
        cameraPermission: "Buildmark uses the camera so you can photograph receipts and dyno sheets.",
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { appEnv: APP_ENV },
};

if (APP_ENV === "production" && process.env.EXPO_PUBLIC_DEMO_MODE === "true") {
  throw new Error("Demo mode cannot be enabled in a production build.");
}

export default config;
