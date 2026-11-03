import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";
import { a11yHidden } from "@/utils/a11y";
import { ChevronIcon } from "../icons";
import { Text } from "../Text";

/** A grouped list: one rounded panel with hairline dividers between rows, and an optional small caps title above. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text variant="caption" muted accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.panel}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={styles.divider} {...a11yHidden} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" muted style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** A row in a ListGroup: title, optional detail, optional leading element and trailing value; a chevron when tappable. */
export function ListRow({
  title,
  detail,
  value,
  leading,
  trailing,
  onPress,
  accessibilityRole = "link",
}: {
  title: string;
  detail?: string;
  value?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityRole?: "link" | "button";
}) {
  const body = (
    <>
      {leading ? <View {...a11yHidden}>{leading}</View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" muted>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? (
        <View style={styles.chevron}>
          <ChevronIcon color={color.textMuted} />
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={[title, detail, value].filter(Boolean).join(". ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceRaised }]}
    >
      {body}
    </Pressable>
  );
}

/** A small rounded tile for a row's icon. */
export function IconTile({ children }: { children: ReactNode }) {
  return <View style={styles.tile}>{children}</View>;
}

const styles = themed(() =>
  StyleSheet.create({
    title: { fontWeight: "700", paddingHorizontal: space.xs },
    footer: { paddingHorizontal: space.xs },
    panel: {
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.lg },
    row: {
      minHeight: touch.min + space.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    chevron: { marginLeft: space.xs },
    tile: {
      width: 32,
      height: 32,
      borderRadius: radius.md,
      backgroundColor: color.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
