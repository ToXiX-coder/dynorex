import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "@/services/config";
import { color, font, radius, size, space } from "./theme";

/** The small set of building blocks every screen uses. */

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View style={s.column}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={["bottom", "left", "right"]}>
      {config.demoMode ? (
        <View style={s.demo} accessibilityRole="text">
          <Text style={s.demoText}>DEMO · SAMPLE DATA</Text>
        </View>
      ) : null}
      {scroll ? <ScrollView contentContainerStyle={s.scroll}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

type Variant = "title" | "heading" | "body" | "small" | "label" | "mono";
export function T({
  v = "body",
  muted,
  style,
  children,
  ...rest
}: { v?: Variant; muted?: boolean; style?: StyleProp<TextStyle>; children: ReactNode; selectable?: boolean; numberOfLines?: number }) {
  return (
    <Text style={[t[v], muted && { color: color.muted }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [b.base, b[kind], off && b.off, pressed && !off && b.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? color.accentInk : color.accent} />
      ) : (
        <Text style={[b.text, kind === "primary" ? b.textPrimary : kind === "danger" ? b.textDanger : b.textSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  ...input
}: { label: string; hint?: string; error?: string | null } & TextInputProps) {
  return (
    <View style={f.wrap}>
      <Text style={t.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.muted}
        accessibilityLabel={label}
        style={[f.input, input.multiline && f.multi, !!error && f.inputError]}
        {...input}
      />
      {error ? <Text style={f.error}>{error}</Text> : hint ? <Text style={f.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A row of choices; exactly one is selected. */
export function Choices<K extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: { id: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  error?: string | null;
}) {
  return (
    <View style={f.wrap}>
      <Text style={t.label}>{label}</Text>
      <View style={c.row} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.id)}
              style={[c.chip, on && c.chipOn]}
            >
              <Text style={[c.text, on && c.textOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={f.error}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[k.card, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [k.card, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "flag" | "stamp" | "danger"; children: ReactNode }) {
  const bg = { info: color.card, flag: color.flagTint, stamp: color.stampTint, danger: color.flagTint }[tone];
  const fg = { info: color.ink, flag: color.flag, stamp: color.stamp, danger: color.danger }[tone];
  return (
    <View style={[k.notice, { backgroundColor: bg, borderColor: tone === "info" ? color.rule : bg }]}>
      <Text style={[t.small, { color: fg }]}>{children}</Text>
    </View>
  );
}

export const Rule = () => <View style={k.rule} />;
export const Gap = ({ h = space.md }: { h?: number }) => <View style={{ height: h }} />;

export function Loading() {
  return (
    <View style={{ padding: space.xxl, alignItems: "center" }}>
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { paddingBottom: space.xxl },
  column: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  demo: { backgroundColor: color.ink, paddingVertical: 4, alignItems: "center" },
  demoText: { color: color.paper, fontFamily: font.mono, fontSize: size.label, letterSpacing: 1.5 },
});
const t = StyleSheet.create({
  title: { fontFamily: font.serif, fontSize: size.title, lineHeight: 34, color: color.ink, fontWeight: "700" },
  heading: { fontFamily: font.serif, fontSize: size.heading, lineHeight: 26, color: color.ink, fontWeight: "700" },
  body: { fontFamily: font.sans, fontSize: size.body, lineHeight: 23, color: color.ink },
  small: { fontFamily: font.sans, fontSize: size.small, lineHeight: 20, color: color.ink },
  label: { fontFamily: font.sans, fontSize: size.label, lineHeight: 16, color: color.muted, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  mono: { fontFamily: font.mono, fontSize: size.small, lineHeight: 20, color: color.ink },
});
const b = StyleSheet.create({
  base: { minHeight: 48, borderRadius: radius, paddingHorizontal: space.lg, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: "transparent", borderColor: color.accent },
  danger: { backgroundColor: "transparent", borderColor: color.danger },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  text: { fontFamily: font.sans, fontSize: size.body, fontWeight: "700" },
  textPrimary: { color: color.accentInk },
  textSecondary: { color: color.accent },
  textDanger: { color: color.danger },
});
const f = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 48, borderWidth: 1, borderColor: color.rule, borderRadius: radius, backgroundColor: color.card,
    paddingHorizontal: space.md, fontFamily: font.sans, fontSize: size.body, color: color.ink,
  },
  multi: { minHeight: 96, paddingTop: space.md, textAlignVertical: "top" },
  inputError: { borderColor: color.danger },
  hint: { fontFamily: font.sans, fontSize: size.small, color: color.muted },
  error: { fontFamily: font.sans, fontSize: size.small, color: color.danger },
});
const c = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: 20, borderWidth: 1, borderColor: color.rule, backgroundColor: color.card, justifyContent: "center" },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  text: { fontFamily: font.sans, fontSize: size.small, color: color.ink },
  textOn: { color: color.paper, fontWeight: "700" },
});
const k = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius, borderWidth: 1, borderColor: color.rule, padding: space.lg, gap: space.sm },
  notice: { borderRadius: radius, borderWidth: 1, padding: space.md },
  rule: { height: 1, backgroundColor: color.rule },
});
