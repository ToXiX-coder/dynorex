import { memo, useEffect, useState } from "react";
import { Animated } from "react-native";
import { SvgXml } from "react-native-svg";
import { STICKERS, type StickerId } from "@/domain/plus";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { a11yHidden } from "@/utils/a11y";
import { stickerSvg } from "./stickers";

/**
 * A Torq sticker. Loops a gentle 1.5 s bounce (spec: animated, max 3 s per loop); with reduced motion
 * it is a still image. The surrounding control carries the accessible label.
 */
export const Sticker = memo(function Sticker({
  id,
  size = 56,
  animate = true,
}: {
  id: StickerId;
  size?: number;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced || !animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 750, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, animate, scale]);
  return (
    <Animated.View {...a11yHidden} style={{ width: size, height: (size * 240) / 230, transform: [{ scale }] }}>
      <SvgXml xml={stickerSvg(id)} width="100%" height="100%" />
    </Animated.View>
  );
});

export const stickerName = (id: StickerId) => STICKERS.find((s) => s.id === id)?.name ?? id;
