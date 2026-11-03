import { memo } from "react";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import type { Gear } from "@/domain/gear";
import { palette } from "@/theme/palette";
import { a11yHidden } from "@/utils/a11y";

const P = palette;

/**
 * The little car person: a chibi bust in brand colours only, dressed in the owner's gear (headgear, outfit,
 * something in hand). Decorative; the parent supplies the accessible name (see gearDescription).
 */
export const Driver = memo(function Driver({ gear, size = 64 }: { gear: Gear; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...a11yHidden}>
      <Outfit id={gear.outfit} />
      {/* neck + head */}
      <Rect x={28} y={36} width={8} height={7} fill={P.logoGrayLight} />
      {gear.head === "race_helmet" ? null : (
        <>
          <Path d="M19 27 Q19 14 32 14 Q45 14 45 27 Q45 40 32 40 Q19 40 19 27 Z" fill={P.boneWhite} />
          {/* angular, slightly fierce eyes: it's still Dynorex */}
          {gear.head === "shades" ? null : (
            <>
              <Path d="M24 27 L29.5 28.5 L29 30.5 L24.5 29.5 Z" fill={P.asphaltBlack} />
              <Path d="M40 27 L34.5 28.5 L35 30.5 L39.5 29.5 Z" fill={P.asphaltBlack} />
            </>
          )}
          <Path d="M28 34.5 Q32 37 36 34.5" stroke={P.asphaltBlack} strokeWidth={1.6} fill="none" />
        </>
      )}
      <Head id={gear.head} />
      <Prop id={gear.prop} />
    </Svg>
  );
});

const TORSO = "M10 64 L14 48 Q18 42 32 42 Q46 42 50 48 L54 64 Z";

function Outfit({ id }: { id: Gear["outfit"] }) {
  switch (id) {
    case "race_suit":
      return (
        <G>
          <Path d={TORSO} fill={P.aggressiveRed} />
          <Path d="M22 44 L26 64 L30 64 L27 43 Z" fill={P.electricLime} />
          <Path d="M42 44 L38 64 L34 64 L37 43 Z" fill={P.electricLime} />
          <Rect x={27} y={41} width={10} height={4} rx={1} fill={P.boneWhite} />
        </G>
      );
    case "mechanic_jacket":
      return (
        <G>
          <Path d={TORSO} fill={P.logoGrayDark} />
          <Line x1={32} y1={44} x2={32} y2={64} stroke={P.asphaltBlack} strokeWidth={1.5} />
          <Path d="M24 42 L32 50 L40 42" stroke={P.logoGrayLight} strokeWidth={2.5} fill="none" />
          <Rect x={36} y={52} width={10} height={5} rx={1} fill={P.boneWhite} />
          <Line x1={38} y1={54.5} x2={44} y2={54.5} stroke={P.aggressiveRed} strokeWidth={1.2} />
        </G>
      );
    case "hoodie":
      return (
        <G>
          <Path d="M18 46 Q32 34 46 46 L44 50 Q32 42 20 50 Z" fill={P.logoGrayDark} />
          <Path d={TORSO} fill={P.cardSurface} stroke={P.logoGrayDark} strokeWidth={1.5} />
          <Line x1={29} y1={46} x2={28} y2={55} stroke={P.electricLime} strokeWidth={1.5} />
          <Line x1={35} y1={46} x2={36} y2={55} stroke={P.electricLime} strokeWidth={1.5} />
          <Path d="M22 58 L42 58 L40 64 L24 64 Z" fill={P.asphaltBlack} />
        </G>
      );
    case "flannel":
      return (
        <G>
          <Path d={TORSO} fill={P.aggressiveRed} />
          {[18, 26, 38, 46].map((x) => (
            <Line key={x} x1={x} y1={43} x2={x} y2={64} stroke={P.asphaltBlack} strokeWidth={2} opacity={0.55} />
          ))}
          {[50, 57].map((y) => (
            <Line key={y} x1={12} y1={y} x2={52} y2={y} stroke={P.asphaltBlack} strokeWidth={2} opacity={0.55} />
          ))}
          <Path d="M26 42 L32 49 L38 42" stroke={P.boneWhite} strokeWidth={1.5} fill="none" />
        </G>
      );
    case "tee":
      return (
        <G>
          <Path d={TORSO} fill={P.logoGrayMid} />
          <Path d="M27 42 Q32 46 37 42" stroke={P.asphaltBlack} strokeWidth={1.5} fill="none" />
          {/* the Dynorex slash */}
          <Path d="M30 52 L35 52 L33 59 L28 59 Z" fill={P.electricLime} />
        </G>
      );
  }
}

const HAIR = "M19 26 L20 17 L24 20 L26 12 L30 17 L33 10 L36 16 L40 11 L41 18 L45 16 L45 26 Q40 19 32 20 Q24 19 19 26 Z";

function Head({ id }: { id: Gear["head"] }) {
  switch (id) {
    case "race_helmet":
      return (
        <G>
          <Path d="M17 30 Q16 12 32 11 Q48 12 47 30 L46 40 Q32 44 18 40 Z" fill={P.electricLime} />
          <Path d="M30 11.5 L34 11.5 L33 42 L31 42 Z" fill={P.aggressiveRed} />
          <Path d="M20 24 L44 24 L43 32 Q32 35 21 32 Z" fill={P.asphaltBlack} />
          <Path d="M24 26 L30 26 L28 28 L23 28 Z" fill={P.boneWhite} opacity={0.6} />
        </G>
      );
    case "cap":
      return (
        <G>
          <Path d={HAIR} fill={P.asphaltBlack} />
          <Path d="M19 23 Q20 12 32 12 Q44 12 45 23 Z" fill={P.aggressiveRed} />
          {/* worn backwards: brim out the back, strap gap in front */}
          <Path d="M43 21 L52 25 L51 27 L43 24 Z" fill={P.asphaltBlack} />
          <Rect x={27} y={20} width={10} height={3} fill={P.boneWhite} />
        </G>
      );
    case "beanie":
      return (
        <G>
          <Path d="M18 25 Q18 9 32 9 Q46 9 46 25 Z" fill={P.logoGrayDark} />
          <Rect x={17} y={21} width={30} height={6} rx={2} fill={P.electricLime} />
          <Circle cx={32} cy={8} r={3} fill={P.logoGrayLight} />
        </G>
      );
    case "headband":
      return (
        <G>
          <Path d={HAIR} fill={P.asphaltBlack} />
          <Rect x={18.5} y={20} width={27} height={5} fill={P.boneWhite} />
          <Circle cx={32} cy={22.5} r={2} fill={P.aggressiveRed} />
          <Path d="M45 21 L51 18 L50 23 Z" fill={P.boneWhite} />
        </G>
      );
    case "flat_cap":
      return (
        <G>
          <Path d="M18 23 Q19 12 32 12 Q46 12 46 21 Z" fill={P.logoGrayDark} />
          <Path d="M16 22 Q30 26 46 21 L46 24 Q30 29 15 25 Z" fill={P.logoGrayMid} />
          <Line x1={22} y1={15} x2={40} y2={14} stroke={P.logoGrayMid} strokeWidth={1} />
        </G>
      );
    case "headset":
      return (
        <G>
          <Path d={HAIR} fill={P.asphaltBlack} />
          <Path d="M18 27 Q18 9 32 9 Q46 9 46 27" stroke={P.asphaltBlack} strokeWidth={3} fill="none" />
          <Rect x={14} y={23} width={7} height={10} rx={2} fill={P.electricLime} />
          <Rect x={43} y={23} width={7} height={10} rx={2} fill={P.electricLime} />
          <Path d="M17 32 Q19 38 27 36" stroke={P.asphaltBlack} strokeWidth={1.8} fill="none" />
          <Circle cx={27.5} cy={36} r={1.6} fill={P.asphaltBlack} />
        </G>
      );
    case "shades":
      return (
        <G>
          <Path d={HAIR} fill={P.asphaltBlack} />
          <Path d="M20 25 L31 26 L30 31 L22 31 Z" fill={P.asphaltBlack} />
          <Path d="M44 25 L33 26 L34 31 L42 31 Z" fill={P.asphaltBlack} />
          <Rect x={30} y={26} width={4} height={1.5} fill={P.asphaltBlack} />
          <Path d="M23 27 L26 27 L25 28.5 L22.5 28.5 Z" fill={P.electricLime} />
        </G>
      );
    case "none":
      return <Path d={HAIR} fill={P.asphaltBlack} />;
  }
}

function Prop({ id }: { id: Gear["prop"] }) {
  switch (id) {
    case "wrench":
      return (
        <G transform="rotate(-35 52 50)">
          <Rect x={50} y={44} width={4} height={18} rx={1} fill={P.logoGrayLight} />
          <Path d="M47 44 Q47 37 52 37 L52 41 L54 41 L54 37 Q59 37 59 44 Z" fill={P.logoGrayLight} />
        </G>
      );
    case "flag":
      return (
        <G>
          <Line x1={49} y1={36} x2={49} y2={63} stroke={P.logoGrayLight} strokeWidth={1.8} />
          <Rect x={50} y={36} width={12} height={9} fill={P.boneWhite} />
          {[0, 1, 2].map((c) =>
            [0, 1, 2].map((r) =>
              (c + r) % 2 === 0 ? (
                <Rect key={`${c}${r}`} x={50 + c * 4} y={36 + r * 3} width={4} height={3} fill={P.asphaltBlack} />
              ) : null,
            ),
          )}
        </G>
      );
    case "trophy":
      return (
        <G>
          <Path d="M47 44 L59 44 L58 51 Q53 55 48 51 Z" fill={P.electricLime} />
          <Path d="M47 46 Q43 46 45 50 L48 51" stroke={P.electricLime} strokeWidth={1.5} fill="none" />
          <Path d="M59 46 Q63 46 61 50 L58 51" stroke={P.electricLime} strokeWidth={1.5} fill="none" />
          <Rect x={52} y={53} width={2} height={5} fill={P.electricLime} />
          <Rect x={48.5} y={58} width={9} height={3} fill={P.logoGrayLight} />
        </G>
      );
    case "keys":
      return (
        <G>
          <Circle cx={51} cy={50} r={3.5} stroke={P.logoGrayLight} strokeWidth={1.8} fill="none" />
          <Rect x={53} y={52} width={7} height={10} rx={2} fill={P.electricLime} transform="rotate(-20 56 57)" />
          <Rect x={45} y={53} width={3} height={8} fill={P.logoGrayLight} transform="rotate(15 46 57)" />
        </G>
      );
    case "none":
      return null;
  }
}
