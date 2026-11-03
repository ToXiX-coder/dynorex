import { a11yHidden } from "@/utils/a11y";
import { memo } from "react";
import { Image, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { color, palette, themeState } from "@/theme/palette";
import { torqSvg, TORQ_LABELS, type TorqExpression } from "./art";

/**
 * Torq mascot. Decorative by default (hidden from screen readers) because the surrounding text
 * always carries the meaning; pass `label` when the image itself adds information.
 */
export const Torq = memo(function Torq({
  expression = "neutral",
  size = 120,
  decorative = true,
}: {
  expression?: TorqExpression;
  size?: number;
  decorative?: boolean;
}) {
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : TORQ_LABELS[expression]}
      {...(decorative ? a11yHidden : {})}
      style={{ width: size, height: (size * 240) / 220 }}
    >
      <SvgXml xml={torqSvg(expression)} width="100%" height="100%" />
    </View>
  );
});

// The DynoRex logo is the owner's artwork (D-53), exported by scripts/export-brand.ts with a transparent
// background: the mark is the spiked head (tachometer eye) over the car, the lockup adds the DYNOREX wordmark.
const MARK_PNG = require("../../../assets/brand/png/logo-mark-3x.png");
const LOCKUP_PNG = require("../../../assets/brand/png/logo-lockup-3x.png");
const WORDMARK_PNG = require("../../../assets/brand/png/logo-wordmark-3x.png");
// height / width of each crop in scripts/export-brand.ts
const WORDMARK_RATIO = 197 / 1160;
const MARK_RATIO = 728 / 1156;
const LOCKUP_RATIO = 926 / 1172;

/**
 * The artwork is white and silver line art, made for dark backgrounds. On a light theme the mark and lockup sit on a
 * small Asphalt plate (the artwork itself is never recoloured), and the wordmark is shown in solid text colour.
 */
const plate = (pad: number) =>
  themeState.dark ? null : { backgroundColor: palette.asphaltBlack, borderRadius: pad * 1.5, padding: pad };

export const LogoMark = memo(function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <View {...a11yHidden} style={[{ width: size, height: size * MARK_RATIO }, plate(size * 0.08)]}>
      <Image accessible={false} source={MARK_PNG} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
    </View>
  );
});

export const LogoLockup = memo(function LogoLockup({ width = 220 }: { width?: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Dynorex"
      style={[{ width, height: width * LOCKUP_RATIO }, plate(width * 0.05)]}
    >
      <Image accessible={false} source={LOCKUP_PNG} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
    </View>
  );
});

/** The DYNOREX wordmark from the logo artwork, for headers. Read as "Dynorex". */
export const LogoWordmark = memo(function LogoWordmark({ width = 120 }: { width?: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Dynorex"
      style={{ width, height: width * WORDMARK_RATIO }}
    >
      <Image
        accessible={false}
        source={WORDMARK_PNG}
        style={{ width: "100%", height: "100%", tintColor: themeState.dark ? undefined : color.text }}
        resizeMode="contain"
      />
    </View>
  );
});
