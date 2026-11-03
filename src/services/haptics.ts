import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Small taps that make actions feel physical on a phone: a light tap for toggles (like, follow, RSVP), a
 * success buzz when something the server confirmed is done (saved, checked in), a warning on refusal.
 * Never on web (vibration there is more annoying than helpful) and never allowed to throw.
 */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === "web") return;
  try {
    fn().catch(() => {});
  } catch {
    // no haptics engine (simulator, tests): stay silent
  }
};

export const haptic = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
