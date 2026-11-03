import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { TextField } from "@/components/forms/TextField";
import { Text } from "@/components/Text";
import { looksLikeStreetAddress, placeText, type Near, type PlaceSuggestion } from "@/domain/places";
import { config } from "@/services/config";
import { haptic } from "@/services/haptics";
import { withPress } from "@/theme/press";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { placesService } from "./placesService";
import { themed } from "@/theme/themed";
import { AlertIcon } from "@/components/icons";

const KIND_ICON: Record<PlaceSuggestion["kind"], string> = {
  poi: "◆",
  address: "⌂",
  street: "═",
  place: "◎",
  other: "•",
};

/**
 * The meeting place: type and pick from places as you go. "Use my location" ranks places near you first; your
 * position stays on the phone except for a ~1 km rounded point sent with the search to Mapbox, and is never
 * saved. You can always just type the place yourself.
 */
export function PlaceField({
  label,
  value,
  onChange,
  error,
  onCoords,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  /** the picked place's coordinates (for the events map), or null once the host types over it */
  onCoords?: (c: Near | null) => void;
}) {
  const [near, setNear] = useState<Near | null>(null);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [session, setSession] = useState(() => Crypto.randomUUID());
  const [typed, setTyped] = useState(false); // only suggest while the host is typing, not for a saved value
  const [results, setResults] = useState<{ q: string; places: PlaceSuggestion[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<PlaceSuggestion | null>(null);
  const available = placesService.available();
  const q = value.trim();
  const searching = typed && available && q.length >= 3 && results?.q !== q;

  useEffect(() => {
    if (!typed || !available || q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await placesService.suggest(q, session, near, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (r.ok) {
        setProblem(null);
        setResults({ q, places: r.places });
      } else {
        setResults({ q, places: [] });
        setProblem(
          r.reason === "offline"
            ? "You're offline. Type the place yourself."
            : "Couldn't load places. Type it yourself.",
        );
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, typed, available, session, near]);

  const shareLocation = async () => {
    setLocating(true);
    setLocNote(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocNote("Location is off for Dynorex. You can still type any place.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      haptic.success();
    } catch {
      setLocNote("Couldn't get your location. You can still type any place.");
    } finally {
      setLocating(false);
    }
  };

  const choose = (p: PlaceSuggestion) => {
    haptic.select();
    onChange(placeText(p));
    setPicked(p);
    setTyped(false);
    setResults(null);
    // the place's own coordinates (same search session), so the event can show on the map
    if (onCoords) void placesService.retrieve(p.id, session).then(onCoords);
    setSession(Crypto.randomUUID()); // a new search session for the next place
  };

  const list = typed && results?.q === q ? results.places : [];
  return (
    <View style={{ gap: space.xs }}>
      <TextField
        label={label}
        required
        value={value}
        onChangeText={(v) => {
          setTyped(true);
          setPicked(null);
          onCoords?.(null);
          onChange(v);
        }}
        maxLength={120}
        hint={
          available
            ? "Start typing a venue, car park or street. Shown publicly: pick a public spot, never a home address."
            : "Shown publicly. Use a public spot like a car park or venue, never a home address."
        }
        error={error}
        placeholder="Search places"
        autoCorrect={false}
      />

      {available ? (
        near ? (
          <View style={styles.nearRow}>
            <Text variant="caption" accent>
              ◉ Showing places near you
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setNear(null)} hitSlop={8}>
              <Text variant="caption" muted style={{ textDecorationLine: "underline" }}>
                Stop using my location
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Asks for your location to show nearby places first. It isn't saved."
            onPress={() => void shareLocation()}
            disabled={locating}
            style={withPress(styles.locBtn)}
          >
            {locating ? <ActivityIndicator color={color.accent} /> : <Text style={{ color: color.accent }}>◉</Text>}
            <Text variant="bodyStrong">{locating ? "Finding you…" : "Use my location for nearby places"}</Text>
          </Pressable>
        )
      ) : (
        <Text variant="caption" muted>
          Place suggestions aren&apos;t connected in this build yet. Type the place yourself.
        </Text>
      )}
      {locNote ? (
        <Text variant="caption" muted>
          {locNote}
        </Text>
      ) : null}

      {searching ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color.accent} />
          <Text variant="caption" muted>
            Finding places…
          </Text>
        </View>
      ) : null}
      {list.length ? (
        <View style={styles.list} accessibilityRole="list" accessibilityLabel="Place suggestions">
          {list.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}${p.detail ? `, ${p.detail}` : ""}`}
              onPress={() => choose(p)}
              style={withPress([styles.item, i < list.length - 1 && styles.divider])}
            >
              <Text style={styles.icon}>{KIND_ICON[p.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.name}
                </Text>
                {p.detail ? (
                  <Text variant="caption" muted numberOfLines={1}>
                    {p.detail}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          <Text variant="caption" muted style={styles.credit}>
            {config.demoMode ? "Sample places (pitch mode)" : "Places by Mapbox"}
          </Text>
        </View>
      ) : typed && results?.q === q && !problem && q.length >= 3 ? (
        <Text variant="caption" muted>
          No matching places. You can keep what you typed.
        </Text>
      ) : null}
      {problem ? (
        <Text variant="caption" muted>
          {problem}
        </Text>
      ) : null}
      {picked && looksLikeStreetAddress(picked) ? (
        <View style={{ flexDirection: "row", gap: space.xs, alignItems: "flex-start" }}>
          <View style={{ paddingTop: 2 }}>
            <AlertIcon color={color.danger} size={14} />
          </View>
          <Text variant="caption" style={{ flex: 1 }}>
            That&apos;s a street address. Make sure it&apos;s a public spot, not someone&apos;s home.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    nearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
    locBtn: {
      minHeight: touch.min,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderColor: color.accent,
      backgroundColor: color.surface,
    },
    loading: { flexDirection: "row", alignItems: "center", gap: space.sm },
    list: {
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderColor: color.hairline,
      backgroundColor: color.surface,
      overflow: "hidden",
    },
    item: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md },
    divider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
    icon: { color: color.accent, width: 18, textAlign: "center" },
    credit: { paddingHorizontal: space.md, paddingVertical: space.xs, textAlign: "right" },
  }),
);
