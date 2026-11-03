import { a11yHidden } from "@/utils/a11y";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { iconSize } from "@/theme/tokens";

/** Custom automotive tab icons. Decorative: the tab label carries the accessible name. */
type P = { color: string; size?: number };

export const HomeIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </Svg>
);

export const WrenchIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path
      d="M14.5 3.5a5 5 0 0 0-5.6 6.6L3 16l5 5 5.9-5.9a5 5 0 0 0 6.6-5.6l-3 3-3-1-1-3z"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

export const RoadIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M8 3 4 21M16 3l4 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M12 4v3M12 10v3M12 16v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export const SteeringIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
    <Circle cx={12} cy={12} r={2.5} fill={color} />
    <Path d="M3.5 10.5h6M14.5 10.5h6M12 14.5V21" stroke={color} strokeWidth={2} />
  </Svg>
);

export const CarIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M3 15v-3l2-1 3-4h7l4 4 2 1v3h-2" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M10 15h4" stroke={color} strokeWidth={2} />
    <Circle cx={7} cy={16} r={2} fill="none" stroke={color} strokeWidth={2} />
    <Circle cx={17} cy={16} r={2} fill="none" stroke={color} strokeWidth={2} />
  </Svg>
);

export const CalendarIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Polygon points="4,6 20,6 20,20 4,20" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M4 10h16M8 3v5M16 3v5" stroke={color} strokeWidth={2} />
  </Svg>
);

export const TagIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M3 12V4h8l10 10-8 8z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Circle cx={7.5} cy={8.5} r={1.5} fill={color} />
  </Svg>
);

export const PlusIcon = ({ color, size = iconSize.lg }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M12 4v16M4 12h16" stroke={color} strokeWidth={3} strokeLinecap="square" />
  </Svg>
);

export const BellIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path
      d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

export const ProfileIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={12} cy={8} r={4} fill="none" stroke={color} strokeWidth={2} />
    <Path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke={color} strokeWidth={2} />
  </Svg>
);

export const SearchIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={10.5} cy={10.5} r={6.5} fill="none" stroke={color} strokeWidth={2} />
    <Path d="m15.5 15.5 5 5" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

export const ShareIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M5 13v7h14v-7" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </Svg>
);

export const LockIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Polygon points="5,11 19,11 19,21 5,21" fill="none" stroke={color} strokeWidth={2} />
    <Path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke={color} strokeWidth={2} />
  </Svg>
);

export const MoreIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={5} cy={12} r={2} fill={color} />
    <Circle cx={12} cy={12} r={2} fill={color} />
    <Circle cx={19} cy={12} r={2} fill={color} />
  </Svg>
);

/** Drawn marks that replace typed symbols (›, ✓, ⚠, ×) so they line up and scale like the rest of the icons. */
export const ChevronIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="m9 5 7 7-7 7" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** the dropdown mark on fields that open a list or picker */
export const ChevronDownIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="m5 9 7 7 7-7" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ClockIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
    <Path d="M12 7v5l3 2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** a length of time (stopwatch) */
export const TimerIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={12} cy={13.5} r={7.5} fill="none" stroke={color} strokeWidth={2} />
    <Path d="M10 2.5h4M12 6v-3.5M12 13.5 15 10.5M18.5 6.5l1.5-1.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

/** a rating star: filled when lit, an outline when not */
export const StarIcon = ({ color, size = iconSize.sm, on = true }: P & { on?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path
      d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
      fill={on ? color : "none"}
      stroke={color}
      strokeWidth={1.75}
      strokeLinejoin="round"
    />
  </Svg>
);

/** a radio button's mark: a ring, filled in the middle when chosen */
export const RadioIcon = ({ color, size = iconSize.sm, on }: P & { on: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
    {on ? <Circle cx={12} cy={12} r={5} fill={color} /> : null}
  </Svg>
);

export const CheckIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const AlertIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M12 3 2.5 20h19z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M12 10v4.5M12 17.2v.3" stroke={color} strokeWidth={2.25} strokeLinecap="round" />
  </Svg>
);

export const CloseIcon = ({ color, size = iconSize.sm }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

export const PencilIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </Svg>
);

export const ReceiptIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    <Path d="M9 8h6M9 12h6M9 16h3" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export const ChatIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M4 5h16v11H10l-5 4v-4H4z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </Svg>
);

export const BackIcon = ({ color, size = iconSize.md }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...a11yHidden}>
    <Path d="M15 4 7 12l8 8" fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="miter" />
  </Svg>
);
