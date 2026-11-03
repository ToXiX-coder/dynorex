import { Text as RNText, type TextProps } from "react-native";
import { color, type } from "@/theme/tokens";

type Variant = keyof typeof type;

/** All text goes through here so the type scale and Bone colour are applied consistently. */
export function Text({
  variant = "body",
  muted,
  accent,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; accent?: boolean }) {
  return (
    <RNText
      maxFontSizeMultiplier={2}
      style={[type[variant], { color: accent ? color.accent : muted ? color.textMuted : color.text }, style]}
      {...rest}
    />
  );
}
