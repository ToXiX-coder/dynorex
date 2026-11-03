import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LoadMore } from "@/components/feedback/LoadMore";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Appear } from "@/components/motion/Motion";
import { ClubCrest } from "@/components/paddock/ClubCrest";
import { Text } from "@/components/Text";
import { MOD_CATEGORIES, type ModCategoryId } from "@/domain/validation/build";
import { useAuth } from "@/features/auth/AuthProvider";
import { categoryLabel } from "@/features/paddock/shop/ShopBits";
import { servicesService } from "@/features/paddock/servicesService";
import { usePaged } from "@/hooks/usePaged";
import type { PublicBusiness } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/** Paddock > Services: shops near you and what they do. Requests happen in the app; payment doesn't. */
export function Services({ refreshKey }: { refreshKey: number }) {
  const { status } = useAuth();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ModCategoryId | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const fetch = useCallback(
    (page: number) => (void refreshKey, servicesService.browse({ query, category, page })),
    [query, category, refreshKey],
  );
  const { items, error, reload, hasMore, loadingMore, loadMore } = usePaged<PublicBusiness>(fetch, businessKey);

  return (
    <>
      {status === "signedIn" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Your requests" fullWidth onPress={() => router.push("/paddock/requests")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Your business"
              variant="secondary"
              fullWidth
              onPress={() => router.push("/paddock/business")}
            />
          </View>
        </View>
      ) : (
        <Text muted>Sign in to request a service or list your shop.</Text>
      )}
      <TextField
        label="Search shops"
        value={text}
        onChangeText={setText}
        placeholder="Tuning, alignment, your city…"
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
      <Text variant="caption" muted>
        Shops run their own pages. Dynorex doesn&apos;t check their work or take payment; a VERIFIED tag means Dynorex
        staff confirmed the business is real.
      </Text>
      {error ? <InlineError kind={error.key} onAction={reload} /> : null}
      {items === null && !error ? <LoadingState label="Loading shops" /> : null}
      {items && items.length === 0 ? (
        <EmptyState
          expression="shrugging"
          message={query || category ? "No shops match" : "No shops yet"}
          detail={query || category ? "Try another word or category." : "Run a shop? List it with Your business."}
        />
      ) : null}
      {(items ?? []).map((b, i) => (
        <Appear key={b.business_id} index={i}>
          <BusinessCard business={b} />
        </Appear>
      ))}
      <LoadMore hasMore={hasMore} loading={loadingMore} onPress={() => void loadMore()} />
    </>
  );
}

export function VerifiedTag() {
  return (
    <View style={styles.verified}>
      <Text style={[type.specUnit, { color: color.onAccent, letterSpacing: 1.5 }]}>VERIFIED</Text>
    </View>
  );
}

function BusinessCard({ business: b }: { business: PublicBusiness }) {
  const specialties = b.specialties.map(categoryLabel).join(", ");
  const jobs = b.jobs_completed ? ` · ${b.jobs_completed} job${b.jobs_completed === 1 ? "" : "s"} done` : "";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${b.name}${b.verified ? ", verified business" : ""}, ${b.location_text}, ${b.services_count} services${jobs}${specialties ? `, specialties: ${specialties}` : ""}`}
      onPress={() => router.push(`/business/${b.business_id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <ClubCrest name={b.name} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
            <Text variant="title">{b.name}</Text>
            {b.verified ? <VerifiedTag /> : null}
          </View>
          <Text variant="caption">{`${b.location_text} · ${b.services_count} services${jobs}`}</Text>
          {specialties ? (
            <Text variant="caption" muted numberOfLines={1}>
              {specialties}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const businessKey = (b: PublicBusiness) => b.business_id;

const styles = themed(() =>
  StyleSheet.create({
    verified: {
      backgroundColor: color.accent,
      paddingHorizontal: space.xs,
      paddingVertical: 1,
      borderRadius: radius.sm,
      transform: [{ skewX: "-10deg" }],
    },
  }),
);
