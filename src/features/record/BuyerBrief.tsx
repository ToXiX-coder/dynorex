import { StyleSheet, View } from "react-native";
import { Card } from "@/components/cards/Card";
import { Text } from "@/components/Text";
import { buyerBrief } from "@/domain/buyerBrief";
import type { BuildRecord } from "@/services/supabase/database.types";
import { themed } from "@/theme/themed";
import { color, space } from "@/theme/tokens";

const styles = themed(() =>
  StyleSheet.create({
    ask: { flexDirection: "row", gap: space.sm },
    // a short lime tick beside each question, the same slant as the record strip
    tick: { width: 3, alignSelf: "stretch", backgroundColor: color.accent, transform: [{ skewX: "-20deg" }] },
  }),
);

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * D-76: the record read the way a buyer reads it. On the buyer's link: what the record shows, then what to ask
 * the seller. On the owner's record: the same questions in the owner's words, so they can close them before
 * sharing; nothing shows when there's nothing to ask.
 */
export function BuyerBrief({ rec, side, today }: { rec: BuildRecord; side: "buyer" | "seller"; today?: string }) {
  const { facts, asks } = buyerBrief(rec, today ?? localDay());
  if (side === "seller" && !asks.length) return null;
  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="label" accessibilityRole="header">
        {side === "buyer" ? "Before you pay" : "What a buyer will ask"}
      </Text>
      {side === "buyer" ? facts.map((f) => <Text key={f}>{f}</Text>) : null}
      {side === "buyer" && asks.length ? <Text variant="label">Ask the seller</Text> : null}
      {asks.map((a) => (
        <View key={a.id} style={styles.ask}>
          <View style={styles.tick} accessibilityElementsHidden importantForAccessibility="no" />
          <Text variant="caption" style={{ flex: 1 }}>
            {side === "buyer" ? a.buyer : a.seller}
          </Text>
        </View>
      ))}
    </Card>
  );
}
