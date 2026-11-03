import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { Platform, type View } from "react-native";
import { captureRef } from "react-native-view-shot";

/**
 * Saves a drawn card as a PNG at 3x and hands it to the share sheet. Browsers can't hand an image to a share sheet
 * reliably, so on the web it returns the image as a data URI for the screen to show (long-press or right-click to
 * save); on phones it returns null once shared.
 */
export async function shareCardImage(
  ref: RefObject<View | null>,
  size: { width: number; height: number },
  title: string,
): Promise<string | null> {
  const opts = { format: "png" as const, quality: 1, width: size.width * 3, height: size.height * 3 };
  if (Platform.OS === "web") return captureRef(ref, { ...opts, result: "data-uri" });
  const uri = await captureRef(ref, { ...opts, result: "tmpfile" });
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title });
  return null;
}
