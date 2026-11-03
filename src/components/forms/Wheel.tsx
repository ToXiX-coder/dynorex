import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/buttons/Button";
import { ChevronDownIcon } from "@/components/icons";
import { Text } from "@/components/Text";
import { FieldError } from "./TextField";
import { haptic } from "@/services/haptics";
import { border, color, radius, space, touch, type } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export const ITEM_H = 44;
const VISIBLE = 5; // rows shown; the middle one is the pick

export type WheelItem<T extends string | number> = { value: T; label: string };

type WheelProps<T extends string | number> = {
  items: WheelItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  width?: number;
};

const clampRow = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));

/**
 * One scroll-wheel column. Flick or drag and it snaps to a row; tap a row to jump to it. Screen readers get an
 * "adjustable" control (swipe up/down to change) instead of a list, so it's as easy as a stepper.
 * Phone browsers scroll lists their own way (no snapping, momentum the page can't stop), so the web gets a wheel
 * that follows the finger itself.
 */
export function Wheel<T extends string | number>(props: WheelProps<T>) {
  return Platform.OS === "web" ? <WebWheel {...props} /> : <NativeWheel {...props} />;
}

function NativeWheel<T extends string | number>({ items, value, onChange, label, width = 80 }: WheelProps<T>) {
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );
  const scroller = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a finger on the wheel: never commit (or move the wheel) under it
  const touching = useRef(false);
  const lastRow = useRef(index);
  // the index this wheel just committed itself, so following the new value doesn't jump the wheel again
  const own = useRef<number | null>(null);
  // the row under the band while scrolling; tied to the value it started from so an outside change resets it
  const [liveState, setLiveState] = useState({ i: index, base: index });
  const live = liveState.base === index ? liveState.i : index;
  const setLive = (i: number) => setLiveState((s) => (s.i === i && s.base === index ? s : { i, base: index }));

  // follow the value when it changes from outside (e.g. Feb 31 snapping to Feb 28)
  useEffect(() => {
    if (own.current === index) {
      own.current = null;
      return;
    }
    scroller.current?.scrollTo({ y: index * ITEM_H, animated: false });
  }, [index]);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const commit = (c: number) => {
    if (items[c] && items[c].value !== value) {
      haptic.select();
      own.current = c;
      onChange(items[c].value);
    }
  };

  // a tap on a row: scroll it under the band
  const pick = (i: number) => {
    const c = Math.max(0, Math.min(items.length - 1, i));
    setLive(c);
    scroller.current?.scrollTo({ y: c * ITEM_H, animated: true });
    commit(c);
  };

  // scrolling snaps by itself (snapToInterval), so only the value is committed
  const scheduleCommit = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (!touching.current) commit(Math.max(0, Math.min(items.length - 1, lastRow.current)));
    }, 160);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    lastRow.current = i;
    setLive(i);
    // commit once scrolling has been still for a moment
    scheduleCommit();
  };

  const shown = Math.max(0, Math.min(items.length - 1, live));
  return (
    <View
      style={{ width, height: ITEM_H * VISIBLE }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index]?.label ?? "" }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => pick(index + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
    >
      <View style={styles.band} pointerEvents="none" />
      <ScrollView
        ref={scroller}
        contentOffset={{ x: 0, y: index * ITEM_H }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onTouchStart={() => {
          touching.current = true;
        }}
        onTouchEnd={() => {
          touching.current = false;
          scheduleCommit();
        }}
        onTouchCancel={() => {
          touching.current = false;
          scheduleCommit();
        }}
        contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
        importantForAccessibility="no-hide-descendants"
      >
        {items.map((it, i) => {
          const d = Math.abs(i - shown);
          return (
            <Pressable key={String(it.value)} onPress={() => pick(i)} style={styles.row}>
              <Text
                numberOfLines={1}
                style={[d === 0 ? styles.on : styles.off, { opacity: d === 0 ? 1 : d === 1 ? 0.6 : 0.3 }]}
              >
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * The web wheel: drag moves the rows with the finger (nothing scrolls, so the page can't join in), a flick glides
 * on and settles on a row, a tap jumps to the tapped row. Mouse wheel and arrow keys step one row.
 */
function WebWheel<T extends string | number>({ items, value, onChange, label, width = 80 }: WheelProps<T>) {
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );
  const last = (items.length - 1) * ITEM_H;
  // null at rest (the wheel shows `index`); a pixel offset while dragging or gliding
  const [pos, setPos] = useState<number | null>(null);
  const posRef = useRef<number | null>(null);
  const drag = useRef<{ id: number; y0: number; p0: number; moved: boolean; trail: { t: number; y: number }[] } | null>(
    null,
  );
  const frame = useRef<number | null>(null);
  const wheelDelta = useRef(0);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => stop, []);

  const move = (p: number | null) => {
    posRef.current = p;
    setPos(p);
  };
  const here = () => posRef.current ?? index * ITEM_H;

  // glide to the row nearest `target`, then commit it (in the same render, so the wheel never flickers back)
  const settleTo = (target: number) => {
    stop();
    const row = clampRow(Math.round(target / ITEM_H), items.length);
    const from = here();
    const to = row * ITEM_H;
    const ms = Math.min(650, 160 + Math.abs(to - from) * 0.9);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      if (k < 1) {
        move(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        frame.current = requestAnimationFrame(step);
        return;
      }
      frame.current = null;
      if (items[row] && items[row].value !== value) {
        haptic.select();
        onChange(items[row].value);
      }
      move(null);
    };
    frame.current = requestAnimationFrame(step);
  };

  // past either end the rows follow the finger at a third of the speed, then spring back
  const rubber = (p: number) => (p < 0 ? p / 3 : p > last ? last + (p - last) / 3 : p);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    stop();
    const p0 = here();
    drag.current = { id: e.pointerId, y0: e.clientY, p0, moved: false, trail: [{ t: e.timeStamp, y: e.clientY }] };
    try {
      // keep getting moves after the finger slides off the column
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone: its up or cancel event still arrives
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 5) return;
    d.moved = true;
    d.trail = [...d.trail.filter((s) => e.timeStamp - s.t < 100), { t: e.timeStamp, y: e.clientY }];
    move(rubber(d.p0 - dy));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // a tap: jump to the row that was tapped
      const box = e.currentTarget.getBoundingClientRect();
      const off = Math.round((e.clientY - (box.top + box.height / 2)) / ITEM_H);
      return settleTo((Math.round(here() / ITEM_H) + off) * ITEM_H);
    }
    // a flick keeps going a little in the direction it was moving
    const a = d.trail[0];
    const b = d.trail[d.trail.length - 1];
    const v = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px per ms, positive = finger moving down
    settleTo(Math.max(0, Math.min(last, here() - v * 250)));
  };
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    settleTo(here());
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    wheelDelta.current += e.deltaY;
    if (Math.abs(wheelDelta.current) < ITEM_H / 2) return;
    const dir = Math.sign(wheelDelta.current);
    wheelDelta.current = 0;
    settleTo((Math.round(here() / ITEM_H) + dir) * ITEM_H);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    settleTo((Math.round(here() / ITEM_H) + dir) * ITEM_H);
  };

  const p = pos ?? index * ITEM_H;
  const shown = clampRow(Math.round(p / ITEM_H), items.length);
  return (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={items[index]?.label ?? ""}
      aria-valuenow={index}
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      style={{
        position: "relative",
        width,
        height: ITEM_H * VISIBLE,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        cursor: "grab",
        outline: "none",
      }}
    >
      <View style={styles.band} pointerEvents="none" />
      <div
        style={{
          position: "relative",
          transform: `translateY(${ITEM_H * Math.floor(VISIBLE / 2) - p}px)`,
          willChange: "transform",
        }}
      >
        {items.map((it, i) => {
          const d = Math.abs(i - shown);
          return (
            <View key={String(it.value)} style={styles.row}>
              <Text
                numberOfLines={1}
                style={[d === 0 ? styles.on : styles.off, { opacity: d === 0 ? 1 : d === 1 ? 0.6 : 0.3 }]}
              >
                {it.label}
              </Text>
            </View>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A dropdown that opens a bottom sheet of wheels. Edits stay in the sheet until "Done", so flicking around
 * never half-changes the form; tapping outside cancels.
 */
export function WheelField({
  label,
  required,
  display,
  placeholder = "Choose",
  hint,
  error,
  sheetTitle,
  icon: Icon,
  renderWheels,
  onOpen,
  onDone,
  onClear,
  disabled,
}: {
  label: string;
  required?: boolean;
  display: string;
  placeholder?: string;
  hint?: string | null;
  error?: string | null;
  /** a drawn icon from components/icons (calendar, clock, timer) */
  icon: ComponentType<{ color: string; size?: number }>;
  sheetTitle?: string;
  renderWheels: () => ReactNode;
  onOpen: () => void;
  onDone: () => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // on a phone, the tap that opens the sheet can land a second time on the backdrop that just appeared under it
  const openedAt = useRef(0);
  const a11y = `${label}: ${display || "not chosen"}`;
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">
        {label}
        {required ? (
          <Text variant="label" muted>
            {" (required)"}
          </Text>
        ) : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Opens a scroll wheel to choose"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={() => {
          onOpen();
          openedAt.current = Date.now();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.field,
          error ? { borderColor: color.danger } : null,
          disabled ? { opacity: 0.5 } : null,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Icon color={color.accent} size={18} />
        <Text style={[type.body, { flex: 1, color: display ? color.text : color.textMuted }]} numberOfLines={1}>
          {display || placeholder}
        </Text>
        <ChevronDownIcon color={color.textMuted} />
      </Pressable>
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Cancel"
          onPress={() => Date.now() - openedAt.current > 400 && setOpen(false)}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <Text variant="section" accessibilityRole="header">
            {sheetTitle ?? label}
          </Text>
          <View style={styles.wheels}>{renderWheels()}</View>
          <Button
            title="Done"
            fullWidth
            onPress={() => {
              onDone();
              setOpen(false);
            }}
          />
          {onClear ? (
            <Button
              title="Clear"
              variant="secondary"
              fullWidth
              onPress={() => {
                onClear();
                setOpen(false);
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    band: {
      position: "absolute",
      left: 0,
      right: 0,
      top: ITEM_H * Math.floor(VISIBLE / 2),
      height: ITEM_H,
      borderTopWidth: border.regular,
      borderBottomWidth: border.regular,
      borderColor: color.accent,
      backgroundColor: color.accentGlow,
      borderRadius: radius.sm,
    },
    row: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
    on: { ...type.heading, fontSize: 17, color: color.accent },
    off: { ...type.body, color: color.text },
    field: {
      minHeight: touch.min,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      borderWidth: border.regular,
      borderColor: color.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: color.background,
    },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
    sheet: {
      backgroundColor: color.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: space.lg,
      gap: space.md,
    },
    wheels: { flexDirection: "row", justifyContent: "center", gap: space.sm },
  }),
);
