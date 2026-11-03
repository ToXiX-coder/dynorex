import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { haptic } from "@/services/haptics";
import { pickPhoto, type PreparedPhoto } from "@/services/media/photos";
import { config } from "@/services/config";
import { space } from "@/theme/tokens";
import { scanReceipt, type ScannedReceipt } from "./receiptScan";

/**
 * D-68: "Scan a receipt" at the top of Add mod. The photo is read on the server and the form's blank fields fill in;
 * the owner checks them before saving, and the same photo goes in as the mod's receipt.
 */
export function ReceiptScanCard({ onScanned }: { onScanned: (r: ScannedReceipt, photo: PreparedPhoto) => string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [result, setResult] = useState<{ filled: string[] } | "unreadable" | null>(null);

  const scan = async (source: "camera" | "library") => {
    setError(null);
    setResult(null);
    const picked = await pickPhoto(source);
    if (!picked.ok) return setError(picked.error.key);
    if (!picked.data) return;
    setBusy(true);
    const r = await scanReceipt(picked.data);
    setBusy(false);
    if (!r.ok) {
      haptic.warning();
      return setError(r.error.key);
    }
    if (!r.data) {
      haptic.warning();
      return setResult("unreadable");
    }
    haptic.success();
    setResult({ filled: onScanned(r.data, picked.data) });
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="title">Scan a receipt</Text>
      <Text variant="caption" muted>
        Fills in the part, brand, part number, cost, date and shop from a receipt photo, and adds it as this mod&apos;s
        receipt. The photo is read by our AI provider (Anthropic) and not kept. Check every field before you save.
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title="Snap receipt" loading={busy} onPress={() => void scan("camera")} />
        <Button title="From photos" variant="secondary" disabled={busy} onPress={() => void scan("library")} />
      </View>
      {error ? <InlineError kind={error} /> : null}
      {result === "unreadable" ? (
        <Text>Couldn&apos;t read a receipt in that photo. Try again in good light, or fill the form in yourself.</Text>
      ) : result ? (
        <InlineNotice
          title={config.demoMode ? "Sample reading (pitch mode)" : "Receipt read"}
          body={
            result.filled.length
              ? `Filled in: ${result.filled.join(", ")}. Check them below; the photo is attached as the receipt.`
              : "Nothing new to fill in: the fields were already typed. The photo is attached as the receipt."
          }
        />
      ) : null}
    </Card>
  );
}
