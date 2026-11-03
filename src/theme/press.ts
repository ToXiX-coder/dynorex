import type { StyleProp, ViewStyle } from "react-native";

/** The same pressed look as Button (slight dim and shrink), for tappable cards and rows. */
const PRESSED: ViewStyle = { opacity: 0.85, transform: [{ scale: 0.985 }] };

export function withPress(base?: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [base, pressed && PRESSED];
}
