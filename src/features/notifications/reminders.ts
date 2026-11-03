import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * On-device reminders (D-58): maintenance due dates and events you're going to. They're scheduled on this phone
 * only (nothing goes to a server), keyed by a stable id so rescheduling replaces the old one. Web has no local
 * notifications, so there these quietly do nothing and the in-app "due soon" lists carry the reminder.
 */
export type ReminderKey = `maintenance:${string}` | `event:${string}`;

export const remindersSupported = () => Platform.OS !== "web";

/** Ask once, only when the person turns a reminder on. */
export async function allowReminders(): Promise<boolean> {
  if (!remindersSupported()) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return true;
    if (!p.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Schedule (or replace) one reminder. Dates in the past are skipped. Never throws. */
/** `open` is the same payload shape as a push (entity_type + entity_id), so a tap routes the same way. */
export async function setReminder(
  key: ReminderKey,
  when: Date,
  title: string,
  body: string,
  open: { entity_type: "event" | "maintenance"; entity_id: string },
) {
  if (!remindersSupported()) return false;
  try {
    await Notifications.cancelScheduledNotificationAsync(key);
    if (when.getTime() <= Date.now()) return false;
    if (!(await Notifications.getPermissionsAsync()).granted) return false;
    await Notifications.scheduleNotificationAsync({
      identifier: key,
      content: { title, body, data: { ...open, category: "reminder" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearReminder(key: ReminderKey) {
  if (!remindersSupported()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(key);
  } catch {
    // nothing scheduled
  }
}

/** 9 am local time on a "YYYY-MM-DD" day. */
export function morningOf(isoDay: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 9, 0, 0);
}

/** Two hours before an event starts. */
export const beforeEvent = (startsAt: string) => new Date(Date.parse(startsAt) - 2 * 3_600_000);
