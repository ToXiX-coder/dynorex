import { StyleSheet, View } from "react-native";
import { roadUseText } from "@/domain/vehicleKind";
import { formatRange, isStock, sayRange, specRange, type SpecField } from "@/domain/specRange";
import { formatSpec, SPEC_DISCLAIMER, type SpecStatus } from "@/domain/specs";
import type { PublicSpecRow, SpecEstimateRow } from "@/services/supabase/database.types";
import { border, color, radius, space, type } from "@/theme/tokens";
import { a11yHidden } from "@/utils/a11y";
import { Text } from "../Text";
import { themed } from "@/theme/themed";

interface Tile {
  label: string;
  field: SpecField;
  value: number | null;
  status: SpecStatus;
  unit: string;
  decimals?: number;
  /** Draw a dyno bar scaled to this reference (decorative; the numbers are the information). */
  barMax?: number;
  /** No completed mods: show the owner's exact stock number instead of a range. */
  stock?: boolean;
}

/**
 * One spec, shown as a RANGE (domain/specRange.ts) with the point estimate underneath, so nobody expects one
 * exact number. Unknown/invalid are explained in words. HP and torque get a dyno bar: solid up to the low end,
 * a lighter band across the range.
 */
function SpecTile({ label, field, value, status, unit, decimals = 0, barMax, stock = false }: Tile) {
  const range = !stock && status === "estimate" && value !== null ? specRange(field, value) : null;
  const shown = range ? formatRange(range) : formatSpec(value, status, decimals);
  const said = range
    ? `${label}: ${sayRange(range)} ${unit}, estimate ${formatSpec(value, status, decimals)}`
    : stock && status === "estimate"
      ? `${label}: ${formatSpec(value, status, decimals)} ${unit}, stock`
      : status === "unknown"
        ? `${label}: unknown, no baseline`
        : `${label}: check your numbers`;
  const pct = (v: number) => Math.max(2, Math.min(100, (v / barMax!) * 100));
  return (
    <View style={styles.tile} accessible accessibilityLabel={said}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          style={[
            type.spec,
            range && styles.rangeValue,
            range && shown.length === 8 && styles.range8,
            range && shown.length > 8 && styles.range9,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {shown}
        </Text>
        {status === "estimate" ? <Text style={[type.specUnit, { color: color.textMuted }]}>{` ${unit}`}</Text> : null}
      </View>
      {range ? (
        <Text variant="caption" muted>{`est. ${formatSpec(value, status, decimals)}`}</Text>
      ) : stock && status === "estimate" ? (
        <Text variant="caption" muted>
          Stock
        </Text>
      ) : (
        <Text variant="caption" muted>
          {status === "unknown" ? "No baseline" : "Check numbers"}
        </Text>
      )}
      {stock && status === "estimate" && barMax && value !== null ? (
        <View style={styles.track} {...a11yHidden}>
          <View style={[styles.fill, { width: `${pct(value)}%` }]} />
        </View>
      ) : null}
      {range && barMax ? (
        <View style={styles.track} {...a11yHidden}>
          <View style={[styles.fill, { width: `${pct(range.low)}%` }]} />
          <View
            style={[
              styles.band,
              { left: `${pct(range.low)}%`, width: `${Math.max(2, pct(range.high) - pct(range.low))}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}
const signed = (n: number, d = 0) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

/**
 * Current estimate from COMPLETE mods only, the exact disclaimer always visible underneath, and
 * planned / in-progress changes listed separately.
 */
export function SpecCard({
  estimate,
}: {
  /** Owner view has pending deltas; public pages get the current estimate only. */
  estimate: (PublicSpecRow & Partial<SpecEstimateRow>) | null;
}) {
  const e = estimate;
  const stock = isStock(e);
  const st = (s: SpecStatus | undefined): SpecStatus => s ?? "unknown";
  const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const pend = e
    ? [
        Number(e.pending_hp_delta) ? `${signed(Number(e.pending_hp_delta))} hp` : null,
        Number(e.pending_torque_delta) ? `${signed(Number(e.pending_torque_delta))} lb-ft` : null,
        Number(e.pending_weight_delta) ? `${signed(Number(e.pending_weight_delta))} lb` : null,
        Number(e.pending_zero_to_sixty_delta) ? `${signed(Number(e.pending_zero_to_sixty_delta), 2)} s 0–60` : null,
      ].filter(Boolean)
    : [];
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.grid}>
        <SpecTile
          stock={stock}
          label="HP"
          field="hp"
          value={n(e?.hp)}
          status={st(e?.hp_status)}
          unit="hp"
          barMax={600}
        />
        <SpecTile
          stock={stock}
          label="Torque"
          field="torque"
          value={n(e?.torque_lbft)}
          status={st(e?.torque_status)}
          unit="lb-ft"
          barMax={600}
        />
        <SpecTile
          stock={stock}
          label="Weight"
          field="weight"
          value={n(e?.weight_lb)}
          status={st(e?.weight_status)}
          unit="lb"
        />
        <SpecTile
          stock={stock}
          label="0–60"
          field="zero_to_sixty"
          value={n(e?.zero_to_sixty_s)}
          status={st(e?.zero_to_sixty_status)}
          unit="s"
          decimals={1}
        />
        <SpecTile
          stock={stock}
          label="Power-to-weight"
          field="lb_per_hp"
          value={n(e?.lb_per_hp)}
          status={st(e?.lb_per_hp_status)}
          unit="lb/hp"
          decimals={1}
        />
      </View>
      {/* Required wording, always on screen next to the numbers (handoff spec 5.7). */}
      <Text variant="caption" muted accessibilityRole="text">
        {SPEC_DISCLAIMER}
      </Text>
      <Text variant="caption" muted>
        {stock
          ? "Stock numbers, as you entered them. Estimates switch to ranges once a mod is complete."
          : "Shown as ranges: the same part makes different numbers on different cars, days and dynos."}
      </Text>
      <Text variant="caption" muted>
        {`Counts ${e?.completed_mods_counted ?? 0} completed mod${e?.completed_mods_counted === 1 ? "" : "s"}.`}
        {pend.length ? ` Planned or in progress, not counted yet: ${pend.join(", ")}.` : ""}
      </Text>
    </View>
  );
}

/** The e-bike numbers a build carries (D-71), from the vehicle row or the public build. */
export type EbikeNumbers = {
  motor_w?: number | string | null;
  battery_wh?: number | string | null;
  range_mi?: number | string | null;
  top_speed_mph?: number | string | null;
  /** D-73 */
  battery_v?: number | null;
  street_legal?: boolean | null;
  /** D-74: what its newest complete mods set (null: stock) */
  mod_motor_w?: number | null;
  mod_battery_v?: number | null;
  mod_battery_wh?: number | null;
};

/** An e-bike stock number: the owner's figure, exact, in the same tile as the car specs. */
function StockTile({
  label,
  value,
  unit,
  decimals = 0,
  note = "Stock",
}: {
  label: string;
  value: number | null;
  unit: string;
  decimals?: number;
  note?: string;
}) {
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={
        value === null ? `${label}: not set` : `${label}: ${value.toFixed(decimals)} ${unit}, ${note}`
      }
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        {value === null ? (
          <Text variant="bodyStrong" muted>
            Not set
          </Text>
        ) : (
          <>
            <Text style={type.spec} numberOfLines={1}>
              {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
            </Text>
            <Text style={[type.specUnit, { color: color.textMuted }]}>{` ${unit}`}</Text>
          </>
        )}
      </View>
      <Text variant="caption" muted>
        {value === null ? "No figure yet" : note}
      </Text>
    </View>
  );
}

/**
 * D-71: an e-bike's numbers. Range and top speed are the owner's stock figures; weight is the same estimate as a
 * car's, so a lighter wheelset still counts. D-74: a controller or battery mod replaces peak power and the pack,
 * shown "with mods" and the stock figure beside it.
 */
export function EbikeSpecCard({
  bike,
  estimate,
}: {
  bike: EbikeNumbers;
  estimate: (PublicSpecRow & Partial<SpecEstimateRow>) | null;
}) {
  const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const e = estimate;
  const wh = n(bike.battery_wh);
  const kw = n(bike.motor_w) === null ? null : n(bike.motor_w)! / 1000;
  const modKw = n(bike.mod_motor_w) === null ? null : n(bike.mod_motor_w)! / 1000;
  const modWh = n(bike.mod_battery_wh);
  const volts = bike.mod_battery_v ?? bike.battery_v;
  const packModded = bike.mod_battery_v != null || modWh !== null;
  const stockText = (x: number | null, unit: string) =>
    x === null ? "With mods" : `With mods · stock ${x.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
  const range = n(bike.range_mi);
  return (
    <View style={{ gap: space.sm }}>
      {roadUseText(bike.street_legal) ? (
        <Text variant="bodyStrong">
          {bike.street_legal ? "Street legal: plated for the road." : "Off-road only: trails and private land."}
        </Text>
      ) : null}
      <View style={styles.grid}>
        {/* e-moto makers quote peak power in kW */}
        <StockTile
          label="Peak power"
          value={modKw ?? kw}
          unit="kW"
          decimals={1}
          note={modKw === null ? "Stock" : stockText(kw, "kW")}
        />
        <StockTile
          label="Battery"
          value={modWh ?? wh}
          unit="Wh"
          note={
            packModded
              ? `${volts ? `${volts}V pack · ` : ""}${modWh === null ? "with mods" : stockText(wh, "Wh").toLowerCase()}`
              : volts
                ? `${volts}V pack`
                : "Stock"
          }
        />
        <StockTile label="Range" value={range} unit="mi" />
        <StockTile label="Top speed" value={n(bike.top_speed_mph)} unit="mph" />
        <SpecTile
          stock={isStock(e)}
          label="Weight"
          field="weight"
          value={n(e?.weight_lb)}
          status={e?.weight_status ?? "unknown"}
          unit="lb"
        />
        {/* a real figure, derived: how far each watt-hour goes on the claimed range */}
        <StockTile
          label="Efficiency"
          value={wh && range ? Math.round(wh / range) : null}
          unit="Wh/mi"
          note="Battery over range"
        />
      </View>
      <Text variant="caption" muted>
        {packModded || modKw !== null
          ? 'Stock numbers as the owner entered them or from the maker; "with mods" is what the owner says the latest parts make. Range is stock. Real range depends on the power mode, rider, terrain and weather.'
          : "Stock numbers, as the owner entered them or from the maker. Real range depends on the power mode, rider, terrain and weather."}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: color.surface,
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderColor: color.hairline,
      borderTopWidth: border.regular,
      borderTopColor: color.accent,
      padding: space.md,
      gap: space.xxs,
    },
    label: { ...type.specUnit, color: color.textMuted, letterSpacing: 1.5 },
    track: { height: 4, backgroundColor: color.background, borderRadius: 2, overflow: "hidden", marginTop: space.xs },
    rangeValue: { fontSize: 30, lineHeight: 34, flexShrink: 1 },
    // web ignores adjustsFontSizeToFit, so long ranges ("3160-3340") step down instead of being cut off
    range8: { fontSize: 26, lineHeight: 34 },
    range9: { fontSize: 22, lineHeight: 34 },
    band: { position: "absolute", top: 0, height: 4, backgroundColor: color.accent, opacity: 0.35 },
    fill: { height: 4, backgroundColor: color.accent, borderTopRightRadius: 2, transform: [{ skewX: "-30deg" }] },
    valueRow: { flexDirection: "row", alignItems: "baseline" },
  }),
);
