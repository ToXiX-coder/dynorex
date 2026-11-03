import { memo } from "react";
import { View } from "react-native";
import { color as tokens } from "@/theme/tokens";
import { avatarColor, initials } from "@/domain/avatar";
import { Text } from "../Text";

/**
 * A person's avatar: their initials on a color that stays the same for them everywhere. Decorative, because
 * the name is always shown next to it. A lime ring marks Dynorex+ members (the badge text says it too).
 */
export const Avatar = memo(function Avatar({
  username,
  name,
  size = 40,
  plus = false,
}: {
  username: string;
  name?: string | null;
  size?: number;
  plus?: boolean;
}) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(username),
        alignItems: "center",
        justifyContent: "center",
        borderWidth: plus ? Math.max(2, size / 20) : 0,
        borderColor: tokens.accent,
      }}
    >
      <Text
        style={{ color: "#FFFFFF", fontWeight: "800", fontSize: size * 0.38, lineHeight: size * 0.46 }}
        maxFontSizeMultiplier={1.2}
      >
        {initials(name || username)}
      </Text>
    </View>
  );
});
