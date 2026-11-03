import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { formatEventTime } from "@/domain/events";
import { priceText } from "@/domain/shop";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { communityService } from "@/features/paddock/communityService";
import { eventService } from "@/features/paddock/eventService";
import { servicesService } from "@/features/paddock/servicesService";
import { shopService } from "@/features/paddock/shopService";
import { savesService } from "@/features/social/savesService";
import { socialService } from "@/features/social/socialService";
import type { SaveKind, SaveRow } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { space, touch } from "@/theme/tokens";

type Item = { save: SaveRow; title: string; detail: string; href: Href } | { save: SaveRow; gone: true };

const KINDS: { id: SaveKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "build", label: "Builds" },
  { id: "event", label: "Events" },
  { id: "route", label: "Drives" },
  { id: "post", label: "Posts" },
  { id: "listing", label: "Parts" },
  { id: "business", label: "Shops" },
];
const KIND_LABEL: Record<SaveKind, string> = {
  build: "Build",
  event: "Event",
  route: "Drive",
  post: "Post",
  listing: "Part",
  business: "Shop",
};

/** Look up a saved thing through its public view; anything no longer visible shows as "no longer available". */
async function resolve(s: SaveRow): Promise<Item> {
  const gone = { save: s, gone: true as const };
  switch (s.kind) {
    case "build": {
      const r = await socialService.publicBuild(s.target_id, 0);
      if (!r.ok || r.data.status !== "public") return gone;
      const b = r.data.build;
      return {
        save: s,
        title: b.title,
        detail: `${b.year} ${b.make} ${b.model} · @${b.owner_username}`,
        href: `/build/${s.target_id}`,
      };
    }
    case "event": {
      const r = await eventService.publicEvent(s.target_id);
      if (!r.ok || !r.data) return gone;
      return {
        save: s,
        title: r.data.title,
        detail: `${formatEventTime(r.data.starts_at, r.data.ends_at)} · ${r.data.location_text}`,
        href: `/events/${s.target_id}`,
      };
    }
    case "route": {
      const r = await lineService.publicRoute(s.target_id);
      if (!r.ok || !r.data) return gone;
      return { save: s, title: r.data.title, detail: `@${r.data.owner_username}`, href: `/route/${s.target_id}` };
    }
    case "post": {
      const r = await communityService.post(s.target_id);
      if (!r.ok || !r.data) return gone;
      return {
        save: s,
        title: r.data.body.slice(0, 80),
        detail: `@${r.data.author_username}`,
        href: `/posts/${s.target_id}`,
      };
    }
    case "listing": {
      const r = await shopService.listing(s.target_id);
      if (!r.ok || !r.data) return gone;
      return {
        save: s,
        title: r.data.title,
        detail: `${priceText(r.data.price_minor, r.data.currency)} · ${r.data.location_text}`,
        href: `/listings/${s.target_id}`,
      };
    }
    case "business": {
      const r = await servicesService.business(s.target_id);
      if (!r.ok || !r.data) return gone;
      return { save: s, title: r.data.name, detail: r.data.location_text, href: `/business/${s.target_id}` };
    }
  }
}

/** Everything you saved for later. Private: only you see this list. */
export default function Saved() {
  const { status } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [filter, setFilter] = useState<SaveKind | "all">("all");

  const load = useCallback(() => {
    void savesService.list().then(async (r) => {
      if (!r.ok) return setError(r.error);
      setError(null);
      // newest 60 are looked up; that's plenty for one screen
      setItems(await Promise.all(r.data.slice(0, 60).map(resolve)));
    });
  }, []);
  useFocusEffect(load);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to see what you saved" />
      </Screen>
    );
  if (items === null && !error) return <LoadingState label="Loading saved items" />;
  const shown = (items ?? []).filter((i) => filter === "all" || i.save.kind === filter);

  return (
    <Screen onRefresh={load}>
      <Text variant="caption" muted>
        Only you can see this list. Tap Save on builds, events, drives, posts, parts and shops.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {KINDS.map((k) => (
          <Chip key={k.id} label={k.label} selected={filter === k.id} onPress={() => setFilter(k.id)} />
        ))}
      </View>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {items && shown.length === 0 ? (
        <EmptyState message="Nothing saved yet" detail="Saved things show up here." />
      ) : null}
      {shown.map((i) =>
        "gone" in i ? (
          <Card key={`${i.save.kind}:${i.save.target_id}`} style={{ opacity: 0.6 }}>
            <Text variant="caption">{`${KIND_LABEL[i.save.kind]} no longer available`}</Text>
            <Button
              title="Remove"
              variant="secondary"
              onPress={async () => {
                await savesService.unsave(i.save.kind, i.save.target_id);
                load();
              }}
            />
          </Card>
        ) : (
          <Pressable
            key={`${i.save.kind}:${i.save.target_id}`}
            accessibilityRole="link"
            accessibilityLabel={`${KIND_LABEL[i.save.kind]}: ${i.title}, ${i.detail}`}
            onPress={() => router.push(i.href)}
            style={withPress({ minHeight: touch.min })}
          >
            <Card style={{ gap: 2 }}>
              <Text variant="caption" muted>
                {KIND_LABEL[i.save.kind].toUpperCase()}
              </Text>
              <Text variant="bodyStrong" numberOfLines={2}>
                {i.title}
              </Text>
              <Text variant="caption">{i.detail}</Text>
            </Card>
          </Pressable>
        ),
      )}
    </Screen>
  );
}
