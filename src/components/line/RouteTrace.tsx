import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { trackToSvgPath, type ShapePoint } from "@/domain/routes";
import { color, radius } from "@/theme/tokens";

const W = 320;

/**
 * The shape of a drive on a "night map": faint grid and contours, the route as a glowing lime line, a lime
 * ring at the start and a checkered marker at the finish. Drawn on the phone (no map provider involved), so it
 * is also how private drives are shown. The surrounding text gives distance and time, so the drawing only has
 * a short description for screen readers.
 */
export function RouteTrace({
  points,
  height = 180,
  label,
}: {
  points: readonly ShapePoint[];
  height?: number;
  label: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = trackToSvgPath(points, W, height, 22);
  const start = /^M([\d.]+) ([\d.]+)/.exec(d);
  const end = /L([\d.]+) ([\d.]+)$/.exec(d);
  const grid = [];
  for (let x = 20; x < W; x += 24) grid.push(<Line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} />);
  for (let y = 16; y < height; y += 24) grid.push(<Line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} />);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        backgroundColor: "#0e1012",
        borderRadius: radius.md,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: color.hairline,
      }}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${id}-vignette`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1a1d21" />
            <Stop offset="1" stopColor="#0b0c0e" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={height} fill={`url(#${id}-vignette)`} />
        <G stroke="#F2EFE8" strokeOpacity={0.045} strokeWidth={1}>
          {grid}
        </G>
        {/* contour lines: terrain feel without real map data */}
        <G stroke="#F2EFE8" strokeOpacity={0.05} strokeWidth={1} fill="none">
          <Ellipse cx={W * 0.25} cy={height * 0.35} rx={70} ry={38} />
          <Ellipse cx={W * 0.25} cy={height * 0.35} rx={44} ry={22} />
          <Ellipse cx={W * 0.78} cy={height * 0.7} rx={90} ry={46} />
          <Ellipse cx={W * 0.78} cy={height * 0.7} rx={58} ry={28} />
        </G>
        {d ? (
          <>
            {/* glow, then the line */}
            <Path
              d={d}
              stroke={color.accent}
              strokeOpacity={0.12}
              strokeWidth={12}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Path
              d={d}
              stroke={color.accent}
              strokeOpacity={0.3}
              strokeWidth={6}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Path
              d={d}
              stroke={color.accent}
              strokeWidth={2.6}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {start ? (
          <Circle
            cx={Number(start[1])}
            cy={Number(start[2])}
            r={6}
            fill="#0e1012"
            stroke={color.accent}
            strokeWidth={3}
          />
        ) : null}
        {end ? (
          <G>
            {[0, 1, 2, 3].map((i) => (
              <Rect
                key={i}
                x={Number(end[1]) - 6 + (i % 2) * 6}
                y={Number(end[2]) - 6 + Math.floor(i / 2) * 6}
                width={6}
                height={6}
                fill={i === 0 || i === 3 ? "#F2EFE8" : "#111315"}
              />
            ))}
            <Rect
              x={Number(end[1]) - 6}
              y={Number(end[2]) - 6}
              width={12}
              height={12}
              fill="none"
              stroke="#F2EFE8"
              strokeWidth={1}
            />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
