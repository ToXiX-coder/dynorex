import { Pressable, StyleSheet, View } from "react-native";
import { ListGroup } from "@/components/lists/ListGroup";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { haptic } from "@/services/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { ACCENTS, BASES, rolesFor, type AccentId, type BaseId, type ThemeChoice } from "@/theme/themes";
import { themed } from "@/theme/themed";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { CheckIcon } from "@/components/icons";

/**
 * Appearance: a base theme (or Auto, which follows the phone) and an accent colour. Saved on this phone and applied
 * straight away. Each option previews itself in its own colours.
 */
export default function Appearance() {
  const { choice, setChoice, dark } = useTheme();
  // accent dots show the shade used on the theme on screen now (deeper on Daylight)
  const shadeOn: BaseId = dark ? "asphalt" : "daylight";
  const pick = (next: ThemeChoice) => {
    haptic.select();
    setChoice(next);
  };
  return (
    <Screen>
      <Text variant="caption" muted>
        Make Dynorex yours. Every combination is checked for readable contrast. Saved on this phone.
      </Text>

      <ListGroup title="Theme">
        <View style={styles.grid}>
          <Swatch
            base="auto"
            accent={choice.accent}
            selected={choice.base === "auto"}
            onPress={() => pick({ ...choice, base: "auto" })}
          />
          {BASES.map((b) => (
            <Swatch
              key={b.id}
              base={b.id}
              accent={choice.accent}
              selected={choice.base === b.id}
              onPress={() => pick({ ...choice, base: b.id })}
            />
          ))}
        </View>
      </ListGroup>

      <ListGroup
        title="Accent"
        footer="Used for buttons, highlights and your progress. On Daylight, accents are deeper so text stays readable."
      >
        <View style={styles.accents}>
          {ACCENTS.map((a) => {
            const selected = choice.accent === a.id;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={a.name}
                onPress={() => pick({ ...choice, accent: a.id })}
                style={({ pressed }) => [styles.accentItem, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.ring, selected && { borderColor: color.text }]}>
                  <View style={[styles.dot, { backgroundColor: rolesFor(shadeOn, a.id).accent }]}>
                    {selected ? <CheckIcon color={rolesFor(shadeOn, a.id).onAccent} size={20} /> : null}
                  </View>
                </View>
                <Text variant="caption" muted={!selected} numberOfLines={1} style={{ textAlign: "center" }}>
                  {a.name.split(" ")[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ListGroup>
    </Screen>
  );
}

const NAMES: Record<BaseId | "auto", [string, string]> = {
  auto: ["Auto", "Follows your phone"],
  ...(Object.fromEntries(BASES.map((b) => [b.id, [b.name, b.detail]])) as Record<BaseId, [string, string]>),
};

/** A tiny screen drawn in the option's own colours: header bar, a card with a line of text, an accent button. */
function Swatch({
  base,
  accent,
  selected,
  onPress,
}: {
  base: BaseId | "auto";
  accent: AccentId;
  selected: boolean;
  onPress: () => void;
}) {
  const [name, detail] = NAMES[base];
  const halves: BaseId[] = base === "auto" ? ["daylight", "asphalt"] : [base];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${name}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.swatch, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.preview, selected && styles.previewSelected]} {...a11yHidden}>
        {halves.map((h) => {
          const c = rolesFor(h, accent);
          return (
            <View key={h} style={{ flex: 1, backgroundColor: c.background, padding: 6, gap: 4 }}>
              <View style={{ height: 4, width: "45%", borderRadius: 2, backgroundColor: c.text, opacity: 0.85 }} />
              <View
                style={{
                  flex: 1,
                  borderRadius: 4,
                  backgroundColor: c.surface,
                  padding: 4,
                  gap: 3,
                  borderWidth: 1,
                  borderColor: c.hairline,
                }}
              >
                <View style={{ height: 3, width: "70%", borderRadius: 2, backgroundColor: c.textMuted }} />
                <View style={{ height: 3, width: "50%", borderRadius: 2, backgroundColor: c.textMuted }} />
              </View>
              <View style={{ height: 8, borderRadius: 3, backgroundColor: c.accent }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {selected ? <CheckIcon color={color.accent} size={14} /> : null}
        <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
      </View>
      <Text variant="caption" muted numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", padding: space.md, gap: space.md },
    swatch: { width: "30%", flexGrow: 1, minWidth: 92, gap: space.xxs },
    preview: {
      height: 96,
      flexDirection: "row",
      borderRadius: radius.md,
      overflow: "hidden",
      borderWidth: border.regular,
      borderColor: color.hairline,
      marginBottom: space.xs,
    },
    previewSelected: { borderColor: color.accent },
    accents: {
      flexDirection: "row",
      padding: space.md,
      paddingHorizontal: space.xs,
    },
    accentItem: { flex: 1, minHeight: touch.min, alignItems: "center", gap: space.xs },
    ring: { padding: 3, borderRadius: radius.pill, borderWidth: border.regular, borderColor: "transparent" },
    dot: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  }),
);
