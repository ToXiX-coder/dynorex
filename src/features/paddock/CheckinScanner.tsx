import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Modal, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import { parseCheckinQr } from "@/domain/events";
import { color, radius, space } from "@/theme/tokens";

/**
 * Scan the host's check-in QR. The camera is only opened after the person taps "Scan" and grants access; no
 * frames are stored or sent. A scan only fills in the 6-digit code for THIS event; the server then checks it
 * exactly like a typed code. Typing the code always works too (camera denied, web, or a cracked screen).
 */
export function CheckinScanner({
  visible,
  eventId,
  onCode,
  onClose,
}: {
  visible: boolean;
  eventId: string;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<"wrongQr" | "scanUnavailable" | null>(null);
  const handled = useRef(false);

  const close = () => {
    handled.current = false;
    setProblem(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} transparent={false}>
      <View style={{ flex: 1, backgroundColor: color.background, padding: space.lg, gap: space.md }}>
        <Text variant="section" accessibilityRole="header">
          Scan check-in code
        </Text>
        {!permission ? null : !permission.granted ? (
          <View style={{ gap: space.sm }}>
            <Text>Dynorex uses the camera only while this screen is open, to read the host&apos;s QR code.</Text>
            {permission.canAskAgain ? (
              <Button title="Allow camera" onPress={() => void requestPermission()} />
            ) : (
              <Text muted>Camera access is off for Dynorex. Turn it on in Settings, or type the code instead.</Text>
            )}
          </View>
        ) : (
          <View style={{ flex: 1, borderRadius: radius.md, overflow: "hidden" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onMountError={() => setProblem("scanUnavailable")}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                const code = parseCheckinQr(data, eventId);
                if (!code) return setProblem("wrongQr");
                handled.current = true;
                onCode(code);
                close();
              }}
              accessibilityLabel="Camera view. Point it at the host's QR code."
            />
          </View>
        )}
        {problem ? <InlineError kind={problem} /> : null}
        <Button title="Type the code instead" variant="secondary" onPress={close} />
      </View>
    </Modal>
  );
}
