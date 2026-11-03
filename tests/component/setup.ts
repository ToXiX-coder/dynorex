// Shared Jest setup for component tests: in-memory stand-ins for native storage and network status.
import { jest } from "@jest/globals";
import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => {} }));
// Push and location are native-only; screens are tested with them reporting "not set up".
jest.mock("expo-notifications", () => ({
  setNotificationHandler: () => {},
  useLastNotificationResponse: () => null,
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: false }),
  getExpoPushTokenAsync: async () => ({ data: "" }),
  setNotificationChannelAsync: async () => null,
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
}));
// Store purchases (native SDK): screens see "no offerings" unless a test says otherwise.
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: () => {},
    logIn: async () => ({}),
    logOut: async () => ({}),
    getOfferings: async () => ({ current: null }),
    purchasePackage: async () => ({}),
    restorePurchases: async () => ({}),
    showManageSubscriptions: async () => {},
  },
  PACKAGE_TYPE: { MONTHLY: "MONTHLY", ANNUAL: "ANNUAL" },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "1" },
}));
// Camera (Paddock QR check-in): native view, so a stand-in that never grants or scans.
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: true }, async () => ({ granted: false })],
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ granted: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
  Accuracy: { Lowest: 1 },
}));
