import { StyleSheet, View } from "react-native";
import Svg, { G, Polygon, Rect } from "react-native-svg";
import { Text } from "@/components/Text";
import type { EventKind } from "@/services/supabase/database.types";
import { a11yHidden } from "@/utils/a11y";
import { color, radius, space, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * Race-poster header for an event: the date as the hero (lime month, huge day, weekday and start time), racing
 * stripes on the right, and a GROUP DRIVE / MEET badge. Cancelled events are dimmed with a red CANCELLED tag.
 * Decorative only: the card or page around it already reads the title, time and place to screen readers.
 */
export function EventPoster({
  startsAt,
  kind,
  cancelled = false,
  height = 112,
}: {
  startsAt: string;
  kind: EventKind;
  cancelled?: boolean;
  height?: number;
}) {
  const d = new Date(startsAt);
  const month = d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const day = String(d.getDate());
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const drive = kind === "drive";
  const stripe = drive ? color.accent : color.text;
  return (
    <View style={[styles.wrap, { height }, cancelled && { opacity: 0.55 }]} {...a11yHidden}>
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 300 112"
        preserveAspectRatio="xMaxYMid slice"
      >
        <Rect x={0} y={0} width={300} height={112} fill="#0e1012" />
        <G opacity={drive ? 0.9 : 0.35}>
          <Polygon points="170,112 214,0 236,0 192,112" fill={stripe} opacity={0.85} />
          <Polygon points="204,112 248,0 258,0 214,112" fill={stripe} opacity={0.55} />
          <Polygon
            points="226,112 270,0 300,0 300,8 259,112"
            fill={drive ? color.danger : stripe}
            opacity={drive ? 0.8 : 0.3}
          />
        </G>
        {drive
          ? // checkered strip along the right edge for group drives
            Array.from({ length: 14 }, (_, i) => (
              <Rect
                key={i}
                x={288 + (i % 2) * 6}
                y={Math.floor(i / 2) * 16}
                width={6}
                height={8}
                fill="#F2EFE8"
                opacity={0.8}
              />
            ))
          : null}
      </Svg>
      <View style={styles.date}>
        <Text style={[type.specUnit, { color: color.accent, letterSpacing: 2 }]}>{month}</Text>
        <Text style={[type.impact, { fontSize: 52, lineHeight: 52 }]}>{day}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.specUnit, { color: color.text, letterSpacing: 1.5 }]}>{weekday}</Text>
        <Text style={[type.spec, { fontSize: 26, lineHeight: 28 }]}>{time}</Text>
        <View style={[styles.badge, drive ? styles.badgeDrive : styles.badgeMeet, cancelled && styles.badgeCancelled]}>
          <Text
            style={[type.specUnit, { color: drive && !cancelled ? color.onAccent : color.text, letterSpacing: 1.5 }]}
          >
            {cancelled ? "CANCELLED" : drive ? "GROUP DRIVE" : "MEET"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.lg,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: color.hairline,
    },
    date: { alignItems: "center", minWidth: 64 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: space.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      marginTop: space.xxs,
      transform: [{ skewX: "-10deg" }],
    },
    badgeDrive: { backgroundColor: color.accent },
    badgeMeet: { borderWidth: 1, borderColor: color.text },
    badgeCancelled: { backgroundColor: "transparent", borderWidth: 2, borderColor: color.danger },
  }),
);
