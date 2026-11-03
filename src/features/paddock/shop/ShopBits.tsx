import { router } from "expo-router";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { G, Polygon, Rect } from "react-native-svg";
import { Card } from "@/components/cards/Card";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { conditionLabel, priceText, STATUS_LABEL } from "@/domain/shop";
import { MOD_CATEGORIES } from "@/domain/validation/build";
import type { ListingStatus, ModCategory, PublicListing } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { a11yHidden } from "@/utils/a11y";
import { color, FONT, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export const categoryLabel = (c: ModCategory) => MOD_CATEGORIES.find((x) => x.id === c)?.label ?? c;

/**
 * Stand-in art for a listing with no photo: a dark parts-bin tile with racing slashes and the category in
 * the header font. Decorative: the card around it reads the listing out.
 */
export function PartTile({ category, style }: { category: ModCategory; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, style]} {...a11yHidden}>
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <Rect x={0} y={0} width={100} height={100} fill="#0e1012" />
        <G opacity={0.9}>
          <Polygon points="48,100 78,0 88,0 58,100" fill={color.accent} opacity={0.75} />
          <Polygon points="64,100 94,0 99,0 69,100" fill={color.accent} opacity={0.4} />
          <Polygon points="76,100 100,20 100,40 82,100" fill={color.danger} opacity={0.7} />
        </G>
        {/* bolt-hole pattern: reads as "part" without picturing a specific one */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return (
            <Rect
              key={i}
              x={28 + Math.cos(a) * 14 - 3}
              y={46 + Math.sin(a) * 14 - 3}
              width={6}
              height={6}
              fill="#F2EFE8"
              opacity={0.55}
              transform={`rotate(45 ${28 + Math.cos(a) * 14} ${46 + Math.sin(a) * 14})`}
            />
          );
        })}
      </Svg>
      <Text style={styles.tileText} numberOfLines={1}>
        {categoryLabel(category).toUpperCase()}
      </Text>
    </View>
  );
}

/** FOR SALE is implied; ON HOLD and SOLD get a tag (shape and words, not colour alone). */
export function StatusTag({ status }: { status: ListingStatus }) {
  if (status === "active") return null;
  return (
    <View style={[styles.tag, status === "sold" ? styles.tagSold : styles.tagHold]}>
      <Text style={[type.specUnit, { color: color.text, letterSpacing: 1.5 }]}>
        {STATUS_LABEL[status].toUpperCase()}
      </Text>
    </View>
  );
}

/** One listing in the Shop grid: photo or part tile, price, title, condition and place. */
export function ListingCard({ listing: l, photo }: { listing: PublicListing; photo: string | undefined }) {
  const label = `${l.title}, ${priceText(l.price_minor, l.currency)}, ${conditionLabel(l.condition)}, ${l.location_text}${
    l.status === "active" ? "" : `, ${STATUS_LABEL[l.status]}`
  }${l.boosted ? ", boosted listing" : ""}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push(`/listings/${l.listing_id}`)}
      style={withPress({ minHeight: touch.min, flexGrow: 1 })}
    >
      <Card style={[{ padding: 0, overflow: "hidden", gap: 0 }, l.status === "sold" && { opacity: 0.6 }]}>
        <View>
          {l.has_photo ? (
            <PublicImage uri={photo} alt={`Photo of ${l.title}`} style={styles.photo} />
          ) : (
            <PartTile category={l.category} style={styles.photo} />
          )}
          <View style={styles.tagSpot}>
            <StatusTag status={l.status} />
            {l.boosted ? (
              <View style={[styles.tag, styles.tagBoost]}>
                <Text style={[type.specUnit, { color: color.onAccent, letterSpacing: 1.5 }]}>BOOSTED</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ padding: space.sm, gap: 2 }} {...a11yHidden}>
          <Text style={[type.spec, { fontSize: 22, lineHeight: 26, color: color.accent }]}>
            {priceText(l.price_minor, l.currency)}
          </Text>
          <Text variant="bodyStrong" numberOfLines={2}>
            {l.title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {`${conditionLabel(l.condition)} · ${l.location_text}`}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** Pay-in-person safety note, shown wherever money comes up. */
export function SafetyNote() {
  return (
    <View style={styles.safety} accessible accessibilityLabel={SAFETY}>
      <Text variant="caption" {...a11yHidden}>
        {SAFETY}
      </Text>
    </View>
  );
}
const SAFETY =
  "Dynorex doesn't handle payment. Meet somewhere public, check the part before you pay, and never send money ahead for shipping.";

const styles = themed(() =>
  StyleSheet.create({
    tile: { backgroundColor: color.surface, justifyContent: "flex-end", overflow: "hidden" },
    tileText: {
      fontFamily: FONT.header,
      fontSize: 11,
      letterSpacing: 1.5,
      color: color.text,
      paddingHorizontal: space.sm,
      paddingBottom: space.xs,
    },
    photo: { width: "100%", aspectRatio: 1 },
    tagSpot: { position: "absolute", top: space.xs, left: space.xs, gap: space.xxs, alignItems: "flex-start" },
    tag: { paddingHorizontal: space.xs, paddingVertical: 1, borderRadius: radius.sm, transform: [{ skewX: "-10deg" }] },
    tagHold: { backgroundColor: color.background, borderWidth: 1, borderColor: color.text },
    tagSold: { backgroundColor: color.background, borderWidth: 2, borderColor: color.danger },
    tagBoost: { backgroundColor: color.accent },
    safety: {
      borderLeftWidth: 3,
      borderLeftColor: color.danger,
      backgroundColor: color.surface,
      padding: space.sm,
      borderRadius: radius.sm,
    },
  }),
);
