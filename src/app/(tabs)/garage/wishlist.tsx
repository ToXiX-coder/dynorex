import { useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { checkProductLink } from "@/domain/links";
import { CURRENCIES, formatMoney, parseMoney, type Currency } from "@/domain/money";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { buildService } from "@/features/garage/buildService";
import { useAction } from "@/hooks/useAction";
import { useCachedLoad } from "@/hooks/useCachedLoad";
import type { WishlistItemRow } from "@/services/supabase/database.types";
import { color, radius, space } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { themed } from "@/theme/themed";

/**
 * Parts you want. Links are https-only and checked twice (here and in the database). Opening one
 * always asks first and says where it goes. Dynorex has no affiliate deals yet, and says so.
 */
export default function Wishlist() {
  const { status } = useAuth();
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );
  return <WishlistInner />;
}

function WishlistInner() {
  const { data, loading, error, refresh } = useCachedLoad("wishlist", buildService.listWishlist);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState<{ url: string; host: string; affiliate: boolean } | null>(null);
  const add = useAction(buildService.addWishlist);
  const del = useAction(buildService.deleteWishlist);

  if (!data && loading) return <LoadingState label="Loading wishlist" />;
  if (!data && error)
    return (
      <Screen>
        <ErrorState kind={error.key} onAction={() => void refresh()} />
      </Screen>
    );

  const submit = async () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = "Name the part";
    else if (n.length > 120) e.name = "120 characters max";
    let link: string | null = null;
    if (url.trim()) {
      const c = checkProductLink(url);
      if (!c.ok) e.url = c.reason;
      else link = c.url;
    }
    const minor = parseMoney(price, currency);
    if (Number.isNaN(minor)) e.price = "Enter an amount like 249.99";
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = await add.run({
      name: n,
      url: link,
      price_minor: minor,
      currency: minor === null ? null : currency,
      notes: null,
      vehicle_id: null,
    });
    if (r?.ok) {
      setName("");
      setUrl("");
      setPrice("");
      void refresh();
    }
  };

  return (
    <Screen>
      <Text variant="caption" muted>
        Dynorex doesn&apos;t earn anything from these links and has no affiliate deals. If that changes, affiliate links
        will be clearly marked before you open them.
      </Text>
      <Card style={{ gap: space.md }}>
        <SectionHeader>Add a part</SectionHeader>
        <TextField label="Part" required value={name} onChangeText={setName} maxLength={120} error={errors.name} />
        <TextField
          label="Link"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Optional. https:// links only."
          error={errors.url}
        />
        <TextField
          label={`Price (${currency})`}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          hint="Optional"
          error={errors.price}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel="Currency"
        >
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </ScrollView>
        {add.error ? <InlineError kind={add.error.key} /> : null}
        <Button title="Add to wishlist" loading={add.busy} onPress={submit} />
      </Card>

      {del.error ? <InlineError kind={del.error.key} /> : null}
      {(data ?? []).length === 0 ? (
        <EmptyState expression="shrugging" message="Nothing on the wishlist" detail="Parts you're eyeing go here." />
      ) : (
        (data ?? []).map((w: WishlistItemRow) => (
          <Card key={w.id}>
            <Text variant="title">{w.name}</Text>
            {w.price_minor !== null && w.currency ? (
              <Text>{formatMoney(Number(w.price_minor), w.currency)}</Text>
            ) : null}
            {w.is_affiliate ? <Text variant="caption">Affiliate link: Dynorex may earn a commission</Text> : null}
            <View style={styles.chips}>
              {w.url ? (
                <Button
                  title="Open link"
                  variant="secondary"
                  onPress={() => {
                    const c = checkProductLink(w.url!);
                    if (c.ok) setLeaving({ url: c.url, host: c.host, affiliate: w.is_affiliate });
                  }}
                />
              ) : null}
              <Button
                title="Remove"
                variant="secondary"
                onPress={async () => {
                  const r = await del.run(w.id);
                  if (r?.ok) void refresh();
                }}
              />
            </View>
          </Card>
        ))
      )}

      <Modal visible={leaving !== null} transparent animationType="fade" onRequestClose={() => setLeaving(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.handle} {...a11yHidden} />
            <SectionHeader>Leaving Dynorex</SectionHeader>
            <Text>{`This opens ${leaving?.host} in your browser. Dynorex doesn't control that site.`}</Text>
            <Text variant="caption" muted>
              {leaving?.affiliate
                ? "This is an affiliate link: Dynorex may earn a commission if you buy."
                : "Not an affiliate link. Dynorex earns nothing from it."}
            </Text>
            <View style={[styles.chips, { justifyContent: "flex-end" }]}>
              <Button title="Cancel" variant="secondary" onPress={() => setLeaving(null)} />
              <Button
                title="Open"
                onPress={async () => {
                  const target = leaving?.url;
                  setLeaving(null);
                  if (target) await Linking.openURL(target).catch(() => {});
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.xl,
      gap: space.md,
    },
    handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: color.handle },
  }),
);
