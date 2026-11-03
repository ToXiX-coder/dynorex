import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { buildPath } from "@/domain/deepLinks";
import { kindOf } from "@/domain/vehicleKind";
import type { PublicBuild } from "@/services/supabase/database.types";
import { radius, space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { Card } from "../cards/Card";
import { Text } from "../Text";
import { PublicImage } from "./PublicImage";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** A public build in a list (Discover, profiles, search). Opens the public build page. */
export function BuildCard({ build, heroUrl, compact }: { build: PublicBuild; heroUrl?: string; compact?: boolean }) {
  const car = `${build.year} ${build.make} ${build.model}`;
  const followers = Number(build.followers_count);
  const mods = Number(build.mods_count);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${build.title}, ${car}, by @${build.owner_username}, ${plural(mods, "mod")}, ${plural(followers, "follower")}`}
      onPress={() => router.push(buildPath(build.vehicle_id))}
      style={withPress([{ minHeight: touch.min }, compact && styles.compactWrap])}
    >
      <Card style={styles.card}>
        <PublicImage
          uri={heroUrl}
          expected={build.has_hero}
          alt={`Photo of ${car}`}
          art={{
            make: build.make,
            model: build.model,
            year: build.year,
            seed: build.vehicle_id,
            hint: build.title,
            kind: kindOf(build),
          }}
          style={compact ? styles.thumbCompact : styles.thumb}
        />
        <View style={{ gap: space.xxs, flexShrink: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {build.title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>{`${car} · @${build.owner_username}`}</Text>
          <Text variant="caption">{`${plural(mods, "mod")} · ${plural(followers, "follower")}`}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, overflow: "hidden" },
  compactWrap: { width: 240 },
  thumb: { width: "100%", height: 160, borderRadius: radius.md },
  thumbCompact: { width: "100%", height: 110, borderRadius: radius.md },
});
