import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { notificationHref } from "@/domain/deepLinks";
import { analytics } from "@/services/analytics";

if (Platform.OS !== "web") {
  // While the app is open, show the banner but don't buzz or badge.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Opens the right screen when someone taps a notification, including on cold start. It is mounted
 * inside the signed-in app shell, so the auth check has already happened by the time it routes.
 * The payload is validated (entity_type + entity_id); anything else opens the inbox.
 */
export function NotificationRouter() {
  if (Platform.OS === "web") return null;
  return <NativeNotificationRouter />;
}

function NativeNotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const category = typeof data?.category === "string" ? data.category.slice(0, 40) : "unknown";
    analytics.track("notification_tapped", { notification_type: category });
    router.push((notificationHref(data) ?? "/inbox") as Href);
  }, [response]);

  return null;
}
