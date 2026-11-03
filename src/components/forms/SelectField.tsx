import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { Text } from "@/components/Text";
import { FieldError } from "./TextField";
import { filterOptions, type Option } from "@/domain/catalog";
import { border, color, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

/**
 * A dropdown that never traps the user: tap to open a searchable list in a bottom sheet, pick an option, or
 * (when `allowCustom`) use exactly what you typed. Looks and labels like TextField so forms stay consistent.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
  placeholder = "Choose",
  allowCustom = true,
  searchPlaceholder,
  emptyText = "Nothing matches.",
  openSignal = 0,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string, option: Option | null) => void;
  required?: boolean;
  hint?: string | null;
  error?: string | null;
  placeholder?: string;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Bump to open the list from outside (e.g. the next field in a chain). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // wait out the previous sheet's close so the two don't collide
    if (!openSignal) return;
    const t = setTimeout(() => setOpen(true), 350);
    return () => clearTimeout(t);
  }, [openSignal]);
  const [query, setQuery] = useState("");
  const hits = useMemo(() => filterOptions(options, query), [options, query]);
  const typed = query.trim();
  const exact = options.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  const pick = (v: string, o: Option | null) => {
    onChange(v, o);
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">
        {label}
        {required ? (
          <Text variant="label" muted>
            {" (required)"}
          </Text>
        ) : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "not chosen"}`}
        accessibilityHint="Opens a list to choose from"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, error ? styles.fieldError : null, pressed && { opacity: 0.85 }]}
      >
        <Text style={[type.body, { flex: 1, color: value ? color.text : color.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <ChevronDownIcon color={color.textMuted} />
      </Pressable>
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text variant="section" accessibilityRole="header" style={{ flex: 1 }}>
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setOpen(false)}
              style={styles.close}
            >
              <Text variant="bodyStrong">Close</Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
            placeholderTextColor={color.textMuted}
            selectionColor={color.accent}
            accessibilityLabel={`Search ${label.toLowerCase()}`}
            autoCorrect={false}
            style={styles.search}
          />
          {allowCustom && typed && !exact ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use ${typed}`}
              onPress={() => pick(typed, null)}
              style={({ pressed }) => [styles.row, styles.custom, pressed && styles.pressed]}
            >
              <Text variant="bodyStrong">{`Use “${typed}”`}</Text>
              <Text variant="caption" muted>
                Not in the list? That&apos;s fine.
              </Text>
            </Pressable>
          ) : null}
          <FlatList
            showsVerticalScrollIndicator={false}
            data={hits}
            keyExtractor={(o) => `${o.value}|${o.detail ?? ""}`}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            ListEmptyComponent={
              <Text muted style={{ padding: space.md }}>
                {emptyText}
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}${item.detail ? `, ${item.detail}` : ""}`}
                  accessibilityState={{ selected }}
                  onPress={() => pick(item.value, item)}
                  style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
                >
                  <Text variant={selected ? "bodyStrong" : "body"} style={{ flex: 1 }}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text variant="caption" muted>
                      {item.detail}
                    </Text>
                  ) : null}
                  {selected ? <CheckIcon color={color.accent} /> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    field: {
      minHeight: touch.min,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      borderWidth: border.regular,
      borderColor: color.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: color.background,
    },
    fieldError: { borderColor: color.danger },
    sheet: { flex: 1, backgroundColor: color.background, paddingHorizontal: space.lg },
    sheetHeader: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
    close: { minHeight: touch.min, minWidth: touch.min, alignItems: "center", justifyContent: "center" },
    search: {
      ...type.body,
      minHeight: touch.min,
      color: color.text,
      borderWidth: border.focus,
      borderColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      marginBottom: space.sm,
    },
    row: {
      minHeight: touch.min,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingHorizontal: space.sm,
      borderBottomWidth: border.hairline,
      borderBottomColor: color.hairline,
    },
    custom: { flexDirection: "column", alignItems: "flex-start", justifyContent: "center", paddingVertical: space.xs },
    selected: { backgroundColor: color.surface },
    pressed: { backgroundColor: color.surface },
  }),
);
