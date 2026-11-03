import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ComingSoonBadge } from "@/components/feedback/States";
import { InlineError } from "@/components/feedback/Inline";
import { CalendarIcon, CarIcon, LockIcon, RoadIcon, TagIcon, WrenchIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { useFlags } from "@/providers/AppProviders";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { backOr } from "@/components/navigation/stackOptions";

const V2 = [
  { title: "Create event", detail: "Part of Paddock." },
  { title: "List a part", detail: "Part of the Shop in Paddock." },
  { title: "Record a drive", detail: "Part of Line." },
];

/** Creation chooser opened by the centre + button. Build actions work; v2 actions are honest teasers. */
export default function AddChooser() {
  const { status } = useAuth();
  const flags = useFlags();
  const shopOn = flags.paddock && flags.marketplace;
  const [picking, setPicking] = useState<VehicleCard[] | null>(null);
  const [errorKey, setErrorKey] = useState<Parameters<typeof InlineError>[0]["kind"] | null>(null);

  if (status !== "signedIn") {
    return (
      <Screen edges={["bottom", "left", "right"]}>
        <SignInPrompt message="Sign in to add to your garage" />
      </Screen>
    );
  }

  const go = (path: Parameters<typeof router.replace>[0]) => router.replace(path);

  return (
    <Screen edges={["bottom", "left", "right"]}>
      <Text variant="section" accessibilityRole="header">
        {picking ? "Which vehicle?" : "What are you adding?"}
      </Text>
      {errorKey ? <InlineError kind={errorKey} /> : null}

      {picking ? (
        picking.length === 0 ? (
          <Text>Add a vehicle first, then its mods.</Text>
        ) : (
          picking.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={`Add a mod to ${v.nickname ?? `${v.year} ${v.make} ${v.model}`}`}
              onPress={() => go(`/garage/${v.id}/mods/new`)}
              style={[styles.row, styles.active]}
            >
              <WrenchIcon color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{v.nickname ?? `${v.year} ${v.make} ${v.model}`}</Text>
                {v.nickname ? <Text variant="caption" muted>{`${v.year} ${v.make} ${v.model}`}</Text> : null}
              </View>
            </Pressable>
          ))
        )
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => go("/garage/new")} style={[styles.row, styles.active]}>
            <CarIcon color={color.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="title">Add vehicle</Text>
              <Text variant="caption" muted>
                Year, make, model, photo.
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              setErrorKey(null);
              const r = await buildService.listVehicles(0);
              if (!r.ok) return setErrorKey(r.error.key);
              // a sold car's record is read-only, so it can't take new mods
              const open = r.data.filter((v) => !v.sold_at);
              if (open.length === 1) return go(`/garage/${open[0]!.id}/mods/new`);
              setPicking(open);
            }}
            style={[styles.row, styles.active]}
          >
            <WrenchIcon color={color.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="title">Add mod</Text>
              <Text variant="caption" muted>
                Log a part or job on a vehicle.
              </Text>
            </View>
          </Pressable>
          {flags.paddock ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => go("/paddock/new")}
              style={[styles.row, styles.active]}
            >
              <CalendarIcon color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="title">Create event</Text>
                <Text variant="caption" muted>
                  Host a meet in Paddock.
                </Text>
              </View>
            </Pressable>
          ) : null}
          {flags.line ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => go("/line/record")}
              style={[styles.row, styles.active]}
            >
              <RoadIcon color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="title">Record a drive</Text>
                <Text variant="caption" muted>
                  Track the route in Line, then keep it or share it.
                </Text>
              </View>
            </Pressable>
          ) : null}
          {shopOn ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => go("/paddock/sell")}
              style={[styles.row, styles.active]}
            >
              <TagIcon color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="title">List a part</Text>
                <Text variant="caption" muted>
                  Sell a part in the Paddock Shop.
                </Text>
              </View>
            </Pressable>
          ) : null}
          {V2.filter(
            (it) =>
              !(flags.paddock && it.title === "Create event") &&
              !(flags.line && it.title === "Record a drive") &&
              !(shopOn && it.title === "List a part"),
          ).map((it) => (
            <View
              key={it.title}
              accessible
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel={`${it.title}. Coming soon`}
              style={styles.row}
            >
              <LockIcon color={color.disabledText} />
              <View style={{ flex: 1, gap: space.xxs }}>
                <Text variant="title" style={{ color: color.textMuted }}>
                  {it.title}
                </Text>
                <Text variant="caption" muted>
                  {it.detail}
                </Text>
                <ComingSoonBadge />
              </View>
            </View>
          ))}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => (picking ? setPicking(null) : backOr())}
        style={styles.close}
      >
        <Text variant="label">{picking ? "Back" : "Close"}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      minHeight: touch.min + space.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderStyle: "dashed",
      borderColor: color.border,
    },
    active: { borderStyle: "solid", backgroundColor: color.surface, borderColor: color.surface },
    close: { minHeight: touch.min, alignItems: "center", justifyContent: "center" },
  }),
);
