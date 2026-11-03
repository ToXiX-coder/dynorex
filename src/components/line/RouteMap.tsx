import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/Text";
import { staticRouteMapUrl } from "@/domain/maps";
import type { ShapePoint } from "@/domain/routes";
import { config } from "@/services/config";
import { radius, space } from "@/theme/tokens";
import { RouteTrace } from "./RouteTrace";

/**
 * A shared route on a Mapbox map (Static Images API, public pk. token only). Only the server's TRIMMED public
 * points are ever sent to Mapbox; a private drive is drawn on the device with RouteTrace and never leaves it.
 * No token, a URL that's too long, or a failed image all fall back to the trace.
 */
export function RouteMap({
  shared,
  height = 220,
  label,
}: {
  shared: readonly [number, number][];
  height?: number;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : staticRouteMapUrl(shared, config.mapboxToken, { width: 600, height: 300 });
  if (!url) return <RouteTrace points={shared as readonly ShapePoint[]} height={height} label={label} />;
  return (
    <View style={{ gap: space.xxs }}>
      <Image
        source={{ uri: url }}
        accessibilityRole="image"
        accessibilityLabel={label}
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={{ width: "100%", height, borderRadius: radius.md }}
      />
      <Text variant="caption" muted>
        © Mapbox © OpenStreetMap
      </Text>
    </View>
  );
}
