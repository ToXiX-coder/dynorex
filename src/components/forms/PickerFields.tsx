import { useState } from "react";
import {
  clampYmd,
  composeYmd,
  daysInMonth,
  formatDuration,
  formatTime,
  formatYmd,
  from12h,
  parseYmd,
  to12h,
  ymd,
} from "@/domain/pickers";
import { CalendarIcon, ClockIcon, TimerIcon } from "@/components/icons";
import { Wheel, WheelField } from "./Wheel";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" }),
}));
const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** A date ("YYYY-MM-DD", or "" when optional and empty) picked on month / day / year wheels. */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  required,
  hint,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  hint?: string | null;
  error?: string | null;
  disabled?: boolean;
}) {
  const today = ymd(new Date());
  const [draft, setDraft] = useState(() => parseYmd(value || clampYmd(today, min, max))!);
  const minY = parseYmd(min ?? "")?.y ?? new Date().getFullYear() - 60;
  const maxY = parseYmd(max ?? "")?.y ?? new Date().getFullYear() + 1;
  const set = (p: Partial<typeof draft>) => {
    const n = { ...draft, ...p };
    const s = clampYmd(composeYmd(n.y, n.m, n.d), min, max);
    setDraft(parseYmd(s)!);
  };
  return (
    <WheelField
      label={label}
      required={required}
      display={value ? formatYmd(value) : ""}
      placeholder="Pick a date"
      hint={hint}
      error={error}
      icon={CalendarIcon}
      disabled={disabled}
      onOpen={() => setDraft(parseYmd(value || clampYmd(today, min, max))!)}
      onDone={() => onChange(composeYmd(draft.y, draft.m, draft.d))}
      onClear={required ? undefined : () => onChange("")}
      renderWheels={() => (
        <>
          <Wheel label="Month" items={MONTHS} value={draft.m} onChange={(m) => set({ m })} width={84} />
          <Wheel
            label="Day"
            items={range(1, daysInMonth(draft.y, draft.m)).map((d) => ({ value: d, label: String(d) }))}
            value={draft.d}
            onChange={(d) => set({ d })}
            width={64}
          />
          <Wheel
            label="Year"
            items={range(minY, maxY)
              .reverse()
              .map((y) => ({ value: y, label: String(y) }))}
            value={draft.y}
            onChange={(y) => set({ y })}
            width={92}
          />
        </>
      )}
    />
  );
}

/** A time of day ("HH:MM", 24 h) picked on hour / minute / AM-PM wheels. */
export function TimeField({
  label,
  value,
  onChange,
  minuteStep = 5,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minuteStep?: number;
  hint?: string | null;
  disabled?: boolean;
}) {
  const snap = (t: ReturnType<typeof to12h>) => ({ ...t, m: (Math.round(t.m / minuteStep) * minuteStep) % 60 });
  const [draft, setDraft] = useState(() => snap(to12h(value)));
  return (
    <WheelField
      label={label}
      display={formatTime(value)}
      hint={hint}
      icon={ClockIcon}
      disabled={disabled}
      onOpen={() => setDraft(snap(to12h(value)))}
      onDone={() => onChange(from12h(draft.h, draft.m, draft.pm))}
      renderWheels={() => (
        <>
          <Wheel
            label="Hour"
            items={range(1, 12).map((h) => ({ value: h, label: String(h) }))}
            value={draft.h}
            onChange={(h) => setDraft({ ...draft, h })}
            width={64}
          />
          <Wheel
            label="Minute"
            items={range(0, 59, minuteStep).map((m) => ({ value: m, label: String(m).padStart(2, "0") }))}
            value={draft.m}
            onChange={(m) => setDraft({ ...draft, m })}
            width={64}
          />
          <Wheel
            label="AM or PM"
            items={[
              { value: "am", label: "AM" },
              { value: "pm", label: "PM" },
            ]}
            value={draft.pm ? "pm" : "am"}
            onChange={(v) => setDraft({ ...draft, pm: v === "pm" })}
            width={64}
          />
        </>
      )}
    />
  );
}

/** A length of time in minutes, picked on hours / minutes wheels (at least `minMinutes`). */
export function DurationField({
  label,
  minutes,
  onChange,
  maxHours = 12,
  minuteStep = 15,
  minMinutes = 15,
  hint,
  disabled,
}: {
  label: string;
  minutes: number;
  onChange: (v: number) => void;
  maxHours?: number;
  minuteStep?: number;
  minMinutes?: number;
  hint?: string | null;
  disabled?: boolean;
}) {
  const split = (v: number) => ({ h: Math.floor(v / 60), m: v % 60 });
  const [draft, setDraft] = useState(() => split(minutes));
  const total = Math.max(minMinutes, draft.h * 60 + draft.m);
  return (
    <WheelField
      label={label}
      display={formatDuration(minutes)}
      hint={hint}
      icon={TimerIcon}
      disabled={disabled}
      onOpen={() => setDraft(split(minutes))}
      onDone={() => onChange(total)}
      renderWheels={() => (
        <>
          <Wheel
            label="Hours"
            items={range(0, maxHours).map((h) => ({ value: h, label: `${h} h` }))}
            value={draft.h}
            onChange={(h) => setDraft({ ...draft, h })}
            width={84}
          />
          <Wheel
            label="Minutes"
            items={range(0, 59, minuteStep).map((m) => ({ value: m, label: `${m} min` }))}
            value={draft.m}
            onChange={(m) => setDraft({ ...draft, m })}
            width={96}
          />
        </>
      )}
    />
  );
}

/** A year (as a string, "" until chosen) on a single wheel, newest first. */
export function YearField({
  label,
  value,
  onChange,
  min,
  max,
  start,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  /** where the wheel starts when nothing is chosen yet */
  start?: number;
  required?: boolean;
  error?: string | null;
}) {
  const initial = () => (/^\d{4}$/.test(value) ? Number(value) : (start ?? max));
  const [draft, setDraft] = useState(initial);
  return (
    <WheelField
      label={label}
      required={required}
      display={value}
      placeholder="Pick a year"
      error={error}
      icon={CalendarIcon}
      onOpen={() => setDraft(initial())}
      onDone={() => onChange(String(draft))}
      renderWheels={() => (
        <Wheel
          label="Year"
          items={range(min, max)
            .reverse()
            .map((y) => ({ value: y, label: String(y) }))}
          value={draft}
          onChange={setDraft}
          width={120}
        />
      )}
    />
  );
}
