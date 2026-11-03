import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { create } from "qrcode/lib/core/qrcode";

/**
 * A QR code drawn with SVG on the device (nothing is sent anywhere to make it). Dark modules on white with a
 * quiet zone, which every scanner needs regardless of the app's dark theme.
 */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const m = create(value, { errorCorrectionLevel: "M" }).modules;
    let path = "";
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++) if (m.get(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d: path, n: m.size + 8 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ alignSelf: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}
