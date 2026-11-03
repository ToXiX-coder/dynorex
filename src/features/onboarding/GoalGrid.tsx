import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { Text } from "@/components/Text";
import { BUILD_GOALS, type BuildGoalId, type GoalIcon } from "@/domain/onboarding";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { themed } from "@/theme/themed";
import { CheckIcon } from "@/components/icons";

/** Simple line icons for each goal card, drawn in the palette. Decorative: the label carries meaning. */
function Icon({ name, c }: { name: GoalIcon; c: string }) {
  const s = { stroke: c, strokeWidth: 2, fill: "none" as const, strokeLinejoin: "round" as const };
  return (
    <View {...a11yHidden}>
      <Svg width={32} height={32} viewBox="0 0 24 24">
        {name === "steering" && (
          <>
            <Circle cx={12} cy={12} r={9} {...s} />
            <Circle cx={12} cy={12} r={2.5} fill={c} />
            <Path d="M3.5 10.5h6M14.5 10.5h6M12 14.5V21" {...s} />
          </>
        )}
        {name === "helmet" && <Path d="M3 15a9 9 0 0 1 18-2v4H9l-2 3H3z M12 9h7" {...s} />}
        {name === "trophy" && (
          <Path d="M7 4h10v5a5 5 0 0 1-10 0z M7 6H4a3 3 0 0 0 3 4 M17 6h3a3 3 0 0 1-3 4 M12 14v4 M8 20h8" {...s} />
        )}
        {name === "mountain" && <Path d="M2 20 9 7l4 7 3-4 6 10z" {...s} />}
        {name === "sun" && (
          <>
            <Circle cx={12} cy={12} r={4} {...s} />
            <Path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" {...s} />
          </>
        )}
        {name === "classic" && (
          <Path
            d="M2 16h20v-3l-3-1-3-4H8l-3 4-3 1z M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
            {...s}
          />
        )}
        {name === "low" && (
          <Path d="M1 15h22l-3-4H6zM5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" {...s} />
        )}
        {name === "eyes" && (
          <>
            <Polygon points="2,12 7,7 12,12 7,17" {...s} />
            <Polygon points="12,12 17,7 22,12 17,17" {...s} />
            <Circle cx={7} cy={12} r={1.5} fill={c} />
            <Circle cx={17} cy={12} r={1.5} fill={c} />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * 2-column grid of goal cards; Just Browsing is last and full width. Selected = lime border +
 * checkmark + "selected" state for screen readers (never colour alone).
 */
export function GoalGrid({ value, onChange }: { value: BuildGoalId | null; onChange: (g: BuildGoalId) => void }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Build goal">
      {BUILD_GOALS.map((g) => {
        const selected = value === g.id;
        const wide = g.id === "just_browsing";
        return (
          <Pressable
            key={g.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${g.label}. ${g.description}`}
            onPress={() => onChange(g.id)}
            style={[styles.card, wide ? styles.wide : styles.half, selected && styles.selected]}
          >
            <View style={styles.cardTop}>
              <Icon name={g.icon} c={selected ? color.accent : color.text} />
              {selected ? <CheckIcon color={color.accent} size={22} /> : null}
            </View>
            <Text variant="bodyStrong" style={{ color: selected ? color.accent : color.text }}>
              {g.label}
            </Text>
            <Text variant="caption" muted>
              {g.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    card: {
      minHeight: touch.min * 2.5,
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      borderWidth: border.regular,
      borderColor: color.surface,
      padding: space.md,
      gap: space.xs,
    },
    half: { flexBasis: "48%", flexGrow: 1 },
    wide: { flexBasis: "100%" },
    selected: { borderColor: color.accent, borderWidth: border.accent },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  }),
);
