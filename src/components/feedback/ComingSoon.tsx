import { View } from "react-native";
import { Screen } from "../Screen";
import { Text } from "../Text";
import { Torq } from "../mascot/Torq";
import { ComingSoonBadge } from "./States";
import { space } from "@/theme/tokens";

/** v2 teaser. There are no buttons, so nothing pretends to work. */
export function ComingSoon({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Screen edges={["top", "left", "right"]}>
      <ComingSoonBadge />
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      <Torq expression="wrenching" size={120} />
      <View style={{ gap: space.sm }}>
        {lines.map((l) => (
          <Text key={l} muted>{`•  ${l}`}</Text>
        ))}
      </View>
      <Text>This part of Dynorex isn&apos;t built yet. Nothing here records, posts or sells anything.</Text>
    </Screen>
  );
}
