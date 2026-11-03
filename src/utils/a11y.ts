import { Platform } from "react-native";

/**
 * Props that hide a decorative element from screen readers on every platform.
 * (iOS/Android props are not valid DOM attributes, so web uses aria-hidden.)
 */
export const a11yHidden =
  Platform.OS === "web"
    ? ({ "aria-hidden": true } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const);
