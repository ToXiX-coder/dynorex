import type { ExpoConfig } from "expo/config";

/**
 * One config, three environments. APP_ENV picks bundle IDs and names so dev, staging and
 * production can be installed side by side. Only EXPO_PUBLIC_* values reach the app bundle;
 * see docs/setup.md for the full variable list.
 */
type AppEnv = "development" | "staging" | "production";
const APP_ENV = (process.env.APP_ENV ?? "development") as AppEnv;
if (!["development", "staging", "production"].includes(APP_ENV)) {
  throw new Error(`APP_ENV must be development, staging or production, got "${APP_ENV}"`);
}

const suffix = APP_ENV === "production" ? "" : `.${APP_ENV === "development" ? "dev" : "staging"}`;
const nameSuffix = APP_ENV === "production" ? "" : APP_ENV === "development" ? " (Dev)" : " (Staging)";
const ASPHALT = "#111315";
// The Expo project (B-02). Push tokens and over-the-air updates both need it; without it updates stay off.
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
// Brand fonts built into the iOS and Android apps (D-67). Each file is named for the font's PostScript name, which
// is the name iOS uses and, from the file name, the name Android uses: the same names as src/theme/fonts.ts.
const BRAND_FONTS = [
  "./assets/fonts/Orbitron-Black.ttf",
  "./assets/fonts/Orbitron-ExtraBold.ttf",
  "./assets/fonts/BarlowCondensed-ExtraBold.ttf",
  "./assets/fonts/BarlowCondensed-Bold.ttf",
  "./assets/fonts/BarlowCondensed-BlackItalic.ttf",
];

const config: ExpoConfig = {
  name: `Dynorex${nameSuffix}`,
  slug: "dynorex",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "dynorex",
  // Dark always. There is no light theme.
  // "automatic" so the Auto theme can follow the phone (D-59); the default theme is still dark
  userInterfaceStyle: "automatic",
  backgroundColor: ASPHALT,
  icon: "./assets/brand/png/app-icon-1024.png",
  ios: {
    bundleIdentifier: `app.dynorex${suffix}`,
    supportsTablet: false,
    associatedDomains: APP_ENV === "production" ? ["applinks:dynorex.app"] : [],
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: `app.dynorex${suffix}`,
    // Nearby only needs a rough position; never precise or background location.
    blockedPermissions: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_BACKGROUND_LOCATION"],
    adaptiveIcon: {
      backgroundColor: ASPHALT,
      foregroundImage: "./assets/brand/png/android-adaptive-foreground-432.png",
      monochromeImage: "./assets/brand/png/android-monochrome-432.png",
    },
    intentFilters:
      APP_ENV === "production"
        ? [
            {
              action: "VIEW",
              autoVerify: true,
              data: [{ scheme: "https", host: "dynorex.app" }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ]
        : [],
  },
  web: { bundler: "metro", favicon: "./assets/brand/png/favicon-48.png" },
  // Over-the-air updates (D-67): JavaScript fixes reach installed apps without a store review. A build only takes
  // updates made from the same native code (fingerprint), checks on launch without waiting, and applies them on the
  // next open. Channels come from eas.json (staging, pitch, production).
  runtimeVersion: { policy: "fingerprint" },
  updates: EAS_PROJECT_ID
    ? { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 }
    : { enabled: false },
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-image",
    ["expo-font", { fonts: BRAND_FONTS }],
    "expo-secure-store",
    "@sentry/react-native",
    // Push: asked only when the person turns it on in Settings > Notifications.
    ["expo-notifications", { color: "#AAFF00", defaultChannel: "default" }],
    // Paddock check-in (v2): camera only while the scan screen is open; no microphone, nothing recorded.
    [
      "expo-camera",
      {
        cameraPermission: "Dynorex uses the camera to scan an event host's check-in QR code. Nothing is recorded.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    // Nearby (opt-in): foreground only, and the position is rounded to a ~55 km cell on the device.
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Dynorex can use your rough location (rounded to about 55 km on your phone) to show builds near you. It's optional.",
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/png/splash-logo-1242.png",
        imageWidth: 220,
        backgroundColor: ASPHALT,
        // dark always: same splash in both OS modes
        dark: { image: "./assets/brand/png/splash-logo-1242.png", backgroundColor: ASPHALT },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { appEnv: APP_ENV, ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}) },
};

export default config;
