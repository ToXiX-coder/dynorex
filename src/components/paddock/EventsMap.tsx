import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/Text";
import { staticPinsMapUrl } from "@/domain/maps";
import { config } from "@/services/config";
import { color, radius, space } from "@/theme/tokens";

export type MapPin = { lat: number; lng: number };

/**
 * Event meeting spots on a map, pins numbered in list order (1-9). Uses Mapbox static images with the public
 * token; without one (or if the image fails) it draws the pins on a plain grid, keeping their relative
 * positions, so the layout still reads. The list next to it carries the details for screen readers.
 */
export function EventsMap({ pins, label, height = 240 }: { pins: readonly MapPin[]; label: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  const shown = pins.slice(0, 9);
  const url = failed ? null : staticPinsMapUrl(shown, config.mapboxToken, { width: 600, height: 320 });
  if (url)
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
  return <PinGrid pins={shown} label={label} height={height} />;
}

function PinGrid({ pins, label, height }: { pins: readonly MapPin[]; label: string; height: number }) {
  const W = 600;
  const H = 320;
  const pad = 40;
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const spanLat = Math.max(maxLat - minLat, 0.01);
  const spanLng = Math.max(maxLng - minLng, 0.01);
  const x = (lng: number) => pad + ((lng - minLng) / spanLng) * (W - 2 * pad) || W / 2;
  const y = (lat: number) => H - pad - ((lat - minLat) / spanLat) * (H - 2 * pad) || H / 2;
  return (
    <View style={[styles.grid, { height }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <Rect x={0} y={0} width={W} height={H} fill="#0e1012" />
        <G opacity={0.35}>
          {Array.from({ length: 11 }, (_, i) => (
            <Line key={`v${i}`} x1={i * 60} y1={0} x2={i * 60} y2={H} stroke={color.border} strokeWidth={1} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * 64} x2={W} y2={i * 64} stroke={color.border} strokeWidth={1} />
          ))}
        </G>
        {pins.map((p, i) => (
          <G key={i}>
            <Circle
              cx={pins.length === 1 ? W / 2 : x(p.lng)}
              cy={pins.length === 1 ? H / 2 : y(p.lat)}
              r={17}
              fill={color.accent}
            />
            <SvgText
              x={pins.length === 1 ? W / 2 : x(p.lng)}
              y={(pins.length === 1 ? H / 2 : y(p.lat)) + 6}
              fontSize={18}
              fontWeight="800"
              fill={color.onAccent}
              textAnchor="middle"
            >
              {String(i + 1)}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: "100%", borderRadius: radius.md, overflow: "hidden" },
});
