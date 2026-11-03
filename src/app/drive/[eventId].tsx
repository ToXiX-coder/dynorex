import * as Location from "expo-location";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Polygon, Text as SvgText } from "react-native-svg";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { formatDistance, haversineM } from "@/domain/routes";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { driveService } from "@/features/paddock/driveService";
import { eventService } from "@/features/paddock/eventService";
import { config } from "@/services/config";
import type { DrivePosition, PublicEvent } from "@/services/supabase/database.types";
import { themed } from "@/theme/themed";
import { color, radius, space } from "@/theme/tokens";

const POLL_MS = 4000;

/**
 * Live group drive (D-60): everyone in the drive who chose to share, on the route, refreshed every few seconds.
 * Your position is sent only while "Share my position" is on and this screen is open; leaving stops it and
 * removes your dot. The host and people going can see it, from 30 minutes before until 30 minutes after.
 */
export default function LiveDrive() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = typeof eventId === "string" && isUuid(eventId) ? eventId : "";
  const [ev, setEv] = useState<PublicEvent | null | undefined>(undefined);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [drivers, setDrivers] = useState<DrivePosition[]>([]);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [denied, setDenied] = useState(false);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const fake = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    let alive = true;
    void eventService.publicEvent(id).then(async (r) => {
      if (!alive) return;
      const e = r.ok ? r.data : null;
      setEv(e);
      if (e?.route_id) {
        const rr = await lineService.publicRoute(e.route_id);
        if (alive && rr.ok && rr.data) setRoute(rr.data.points.map(([a, b]) => [a, b] as [number, number]));
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // everyone's positions, every few seconds while this screen is open
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await driveService.positions(id);
      if (alive && r.ok) setDrivers(r.data);
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const stopWatching = useCallback(() => {
    watch.current?.remove();
    watch.current = null;
    if (fake.current) clearInterval(fake.current);
    fake.current = null;
  }, []);

  const send = useCallback(
    async (lat: number, lng: number, heading: number | null) => {
      if (Date.now() - lastSent.current < POLL_MS - 500) return;
      lastSent.current = Date.now();
      const r = await driveService.share(id, lat, lng, heading);
      if (!r.ok) {
        setError(r.error);
        stopWatching();
        setSharing(false);
      }
    },
    [id, stopWatching],
  );

  // leaving the screen stops sharing and removes your dot
  useEffect(
    () => () => {
      stopWatching();
      void driveService.stop(id);
    },
    [id, stopWatching],
  );

  const start = async () => {
    setError(null);
    if (config.demoMode) {
      // pitch mode: a sample position a little behind the pack, no location permission needed
      const p = route[Math.max(0, Math.floor(route.length / 3))] ?? [34.05, -118.25];
      setSharing(true);
      lastSent.current = 0;
      void send(p[0], p[1], 90);
      fake.current = setInterval(() => {
        lastSent.current = 0;
        void send(p[0], p[1], 90);
      }, POLL_MS);
      return;
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setDenied(true);
    setDenied(false);
    setSharing(true);
    lastSent.current = 0;
    watch.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: POLL_MS, distanceInterval: 10 },
      (loc) => void send(loc.coords.latitude, loc.coords.longitude, loc.coords.heading ?? null),
    );
  };
  const stop = async () => {
    stopWatching();
    setSharing(false);
    await driveService.stop(id);
    setDrivers((ds) => ds.filter((d) => !d.mine));
  };

  if (ev === undefined) return <LoadingState label="Loading drive" />;
  if (!ev || ev.kind !== "drive") return <InlineError kind="buildNotFound" />;
  const me = drivers.find((d) => d.mine);

  return (
    <Screen>
      <Stack.Screen options={{ title: ev.title }} />
      <InlineNotice
        headsUp
        title="Eyes on the road"
        body="Let a passenger watch the map. Follow road laws: this is a cruise, not a race."
      />
      <LiveMap route={route} drivers={drivers} />
      {error ? <InlineError kind={error.key} /> : null}
      {denied ? (
        <InlineNotice
          headsUp
          title="Location is off for Dynorex"
          body="Turn on location for Dynorex in your phone's settings to share your position. You can still watch."
        />
      ) : null}
      {sharing ? (
        <Button title="Stop sharing my position" variant="secondary" fullWidth onPress={() => void stop()} />
      ) : (
        <Button title="Share my position" fullWidth onPress={() => void start()} />
      )}
      <Text variant="caption" muted>
        Only the host and people going can see positions, and only around the drive. Dynorex deletes them 30 minutes
        after it ends. Leaving this screen stops sharing.
      </Text>
      <Card style={{ gap: space.xs }}>
        <Text variant="title">{`In the drive · ${drivers.length} sharing`}</Text>
        {drivers.length === 0 ? (
          <Text variant="caption" muted>
            Nobody is sharing yet. Positions show here as people turn sharing on.
          </Text>
        ) : (
          drivers.map((d, i) => (
            <View key={d.username} style={styles.row} accessible>
              <View
                style={[styles.dot, { backgroundColor: d.mine ? color.accent : DOT_COLORS[i % DOT_COLORS.length] }]}
              />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {d.mine ? "You" : `@${d.username}`}
              </Text>
              <Text variant="caption" muted>
                {[
                  me && !d.mine ? formatDistance(haversineM([me.lat, me.lng], [d.lat, d.lng])) + " away" : null,
                  d.seconds_ago <= 5 ? "now" : `${d.seconds_ago} s ago`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const DOT_COLORS = ["#3DDCFF", "#FF8A1F", "#B79CFF", "#FF5FA8", "#FFD400"];
// SVG text on web otherwise falls back to a serif face
const SVG_FONT = Platform.OS === "web" ? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" : undefined;

/** The route as a line and each driver as an arrow (or a dot without a heading), fitted to the box. */
function LiveMap({ route, drivers }: { route: [number, number][]; drivers: DrivePosition[] }) {
  const W = 340;
  const H = 240;
  const pad = 22;
  const pts = [...route, ...drivers.map((d) => [d.lat, d.lng] as [number, number])];
  if (!pts.length)
    return (
      <View style={[styles.map, { alignItems: "center", justifyContent: "center" }]}>
        <Text variant="caption" muted>
          Waiting for positions…
        </Text>
      </View>
    );
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // keep the shape: one scale for both axes (longitude shrinks with latitude)
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLng - minLng) * k, 0.002);
  const spanY = Math.max(maxLat - minLat, 0.002);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * s) / 2;
  const oy = (H - spanY * s) / 2;
  const x = (lng: number) => ox + (lng - minLng) * k * s;
  const y = (lat: number) => H - oy - (lat - minLat) * s;
  const line = route.map(([la, lo], i) => `${i ? "L" : "M"}${x(lo).toFixed(1)} ${y(la).toFixed(1)}`).join(" ");
  return (
    <View
      style={styles.map}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Map of the drive with ${drivers.length} people sharing their position`}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {route.length > 1 ? (
          <>
            <Path
              d={line}
              stroke={color.border}
              strokeWidth={6}
              strokeOpacity={0.35}
              fill="none"
              strokeLinecap="round"
            />
            <Path d={line} stroke={color.text} strokeWidth={2} strokeOpacity={0.7} fill="none" strokeLinecap="round" />
          </>
        ) : null}
        {drivers.map((d, i) => {
          const fill = d.mine ? color.accent : DOT_COLORS[i % DOT_COLORS.length]!;
          const cx = x(d.lng);
          const cy = y(d.lat);
          return (
            <G key={d.username}>
              {d.heading !== null ? (
                <Polygon
                  points="0,-11 7,8 0,4 -7,8"
                  fill={fill}
                  stroke={color.background}
                  strokeWidth={1.5}
                  transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${d.heading})`}
                />
              ) : (
                <Circle cx={cx} cy={cy} r={7} fill={fill} stroke={color.background} strokeWidth={1.5} />
              )}
              <SvgText
                x={cx}
                y={cy - 14}
                fontSize={11}
                fontWeight="700"
                fontFamily={SVG_FONT}
                fill={color.text}
                textAnchor="middle"
              >
                {d.mine ? "You" : d.username.length > 14 ? `${d.username.slice(0, 13)}…` : d.username}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    map: {
      height: 260,
      borderRadius: radius.lg,
      backgroundColor: color.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: color.hairline,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 36 },
    dot: { width: 12, height: 12, borderRadius: 6 },
  }),
);
