import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { formatMoney } from "@/domain/money";
import { palette, themeState } from "@/theme/palette";
import { color, space } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Text } from "../Text";
import { categoryLabel } from "./BuildBits";

/** Theme-only slice colours; the legend's words and numbers carry the meaning, not the colours. */
const slicePalette = () => [
  color.accent,
  color.text,
  color.textMuted,
  color.border,
  themeState.dark ? palette.logoGrayMid : "#A9ACB0",
];

function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const p = (a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x1, y1] = p(start);
  const [x2, y2] = p(end);
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/**
 * Spending by category for one currency: a pie (top 4 + "Other") plus a text legend with amounts and
 * percentages, which is what screen readers get.
 */
export function CostChart({
  currency,
  categories,
}: {
  currency: string;
  categories: { category: string; spent: number; share: number }[];
}) {
  const top = categories.slice(0, 4);
  const rest = categories.slice(4);
  const slices = rest.length
    ? [
        ...top,
        {
          category: "other",
          spent: rest.reduce((a, c) => a + c.spent, 0),
          share: rest.reduce((a, c) => a + c.share, 0),
        },
      ]
    : top;
  const SLICE = slicePalette();
  const paths = slices.map((s, i) => {
    const start = slices.slice(0, i).reduce((a, x) => a + x.share, 0) * Math.PI * 2;
    const end = start + s.share * Math.PI * 2;
    return { d: arc(60, 60, 56, start, end), fill: SLICE[i % SLICE.length]!, full: s.share >= 0.999 };
  });

  return (
    <View style={styles.row}>
      <View {...a11yHidden}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          {paths.map((p, i) =>
            p.full ? (
              <Circle key={i} cx={60} cy={60} r={56} fill={p.fill} />
            ) : (
              <Path key={i} d={p.d} fill={p.fill} stroke={color.background} strokeWidth={2} />
            ),
          )}
          {/* donut hole: reads lighter than a solid pie and matches the gauge style */}
          <Circle cx={60} cy={60} r={30} fill={color.surface} />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 150, gap: space.sm }}>
        {slices.map((s, i) => (
          <View
            key={s.category}
            style={styles.legendRow}
            accessible
            accessibilityLabel={`${s.category === "other" ? "Other" : categoryLabel(s.category)}: ${formatMoney(s.spent, currency)}, ${Math.round(s.share * 100)} percent`}
          >
            <View style={[styles.swatch, { backgroundColor: SLICE[i % SLICE.length] }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.legendTop}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {s.category === "other" ? "Other" : categoryLabel(s.category)}
                </Text>
                <Text variant="bodyStrong" style={styles.num}>{`${Math.round(s.share * 100)}%`}</Text>
              </View>
              <Text variant="caption" muted style={styles.num}>
                {formatMoney(s.spent, currency)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.lg, alignItems: "center", flexWrap: "wrap" },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  num: { fontVariant: ["tabular-nums"] },
  legendTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 10, height: 16, marginTop: 3, transform: [{ skewX: "-18deg" }] },
});
