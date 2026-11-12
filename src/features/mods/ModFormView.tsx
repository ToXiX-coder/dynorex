import { useState, type ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CategoryGrid } from "@/components/build/BuildBits";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError } from "@/components/feedback/Inline";
import { DateField } from "@/components/forms/PickerFields";
import { SelectField } from "@/components/forms/SelectField";
import { FieldError, TextField, fixFieldsText } from "@/components/forms/TextField";
import { brandOptions, categoryForModName, modNameOptions } from "@/domain/catalog";
import { prankPartLine } from "@/domain/easterEggs";
import { TorqNote } from "@/components/mascot/TorqNote";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { CURRENCIES, minorDigits, type Currency } from "@/domain/money";
import { SPEC_UNITS, type SpecDeltas, type SpecField } from "@/domain/specs";
import { kindNoun, kindSpecFields, type VehicleKind } from "@/domain/vehicleKind";
import {
  buildSpecDeltas,
  fieldErrors,
  MOD_STATUSES,
  modFormSchema,
  type DeltaInputs,
  type ModCategoryId,
  type ModForm,
  type ModStatusId,
} from "@/domain/validation/build";
import { pickPhoto, type PreparedPhoto } from "@/services/media/photos";
import { COMPLIANCE_LABELS, complianceChoices } from "@/domain/record";
import type { Compliance, ModRow } from "@/services/supabase/database.types";
import { color, layout, radius, space } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export type ModFields = Record<
  | "name"
  | "category"
  | "brand"
  | "part_number"
  | "cost"
  | "currency"
  | "status"
  | "notes"
  | "installed_on"
  | "installed_by"
  | "installed_odometer"
  | "compliance"
  | "carb_eo"
  | "sets_motor_kw"
  | "sets_battery_v"
  | "sets_battery_wh",
  string
>;
export interface PendingPhoto {
  photo: PreparedPhoto;
  /** "receipt" files privately as the mod's receipt (D-68), the rest as build photos */
  role: "before" | "after" | "gallery" | "receipt";
}

/** register-photo keeps up to 4 receipts per item (D-61) */
const MAX_RECEIPTS = 4;

const DELTA_LABELS: Record<SpecField, string> = {
  hp: "Power",
  torque: "Torque",
  weight: "Weight",
  zero_to_sixty: "0–60",
};

export function fieldsFromMod(m: ModRow | null | undefined): ModFields {
  const cur = (m?.currency ?? "USD") as Currency;
  return {
    name: m?.name ?? "",
    category: m?.category ?? "",
    brand: m?.brand ?? "",
    part_number: m?.part_number ?? "",
    cost:
      m?.cost_minor === null || m?.cost_minor === undefined
        ? ""
        : (m.cost_minor / 10 ** minorDigits(cur)).toFixed(minorDigits(cur)),
    currency: cur,
    status: m?.status ?? "planned",
    notes: m?.notes ?? "",
    installed_on: m?.installed_on ?? "",
    installed_by: m?.installed_by ?? "",
    installed_odometer: m?.installed_odometer == null ? "" : String(m.installed_odometer),
    compliance: m?.compliance ?? "",
    carb_eo: m?.carb_eo ?? "",
    sets_motor_kw: m?.sets_motor_w == null ? "" : String(Number(m.sets_motor_w) / 1000),
    sets_battery_v: m?.sets_battery_v == null ? "" : String(m.sets_battery_v),
    sets_battery_wh: m?.sets_battery_wh == null ? "" : String(m.sets_battery_wh),
  };
}

export function deltasFromMod(m: ModRow | null | undefined): DeltaInputs {
  const d = (m?.spec_deltas ?? {}) as SpecDeltas;
  const out: DeltaInputs = {};
  for (const f of Object.keys(SPEC_UNITS) as SpecField[]) {
    const v = d[f];
    out[f] = { delta: v ? String(v.delta) : "", unit: v?.unit ?? SPEC_UNITS[f][0] };
  }
  return out;
}

/**
 * Add/Edit Mod in the spec's exact field order: name; category icon grid; brand and part number; cost;
 * status; photos; spec deltas; notes. Full-width Save pinned to the bottom, above the keyboard and
 * the home indicator. Input is never cleared on a failed save.
 */
export function ModFormView({
  fields,
  deltas,
  onFieldsChange,
  onDeltasChange,
  photos,
  onPhotosChange,
  photosNote,
  busy,
  error,
  submitLabel,
  onSubmit,
  header,
  kind = "car",
}: {
  /** D-71: the vehicle's kind decides the categories, names, brands and which spec changes apply */
  kind?: VehicleKind;
  fields: ModFields;
  deltas: DeltaInputs;
  onFieldsChange: (f: ModFields) => void;
  onDeltasChange: (d: DeltaInputs) => void;
  photos?: PendingPhoto[];
  onPhotosChange?: (p: PendingPhoto[]) => void;
  photosNote?: string;
  busy: boolean;
  error: ErrorKey | null;
  submitLabel: string;
  onSubmit: (form: ModForm, deltas: SpecDeltas) => void;
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState<ErrorKey | null>(null);
  const set = (k: keyof ModFields) => (v: string) => onFieldsChange({ ...fields, [k]: v });
  const prank = prankPartLine(fields.name);
  const [autoCat, setAutoCat] = useState(false);
  const setDelta = (f: SpecField, p: Partial<{ delta: string; unit: string }>) =>
    onDeltasChange({
      ...deltas,
      [f]: { delta: deltas[f]?.delta ?? "", unit: deltas[f]?.unit ?? SPEC_UNITS[f][0], ...p },
    });

  const submit = () => {
    const parsed = modFormSchema.safeParse(fields);
    const d = buildSpecDeltas(deltas);
    const errs = {
      ...(parsed.success ? {} : fieldErrors(parsed.error)),
      ...(d.ok ? {} : Object.fromEntries(Object.entries(d.errors).map(([k, v]) => [`delta_${k}`, v]))),
    };
    setErrors(errs);
    if (!parsed.success || !d.ok) return;
    onSubmit(parsed.data, d.value);
  };

  const addPhoto = async (role: PendingPhoto["role"], source: "camera" | "library") => {
    setPhotoError(null);
    const r = await pickPhoto(source);
    if (!r.ok) return setPhotoError(r.error.key);
    if (r.data && onPhotosChange) onPhotosChange([...(photos ?? []), { photo: r.data, role }]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {/* 1. name: pick a common mod (fills the category too) or type your own */}
        <SelectField
          label="Name"
          required
          value={fields.name}
          options={modNameOptions((fields.category || null) as ModCategoryId | null, kind)}
          onChange={(v) => {
            // what's being modded decides the category ("BC coilovers" -> Suspension); tap another to change it
            const cat = categoryForModName(v, kind);
            setAutoCat(Boolean(cat));
            onFieldsChange({ ...fields, name: v.slice(0, 120), category: cat || fields.category || "" });
          }}
          placeholder="Choose or type a mod"
          searchPlaceholder="Search mods, or type your own"
          error={errors.name}
        />
        {/* easter egg: garage pranks ("blinker fluid") get a word from Torq; saving still works */}
        {prank ? <TorqNote text={prank} /> : null}
        {/* 2. category icon grid */}
        <CategoryGrid
          value={(fields.category || null) as ModCategoryId | null}
          onChange={(c) => {
            setAutoCat(false);
            set("category")(c);
          }}
          error={errors.category}
          kind={kind}
        />
        {autoCat && fields.category ? (
          <Text variant="caption" muted>
            Picked from the mod name. Tap another category to change it.
          </Text>
        ) : null}
        {/* 3. brand and part number */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <SelectField
              label="Brand"
              value={fields.brand}
              options={brandOptions((fields.category || null) as ModCategoryId | null, kind)}
              onChange={(v) => set("brand")(v.slice(0, 80))}
              placeholder="Optional"
              searchPlaceholder="Search brands, or type your own"
              error={errors.brand}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Part number"
              value={fields.part_number}
              onChangeText={set("part_number")}
              maxLength={80}
              autoCapitalize="characters"
              error={errors.part_number}
            />
          </View>
        </View>
        {/* 4. cost */}
        <View style={{ gap: space.xs }}>
          <TextField
            label={`Cost (${fields.currency})`}
            value={fields.cost}
            onChangeText={set("cost")}
            keyboardType="decimal-pad"
            hint="Optional. Private unless you choose to share costs."
            error={errors.cost}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            accessibilityLabel="Currency"
          >
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={fields.currency === c} onPress={() => set("currency")(c)} />
            ))}
          </ScrollView>
        </View>
        {/* 5. status (+ install date) */}
        <View style={{ gap: space.xs }}>
          <Text variant="label">
            Status
            <Text variant="label" muted>
              {" "}
              (required)
            </Text>
          </Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Status">
            {MOD_STATUSES.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                selected={fields.status === s.id}
                onPress={() => set("status")(s.id as ModStatusId)}
              />
            ))}
          </View>
          <Text variant="caption" muted>
            Only Complete mods change the spec estimates. Spent = Complete + In Progress; Planned is tracked separately.
          </Text>
          <DateField
            label="Install date"
            value={fields.installed_on}
            onChange={set("installed_on")}
            min="1950-01-01"
            max={`${new Date().getFullYear() + 1}-12-31`}
            hint="Optional"
            error={errors.installed_on}
          />
          <TextField
            label="Mileage when fitted (optional)"
            value={fields.installed_odometer}
            onChangeText={set("installed_odometer")}
            keyboardType="number-pad"
            maxLength={9}
            hint={`Goes on your Build Record, so a buyer sees when in the ${kindNoun(kind)}'s life it went on.`}
            error={errors.installed_odometer}
          />
          <TextField
            label="Fitted by (optional)"
            value={fields.installed_by}
            onChangeText={set("installed_by")}
            maxLength={80}
            placeholder="Self, or the shop's name"
            hint="Private. Goes on your insurance mod list."
            error={errors.installed_by}
          />
          <EmissionsStatus
            category={(fields.category || null) as ModCategoryId | null}
            compliance={fields.compliance}
            carbEo={fields.carb_eo}
            onChange={(compliance, carb_eo) => onFieldsChange({ ...fields, compliance, carb_eo })}
            error={errors.carb_eo}
          />
        </View>
        {/* 6. photos */}
        <View style={{ gap: space.xs }}>
          <Text variant="label">Photos</Text>
          {photos && onPhotosChange ? (
            <>
              <View style={styles.thumbs}>
                {photos.map((p, i) => (
                  <View key={`${p.photo.uri}-${i}`} style={{ gap: space.xxs }}>
                    <Image
                      source={{ uri: p.photo.uri }}
                      style={styles.thumb}
                      accessible
                      accessibilityLabel={`${p.role} photo`}
                      alt={`${p.role} photo`}
                    />
                    <Text variant="caption">
                      {p.role === "before"
                        ? "Before"
                        : p.role === "after"
                          ? "After"
                          : p.role === "receipt"
                            ? "Receipt"
                            : "Photo"}
                    </Text>
                    <Button
                      title="Remove"
                      variant="secondary"
                      onPress={() => onPhotosChange(photos.filter((_, j) => j !== i))}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.chips}>
                <Button title="Before photo" variant="secondary" onPress={() => void addPhoto("before", "library")} />
                <Button title="After photo" variant="secondary" onPress={() => void addPhoto("after", "library")} />
                <Button title="Camera" variant="secondary" onPress={() => void addPhoto("gallery", "camera")} />
              </View>
              {/* D-68: the receipt goes in with the mod, so it lands on the record as "Paperwork on file" */}
              <Text variant="label">Receipt</Text>
              <Text variant="caption" muted>
                Private, never on your public build. On your Build Record it shows as paperwork on file.
              </Text>
              {photos.filter((p) => p.role === "receipt").length < MAX_RECEIPTS ? (
                <View style={styles.chips}>
                  <Button title="Snap receipt" variant="secondary" onPress={() => void addPhoto("receipt", "camera")} />
                  <Button
                    title="Choose receipt"
                    variant="secondary"
                    onPress={() => void addPhoto("receipt", "library")}
                  />
                </View>
              ) : null}
              {photoError ? <InlineError kind={photoError} /> : null}
            </>
          ) : null}
          {photosNote ? (
            <Text variant="caption" muted>
              {photosNote}
            </Text>
          ) : null}
        </View>
        {/* D-74: an e-moto controller or battery replaces the numbers instead of adding to them */}
        {kind === "ebike" && (fields.category === "motor" || fields.category === "battery") ? (
          <View style={styles.section}>
            <Text variant="label">After this mod (optional)</Text>
            <Text variant="caption" muted>
              {fields.category === "motor"
                ? "The peak power it makes now. Once the mod is Complete, the e-moto's numbers show it, with stock kept beside it."
                : "The pack it runs now. Once the mod is Complete, the e-moto's numbers show it, with stock kept beside it."}
            </Text>
            {fields.category === "motor" ? (
              <TextField
                label="Peak power (kW)"
                value={fields.sets_motor_kw}
                onChangeText={set("sets_motor_kw")}
                keyboardType="decimal-pad"
                maxLength={6}
                error={errors.sets_motor_kw}
              />
            ) : (
              <View style={styles.deltaRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Battery (V)"
                    value={fields.sets_battery_v}
                    onChangeText={set("sets_battery_v")}
                    keyboardType="number-pad"
                    maxLength={3}
                    error={errors.sets_battery_v}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Battery (Wh)"
                    value={fields.sets_battery_wh}
                    onChangeText={set("sets_battery_wh")}
                    keyboardType="number-pad"
                    maxLength={5}
                    error={errors.sets_battery_wh}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}
        {/* 7. spec deltas */}
        <View style={styles.section}>
          <Text variant="label">Spec changes (optional)</Text>
          <Text variant="caption" muted>
            What this mod changed, by your own numbers. Use minus for less (e.g. -15 lb). Counted only once the mod is
            Complete.
          </Text>
          {(kindSpecFields(kind) as readonly SpecField[]).map((f) => (
            <View key={f} style={styles.deltaRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={DELTA_LABELS[f]}
                  value={deltas[f]?.delta ?? ""}
                  onChangeText={(t) => setDelta(f, { delta: t })}
                  keyboardType="numbers-and-punctuation"
                  error={errors[`delta_${f}`]}
                />
              </View>
              <View
                style={[styles.chips, { paddingTop: space.lg }]}
                accessibilityRole="radiogroup"
                accessibilityLabel={`${DELTA_LABELS[f]} unit`}
              >
                {SPEC_UNITS[f].map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    selected={(deltas[f]?.unit ?? SPEC_UNITS[f][0]) === u}
                    onPress={() => setDelta(f, { unit: u })}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
        {/* 8. notes */}
        <TextField
          label="Notes"
          value={fields.notes}
          onChangeText={set("notes")}
          maxLength={4000}
          multiline
          hint="Optional"
          error={errors.notes}
        />
        {error ? <InlineError kind={error} /> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        {/* the marked fields can be scrolled far out of sight, so a failed save says so beside the button */}
        {Object.keys(errors).length ? <FieldError message={fixFieldsText(Object.keys(errors).length)} /> : null}
        <Button title={submitLabel} loading={busy} onPress={submit} fullWidth />
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * D-64: for parts that can touch emissions, how this one stands. It goes on the Build Record, and shops are only
 * asked to confirm emissions work that has a CARB EO number (or put the factory part back).
 */
function EmissionsStatus({
  category,
  compliance,
  carbEo,
  onChange,
  error,
}: {
  category: ModCategoryId | null;
  compliance: string;
  carbEo: string;
  onChange: (compliance: string, carbEo: string) => void;
  error?: string;
}) {
  const choices = category ? complianceChoices(category) : [];
  if (choices.length === 0) return null;
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">Emissions status (optional)</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Emissions status">
        {choices.map((c: Compliance) => (
          <Chip
            key={c}
            label={COMPLIANCE_LABELS[c]}
            selected={compliance === c}
            onPress={() => onChange(compliance === c ? "" : c, c === "carb_eo" ? carbEo : "")}
          />
        ))}
      </View>
      {compliance === "carb_eo" ? (
        <TextField
          label="CARB EO number"
          value={carbEo}
          onChangeText={(t) => onChange(compliance, t)}
          maxLength={20}
          autoCapitalize="characters"
          placeholder="D-142-44"
          hint="On the part, its box or the maker's site. Shown on your Build Record."
          error={error}
        />
      ) : (
        <Text variant="caption" muted>
          Shows on your Build Record. Shops are only asked to confirm emissions work with a CARB EO number.
        </Text>
      )}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    scroll: {
      padding: layout.screenGutter,
      gap: space.lg,
      paddingBottom: space.huge,
      maxWidth: layout.maxContentWidth,
      width: "100%",
      alignSelf: "center",
    },
    row: { flexDirection: "row", gap: space.sm },
    chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
    thumbs: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
    thumb: { width: 96, height: 72, borderRadius: radius.sm, backgroundColor: color.surface },
    section: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.border },
    deltaRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", flexWrap: "wrap" },
    footer: {
      paddingHorizontal: layout.screenGutter,
      paddingTop: space.sm,
      backgroundColor: color.background,
      borderTopWidth: 1,
      borderTopColor: color.surface,
    },
  }),
);
