import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError } from "@/components/feedback/Inline";
import { LoadMore } from "@/components/feedback/LoadMore";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Text } from "@/components/Text";
import { MOD_CATEGORIES, type ModCategoryId } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import { shopService } from "@/features/paddock/shopService";
import { usePaged } from "@/hooks/usePaged";
import type { PublicListing } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";
import { Appear } from "@/components/motion/Motion";
import { ListingCard, SafetyNote } from "./ShopBits";

/** Paddock > Shop: search, category filter and a two-column grid of parts for sale. */
export function Shop({ refreshKey }: { refreshKey: number }) {
  const { status } = useAuth();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ModCategoryId | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  // search as you type, without a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const fetch = useCallback(
    (page: number) => (void refreshKey, shopService.browse({ query, category, page })),
    [query, category, refreshKey],
  );
  const { items, error, reload, hasMore, loadingMore, loadMore } = usePaged<PublicListing>(fetch, listingKey);

  const withPhoto = (items ?? []).filter((l) => l.has_photo && !photos[l.listing_id]).map((l) => l.listing_id);
  const photoKey = withPhoto.join(",");
  useEffect(() => {
    if (!photoKey) return;
    let alive = true;
    void shopService.photos(photoKey.split(",")).then((r) => alive && r.ok && setPhotos((p) => ({ ...p, ...r.data })));
    return () => {
      alive = false;
    };
  }, [photoKey]);

  return (
    <>
      {status === "signedIn" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Sell a part" fullWidth onPress={() => router.push("/paddock/sell")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Your shop" variant="secondary" fullWidth onPress={() => router.push("/paddock/my-shop")} />
          </View>
        </View>
      ) : (
        <Text muted>Sign in to sell parts or make offers.</Text>
      )}
      <TextField
        label="Search parts"
        value={text}
        onChangeText={setText}
        placeholder="Coilovers, WRX, RB26…"
        returnKeyType="search"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
        <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
        {MOD_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            selected={category === c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>
      <SafetyNote />
      {error ? <InlineError kind={error.key} onAction={reload} /> : null}
      {items === null && !error ? <LoadingState label="Loading parts" /> : null}
      {items && items.length === 0 ? (
        <EmptyState
          expression="shrugging"
          message={query || category ? "No parts match" : "Nothing for sale yet"}
          detail={query || category ? "Try fewer words or another category." : "List the first part."}
        />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {(items ?? []).map((l, i) => (
          <Appear key={l.listing_id} index={i} style={{ width: "48%", flexGrow: 1 }}>
            <ListingCard listing={l} photo={photos[l.listing_id]} />
          </Appear>
        ))}
        {/* keeps a lone last card at half width */}
        {(items?.length ?? 0) % 2 === 1 ? <View style={{ width: "48%", flexGrow: 1 }} /> : null}
      </View>
      <LoadMore hasMore={hasMore} loading={loadingMore} onPress={() => void loadMore()} />
    </>
  );
}

const listingKey = (l: PublicListing) => l.listing_id;
