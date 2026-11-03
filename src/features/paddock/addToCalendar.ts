import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { eventIcs, icsFileName } from "@/domain/calendar";
import { PUBLIC_ORIGIN } from "@/domain/deepLinks";
import type { PublicEvent } from "@/services/supabase/database.types";

/**
 * Hands the event to the phone's calendar as an .ics file (share sheet on iOS/Android, a download on the web).
 * Returns false if this device can't do it, so the screen can say so instead of pretending.
 */
export async function addToCalendar(ev: PublicEvent): Promise<boolean> {
  return shareIcs(eventIcs({ ...ev, url: `${PUBLIC_ORIGIN}/events/${ev.event_id}` }), icsFileName(ev.title));
}

/** Any .ics, the same way (D-68: maintenance due dates use it too). */
export async function shareIcs(ics: string, name: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      const doc = (globalThis as { document?: Document }).document;
      if (!doc) return false;
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      const a = doc.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return true;
    }
    if (!(await Sharing.isAvailableAsync())) return false;
    const file = new File(Paths.cache, name);
    file.write(ics);
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/calendar",
      UTI: "com.apple.ical.ics",
      dialogTitle: "Add to your calendar",
    });
    return true;
  } catch {
    return false;
  }
}
