import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Platform, Switch, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { BuildCard } from "@/components/social/BuildCard";
import { Text } from "@/components/Text";
import { regionCell } from "@/domain/deepLinks";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import type { PublicBuild } from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";
import { socialService } from "./socialService";
import { usePublicMedia } from "./usePublicMedia";

async function fetchNearby(): Promise<
  | { ok: true; region: { share_builds: boolean } | null; builds: PublicBuild[] | null }
  | { ok: false; error: MappedError }
> {
  const r = await socialService.myRegion();
  if (!r.ok) return r;
  if (!r.data) return { ok: true, region: null, builds: null };
  const n = await socialService.nearby(0);
  return n.ok ? { ok: true, region: r.data, builds: n.data } : n;
}

/**
 * Nearby builds, opt-in only. The phone asks for location once, rounds it to a ~55 km grid cell ON THE
 * DEVICE, and sends only that cell. Results never show distance. Saying no (or turning it off) never
 * blocks anything else: Discover falls back to trending.
 */
export function NearbySection({ onFallback }: { onFallback: () => void }) {
  const { status } = useAuth();
  const [region, setRegion] = useState<{ share_builds: boolean } | null | undefined>(undefined);
  const [builds, setBuilds] = useState<PublicBuild[] | null>(null);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const media = usePublicMedia((builds ?? []).filter((b) => b.has_hero).map((b) => b.vehicle_id));

  const apply = useCallback((s: Awaited<ReturnType<typeof fetchNearby>>) => {
    if (!s.ok) return setError(s.error);
    setError(null);
    setRegion(s.region);
    if (s.region) setShare(s.region.share_builds);
    setBuilds(s.builds);
  }, []);
  const load = () => fetchNearby().then(apply);

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    void fetchNearby().then((s) => alive && apply(s));
    return () => {
      alive = false;
    };
  }, [status, apply]);

  if (status !== "signedIn") return <SignInPrompt message="Sign in to see builds near you" />;
  if (Platform.OS === "web")
    return <EmptyState message="Nearby is in the app" detail="Location-based results are only on iOS and Android." />;
  if (region === undefined && !error) return <LoadingState label="Checking nearby" />;

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    setDenied(false);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      // lowest accuracy is enough: the position is cut down to a ~55 km cell right here
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
      const cell = regionCell(pos.coords.latitude, pos.coords.longitude);
      if (!cell) return setError({ key: "server" });
      const r = await socialService.setRegion(cell, share);
      if (!r.ok) return setError(r.error);
      await load();
    } catch {
      setError({ key: "server" });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    const r = await socialService.clearRegion();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRegion(null);
    setBuilds(null);
  };

  if (!region) {
    return (
      <Card>
        <Text variant="title">See builds near you</Text>
        <Text muted>
          Your phone rounds your location to a rough area (about 55 km across) and sends only that. Nobody sees your
          location or how far away you are. You can turn this off any time.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Switch
            value={share}
            onValueChange={setShare}
            trackColor={{ true: color.accent, false: color.border }}
            accessibilityLabel="Also show my public builds to people nearby"
          />
          <Text style={{ flex: 1 }}>Also show my public builds to people nearby</Text>
        </View>
        <Button title="Use my rough location" loading={busy} onPress={() => void turnOn()} />
        <Button title="Not now" variant="secondary" onPress={onFallback} />
        {denied ? (
          <Text variant="caption" muted>
            Location is off for Dynorex. That&apos;s fine: everything else works. You can allow it later in your
            phone&apos;s settings.
          </Text>
        ) : null}
        {error ? <InlineError kind={error.key} /> : null}
      </Card>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {error ? <InlineError kind={error.key} onAction={() => void load()} /> : null}
      {builds && builds.length === 0 ? (
        <EmptyState
          message="Not enough builds near you yet"
          detail="We only show Nearby once a few people around you share. Here's what's trending instead."
          action={{ title: "Show trending", onPress: onFallback }}
        />
      ) : (
        (builds ?? []).map((b) => <BuildCard key={b.build_id} build={b} heroUrl={media.heroes[b.vehicle_id]} />)
      )}
      <Text variant="caption" muted>
        {share ? "Your public builds can show up for people nearby." : "Your builds aren't shown to people nearby."}
      </Text>
      <Button title="Turn off Nearby" variant="secondary" loading={busy} onPress={() => void turnOff()} />
    </View>
  );
}
