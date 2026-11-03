import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { MOD_CATEGORIES, MOD_STATUSES, type ModCategoryId, type ModStatusId } from "@/domain/validation/build";
import { KIND_CATEGORIES, type VehicleKind } from "@/domain/vehicleKind";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Text } from "../Text";
import { themed } from "@/theme/themed";
import { FieldError } from "@/components/forms/TextField";

/** Line icons for the 9 mod categories. Decorative: the label always sits next to them. */
export function CategoryIcon({ id, c = color.text, size = 28 }: { id: ModCategoryId; c?: string; size?: number }) {
  const s = {
    stroke: c,
    strokeWidth: 2,
    fill: "none" as const,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  return (
    <View {...a11yHidden}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {id === "engine" && <Path d="M4 9h3l2-2h5v2h3l2 3v5h-2v2h-4l-2-2H7v-2H4z" {...s} />}
        {id === "suspension" && <Path d="M12 2v3m0 14v3M8 5h8M8 19h8M9 7l6 2-6 2 6 2-6 2 6 2" {...s} />}
        {id === "exhaust" && <Path d="M2 14h12a4 4 0 0 0 4-4V7M16 7h4M18 14c1 1 2 1 3 0m-3 3c1 1 2 1 3 0" {...s} />}
        {id === "aero" && <Path d="M3 9h18l-2 4H5zM7 13v4m10-4v4" {...s} />}
        {id === "interior" && <Path d="M7 3h6l1 10H6zM6 13h9l2 6H6z" {...s} />}
        {id === "wheels" && (
          <>
            <Circle cx={12} cy={12} r={9} {...s} />
            <Circle cx={12} cy={12} r={3} {...s} />
            <Path d="M12 3v6M12 15v6M3 12h6M15 12h6" {...s} />
          </>
        )}
        {id === "exterior" && (
          <Path
            d="M3 15h18v-3l-3-1-3-4H9l-3 4-3 1zM7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
            {...s}
          />
        )}
        {id === "electronics" && (
          <>
            <Rect x={6} y={6} width={12} height={12} rx={1} {...s} />
            <Path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" {...s} />
          </>
        )}
        {id === "safety" && <Path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z M9 12l2 2 4-4" {...s} />}
        {/* D-71: two-wheel categories */}
        {id === "brakes" && (
          <>
            <Circle cx={11} cy={13} r={8} {...s} />
            <Circle cx={11} cy={13} r={2} {...s} />
            <Path d="M15 3.5a10 10 0 0 1 5.5 6L17 11a6.5 6.5 0 0 0-3.5-4z" {...s} />
          </>
        )}
        {id === "controls" && <Path d="M2 9c4 0 6 1 8 3h4c2-2 4-3 8-3M5 9V7m14 2V7M10 12v4h4v-4" {...s} />}
        {id === "luggage" && (
          <>
            <Rect x={4} y={7} width={16} height={13} rx={2} {...s} />
            <Path d="M9 7V4h6v3M4 12h16" {...s} />
          </>
        )}
        {id === "motor" && (
          <>
            <Circle cx={12} cy={12} r={8} {...s} />
            <Path d="M13 6l-4 7h4l-2 5" {...s} />
          </>
        )}
        {id === "battery" && (
          <>
            <Rect x={3} y={7} width={16} height={10} rx={2} {...s} />
            <Path d="M21 10v4M7 12h5M9.5 9.5v5" {...s} />
          </>
        )}
        {id === "drivetrain" && (
          <>
            <Circle cx={6} cy={14} r={3} {...s} />
            <Circle cx={18} cy={14} r={4} {...s} />
            <Path d="M6 11l12-1M6 17l12 1" {...s} />
          </>
        )}
        {id === "cockpit" && <Path d="M3 8c3 0 5 1 7 3h4c2-2 4-3 7-3M12 11v10M9 21h6M12 6V3" {...s} />}
      </Svg>
    </View>
  );
}

export const categoryLabel = (id: string) => MOD_CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const statusInfo = (id: string) => MOD_STATUSES.find((s) => s.id === id) ?? MOD_STATUSES[0];

/**
 * Status as a drawn mark and a word: an empty ring for planned, a half-filled ring in progress, a solid dot when
 * complete (shape as well as colour).
 */
export function StatusChip({ status }: { status: ModStatusId }) {
  const s = statusInfo(status);
  const done = status === "complete";
  return (
    <View style={styles.status}>
      <View
        {...a11yHidden}
        style={[
          styles.mark,
          done
            ? { backgroundColor: color.accent, borderColor: color.accent }
            : { borderColor: status === "in_progress" ? color.text : color.textMuted },
        ]}
      >
        {status === "in_progress" ? <View style={styles.half} /> : null}
      </View>
      <Text variant="caption" style={{ color: done ? color.text : color.textMuted }}>
        {s.label}
      </Text>
    </View>
  );
}

/** Grid of category buttons (radio semantics) used in the mod form: the ones this kind of vehicle offers. */
export function CategoryGrid({
  value,
  onChange,
  error,
  kind = "car",
}: {
  value: ModCategoryId | null;
  onChange: (c: ModCategoryId) => void;
  error?: string;
  kind?: VehicleKind;
}) {
  const cats = MOD_CATEGORIES.filter((c) => KIND_CATEGORIES[kind].includes(c.id));
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">
        Category
        <Text variant="label" muted>
          {" "}
          (required)
        </Text>
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Category">
        {cats.map((c) => {
          const selected = value === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={c.label}
              onPress={() => onChange(c.id)}
              style={[styles.cat, selected && styles.catOn]}
            >
              <CategoryIcon id={c.id} c={selected ? color.accent : color.text} />
              <Text variant="caption" style={{ color: selected ? color.accent : color.text }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    status: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space.xs },
    mark: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, overflow: "hidden" },
    half: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", backgroundColor: color.text },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    cat: {
      width: "31%",
      flexGrow: 1,
      minHeight: touch.min + space.xl,
      alignItems: "center",
      justifyContent: "center",
      gap: space.xxs,
      backgroundColor: color.surface,
      borderRadius: radius.md,
      borderWidth: border.regular,
      borderColor: color.surface,
    },
    catOn: { borderColor: color.accent },
  }),
);
