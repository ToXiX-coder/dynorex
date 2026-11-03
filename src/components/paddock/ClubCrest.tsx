import { memo, useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Polygon, Stop, Text as SvgText } from "react-native-svg";
import { avatarColor, initials } from "@/domain/avatar";
import { color, FONT } from "@/theme/tokens";

/**
 * A club's crest: a shield in the club's own stable color with a lime rim, a diagonal lime slash and its
 * initials. Decorative (the club name is always shown beside it).
 */
export const ClubCrest = memo(function ClubCrest({ name, size = 56 }: { name: string; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const base = avatarColor(name);
  const shield = "M50 4L92 18V52C92 78 72 94 50 104C28 94 8 78 8 52V18Z";
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size * 1.08} viewBox="0 0 100 108">
        <Defs>
          <LinearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={base} />
            <Stop offset="1" stopColor="#0e1012" />
          </LinearGradient>
        </Defs>
        <Path d={shield} fill={`url(#${id}-g)`} stroke={color.accent} strokeWidth={4} />
        <Polygon points="20,86 70,12 80,16 32,92" fill={color.accent} opacity={0.22} />
        <SvgText x={50} y={66} textAnchor="middle" fontFamily={FONT.display} fontSize={38} fill="#F2EFE8">
          {initials(name)}
        </SvgText>
      </Svg>
    </View>
  );
});
