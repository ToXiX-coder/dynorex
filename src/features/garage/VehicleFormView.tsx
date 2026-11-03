import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError } from "@/components/feedback/Inline";
import { YearField } from "@/components/forms/PickerFields";
import { SelectField } from "@/components/forms/SelectField";
import { FieldError, TextField, fixFieldsText } from "@/components/forms/TextField";
import { makeOptions } from "@/domain/catalog";
import { catalogModels } from "@/domain/modelCatalog";
import { config } from "@/services/config";
import {
  EBIKE_MAKES,
  MOTORCYCLE_MAKES,
  starterLabel,
  starterModels,
  starterSpec,
  starterSummary,
  type Fig,
} from "@/domain/twoWheelCatalog";
import { hasVin, kindNoun, kindOf, usesNhtsa, VEHICLE_KINDS, type VehicleKind } from "@/domain/vehicleKind";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { fieldErrors, vehicleForKind, vehicleFormSchema, type VehicleForm } from "@/domain/validation/build";
import { buildService, type StockLookup } from "@/features/garage/buildService";
import { isVinShape, normalizeVin } from "@/domain/record";
import { decodeVin, nhtsa, type NhtsaMake, type NhtsaModel } from "@/services/nhtsa";
import type { VehicleRow } from "@/services/supabase/database.types";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { themed } from "@/theme/themed";

export type VehicleSubmit = VehicleForm & {
  data_source: "manual" | "nhtsa";
  nhtsa_make_id: number | null;
  nhtsa_model_id: number | null;
};

type Fields = Record<
  | "year"
  | "make"
  | "model"
  | "trim_level"
  | "nickname"
  | "vin"
  | "odometer"
  | "description"
  | "baseline_hp"
  | "baseline_torque_lbft"
  | "baseline_weight_lb"
  | "baseline_zero_to_sixty_s"
  | "motor_w"
  | "battery_wh"
  | "range_mi"
  | "top_speed_mph",
  string
>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** a stock number shows in its box only if the owner typed it; factory figures show as placeholders instead */
const own = (row: VehicleRow | null | undefined, k: string) =>
  row && row.baseline_looked_up?.includes(k) ? "" : str((row as Record<string, unknown> | null | undefined)?.[k]);

/**
 * Add/Edit vehicle. Year, make and model are dropdowns (makes and models from NHTSA, popular makes first), but
 * typing anything works: the lookup only helps and is never required. The VIN stays private; it goes to NHTSA's public
 * decoder only when the owner taps "Fill in from VIN" (D-68).
 * Stock numbers left blank are filled from factory specs (shown as placeholders here, filled by the database).
 * D-71: a car, motorcycle or e-bike. Motorcycles get their own makes, NHTSA's motorcycle models and the starter list's
 * stock numbers; e-bikes get brands, their own numbers (motor, battery, range, top speed) and no VIN.
 */
export function VehicleFormView({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  children,
}: {
  initial?: VehicleRow | null;
  submitLabel: string;
  busy: boolean;
  error: ErrorKey | null;
  onSubmit: (v: VehicleSubmit) => void;
  children?: React.ReactNode;
}) {
  const [f, setF] = useState<Fields>(() => ({
    year: str(initial?.year),
    make: str(initial?.make),
    model: str(initial?.model),
    trim_level: str(initial?.trim_level),
    nickname: str(initial?.nickname),
    vin: str(initial?.vin),
    odometer: str(initial?.odometer),
    description: str(initial?.description),
    baseline_hp: own(initial, "baseline_hp"),
    baseline_torque_lbft: own(initial, "baseline_torque_lbft"),
    baseline_weight_lb: own(initial, "baseline_weight_lb"),
    baseline_zero_to_sixty_s: own(initial, "baseline_zero_to_sixty_s"),
    motor_w: str(initial?.motor_w),
    battery_wh: str(initial?.battery_wh),
    range_mi: str(initial?.range_mi),
    top_speed_mph: str(initial?.top_speed_mph),
  }));
  const [kind, setKind] = useState<VehicleKind>(() => kindOf(initial));
  const [unit, setUnit] = useState<"mi" | "km">(initial?.odometer_unit ?? "mi");
  const [visibility, setVisibility] = useState<"private" | "public">(
    initial?.visibility === "public" ? "public" : "private",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [makes, setMakes] = useState<NhtsaMake[] | null>(null);
  const [lookupDown, setLookupDown] = useState(false);
  const [pickedMake, setPickedMake] = useState<NhtsaMake | null>(
    initial?.nhtsa_make_id ? { id: initial.nhtsa_make_id, name: initial.make } : null,
  );
  const [modelsFor, setModels] = useState<{ key: string; items: NhtsaModel[] }>({ key: "", items: [] });
  const [pickedModel, setPickedModel] = useState<NhtsaModel | null>(
    initial?.nhtsa_model_id ? { id: initial.nhtsa_model_id, name: initial.model } : null,
  );

  const set = (k: keyof Fields) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  // D-68: year, make, model and trim from the VIN, only when the owner taps for it
  const [decoding, setDecoding] = useState(false);
  const [vinNote, setVinNote] = useState<string | null>(null);
  const fillFromVin = async () => {
    setDecoding(true);
    const r = await decodeVin(normalizeVin(f.vin));
    setDecoding(false);
    if (!r.ok) return setVinNote("NHTSA's decoder didn't answer. Check your connection, or pick the car below.");
    if (!r.car) return setVinNote("NHTSA couldn't decode that VIN. Check it against the car, or pick the car below.");
    const car = r.car;
    const hit = makes?.find((m) => m.name.toLowerCase() === car.make.toLowerCase()) ?? null;
    setF((x) => ({
      ...x,
      year: String(car.year),
      make: hit?.name ?? car.make,
      model: car.model,
      trim_level: x.trim_level.trim() ? x.trim_level : (car.trim ?? "").slice(0, 50),
    }));
    setPickedMake(hit);
    setPickedModel(null);
    setVinNote(
      `Filled from NHTSA: ${[car.year, car.make, car.model, car.trim].filter(Boolean).join(" ")}. Check it matches your car.`,
    );
  };

  useEffect(() => {
    let alive = true;
    void nhtsa.makes().then((r) => {
      if (!alive) return;
      if (r.ok) setMakes(r.items);
      else setLookupDown(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // the models that make built that year: by NHTSA id when the make came from its list, else by name
  const year = Number(f.year);
  const makeName = f.make.trim();
  const [openModel, setOpenModel] = useState(0);
  const modelKey = makeName && /^\d{4}$/.test(f.year) ? `${kind}|${f.year}|${makeName.toLowerCase()}` : "";
  useEffect(() => {
    // NHTSA lists cars and motorcycles; e-bikes come from the starter list only
    if (!modelKey || !usesNhtsa(kind)) return;
    let alive = true;
    const load =
      kind === "motorcycle"
        ? nhtsa.modelsByName(makeName, year, "motorcycle")
        : pickedMake
          ? nhtsa.models(pickedMake.id, year)
          : nhtsa.modelsByName(makeName, year);
    void load.then(async (r) => {
      // an id lookup that comes back empty gets one more try by name
      const res =
        r.ok && r.items.length === 0 && pickedMake && kind === "car" ? await nhtsa.modelsByName(makeName, year) : r;
      if (alive) setModels({ key: modelKey, items: res.ok ? res.items : [] });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- modelKey covers kind, year and make
  }, [modelKey, pickedMake]);
  // a list for another year or make never shows
  const models = useMemo(() => (modelsFor.key === modelKey ? modelsFor.items : []), [modelsFor, modelKey]);
  // the shipped catalog shows at once, even offline; live NHTSA names join it when they arrive. Two-wheelers use
  // the starter list (the shipped catalog is EPA car data)
  const shipped = useMemo(
    () => (!modelKey ? [] : kind === "car" ? catalogModels(makeName, year) : starterModels(kind, makeName)),
    [modelKey, makeName, year, kind],
  );
  const modelNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of [...shipped, ...models.map((m) => m.name)]) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [shipped, models]);
  const modelsLoading = Boolean(modelKey) && usesNhtsa(kind) && modelsFor.key !== modelKey && shipped.length === 0;

  // factory stock specs for the car as typed: they fill any stock number left blank (D-55). Cars only: the
  // factory table knows nothing else
  const [factory, setFactory] = useState<{ key: string; spec: StockLookup }>({ key: "", spec: null });
  const carKey =
    kind === "car" && /^\d{4}$/.test(f.year) && f.make.trim() && f.model.trim()
      ? `${f.year}|${f.make}|${f.model}|${f.trim_level}`
      : "";
  // D-71: a motorcycle or e-bike from the starter list fills blanks the same way, but in the app (see submit)
  const starter = kind === "car" ? null : starterSpec(kind, f.make, f.model);
  const moto = starter?.kind === "motorcycle" ? starter : null;
  const ebike = starter?.kind === "ebike" ? starter : null;
  useEffect(() => {
    if (!carKey) return;
    let alive = true;
    const t = setTimeout(async () => {
      const r = await buildService.lookupStockSpecs({
        year: Number(f.year),
        make: f.make.trim(),
        model: f.model.trim(),
        trim: f.trim_level.trim() || null,
      });
      if (alive) setFactory({ key: carKey, spec: r.ok ? r.data : null });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carKey covers year/make/model/trim
  }, [carKey]);
  const spec = factory.key === carKey ? factory.spec : null;
  const looked = factory.key === carKey && Boolean(carKey);
  const ph = (v: number | null | undefined, decimals = 0) =>
    spec && v !== null && v !== undefined ? `${v.toFixed(decimals)} factory` : undefined;
  /** a starter-list figure as a placeholder; estimated ones say so */
  const phFig = (v: Fig | null | undefined, decimals = 0) =>
    v ? `${v.v.toFixed(decimals)} ${v.est ? "estimate" : "stock"}` : undefined;

  const makeList = useMemo(
    () =>
      kind === "car"
        ? makeOptions(makes)
        : (kind === "motorcycle" ? MOTORCYCLE_MAKES : EBIKE_MAKES).map((m) => ({ value: m, label: m })),
    [makes, kind],
  );
  const modelList = useMemo(() => modelNames.map((n) => ({ value: n, label: n })), [modelNames]);

  const submit = () => {
    const parsed = vehicleFormSchema.safeParse({ ...f, odometer_unit: unit, visibility, kind });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const data = vehicleForKind(parsed.data);
    // blanks take the starter list's stock numbers, as a car's take the factory table's
    const fill = <T,>(own: T | null | undefined, fig: Fig | null | undefined) => own ?? (fig ? fig.v : null);
    if (moto) {
      data.baseline_hp = fill(data.baseline_hp, moto.hp);
      data.baseline_torque_lbft = fill(data.baseline_torque_lbft, moto.torque_lbft);
      data.baseline_weight_lb = fill(data.baseline_weight_lb, moto.weight_lb);
      data.baseline_zero_to_sixty_s = fill(data.baseline_zero_to_sixty_s, moto.zero_to_sixty_s);
    }
    if (ebike) {
      data.motor_w = fill(data.motor_w, ebike.motor_w);
      data.battery_wh = fill(data.battery_wh, ebike.battery_wh);
      data.range_mi = fill(data.range_mi, ebike.range_mi);
      data.top_speed_mph = fill(data.top_speed_mph, ebike.top_speed_mph);
      data.baseline_weight_lb = fill(data.baseline_weight_lb, ebike.weight_lb);
    }
    const fromNhtsa = kind === "car" && Boolean(pickedMake && pickedMake.name === parsed.data.make);
    onSubmit({
      ...data,
      data_source: fromNhtsa ? "nhtsa" : "manual",
      nhtsa_make_id: fromNhtsa ? pickedMake!.id : null,
      nhtsa_model_id: fromNhtsa && pickedModel && pickedModel.name === parsed.data.model ? pickedModel.id : null,
    });
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="label">What is it?</Text>
        <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Vehicle type">
          {VEHICLE_KINDS.map((k) => (
            <Chip
              key={k.id}
              label={k.label}
              selected={kind === k.id}
              onPress={() => {
                if (k.id === kind) return;
                setKind(k.id);
                // another kind's make list: keep what was typed, but drop NHTSA's car ids
                setPickedMake(null);
                setPickedModel(null);
                setErrors({});
              }}
            />
          ))}
        </View>
      </View>
      <YearField
        label="Year"
        required
        value={f.year}
        onChange={set("year")}
        min={1886}
        max={new Date().getFullYear() + 1}
        start={new Date().getFullYear() - 10}
        error={errors.year}
      />
      <SelectField
        label={kind === "ebike" ? "Brand" : "Make"}
        required
        value={f.make}
        options={makeList}
        onChange={(v) => {
          const hit =
            kind === "car" ? (makes?.find((m) => m.name.toLowerCase() === v.toLowerCase()) ?? null) : null;
          set("make")(v.slice(0, 50));
          setPickedMake(hit);
          if (v !== f.make) {
            set("model")("");
            setPickedModel(null);
            // straight on to the model list once there's a year to look it up by
            if (/^\d{4}$/.test(f.year)) setOpenModel((n) => n + 1);
          }
        }}
        placeholder={kind === "ebike" ? "Choose brand" : "Choose make"}
        searchPlaceholder={kind === "ebike" ? "Search brands, or type your own" : "Search makes, or type your own"}
        hint={
          // the pitch page can never reach NHTSA, so there the popular list is simply the list
          lookupDown && !config.demoMode && kind === "car"
            ? "Full make list unavailable right now. Popular makes are listed; you can type any make."
            : null
        }
        error={errors.make}
      />
      <SelectField
        label="Model"
        required
        value={f.model}
        options={modelList}
        onChange={(v) => {
          set("model")(v.slice(0, 50));
          setPickedModel(models.find((m) => m.name.toLowerCase() === v.toLowerCase()) ?? null);
        }}
        placeholder="Choose model"
        searchPlaceholder="Search models, or type your own"
        openSignal={openModel}
        emptyText={
          makeName && /^\d{4}$/.test(f.year)
            ? modelsLoading
              ? `Loading ${makeName} models for ${f.year}…`
              : kind === "ebike"
                ? `No ${makeName} models listed. Type yours above.`
                : `No ${f.year} ${makeName} models listed. Type yours above.`
            : `Pick a year and ${kind === "ebike" ? "brand" : "make"} first, or type your model.`
        }
        hint={
          modelKey && modelNames.length
            ? kind === "ebike"
              ? `${modelNames.length} ${makeName} ${modelNames.length === 1 ? "model" : "models"} in the starter list`
              : `${modelNames.length} ${f.year} ${makeName} ${modelNames.length === 1 ? "model" : "models"}`
            : null
        }
        error={errors.model}
      />
      <TextField
        label="Trim"
        value={f.trim_level}
        onChangeText={set("trim_level")}
        maxLength={50}
        hint="Optional"
        error={errors.trim_level}
      />
      <TextField
        label="Build name"
        value={f.nickname}
        onChangeText={set("nickname")}
        maxLength={60}
        hint="Optional"
        error={errors.nickname}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Odometer"
            value={f.odometer}
            onChangeText={set("odometer")}
            keyboardType="number-pad"
            hint="Optional"
            error={errors.odometer}
          />
        </View>
        <View style={styles.units} accessibilityRole="radiogroup" accessibilityLabel="Odometer units">
          <Chip label="mi" selected={unit === "mi"} onPress={() => setUnit("mi")} />
          <Chip label="km" selected={unit === "km"} onPress={() => setUnit("km")} />
        </View>
      </View>
      {/* e-bikes have a frame serial, not a VIN: keep it in Notes if you want it on record */}
      {hasVin(kind) ? (
        <TextField
          label="VIN"
          value={f.vin}
          onChangeText={(t) => {
            set("vin")(t.toUpperCase());
            setVinNote(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={17}
          hint="Optional and private. Never shown on public pages or shared. Fill in from VIN asks NHTSA's free public decoder, from your phone."
          error={errors.vin}
        />
      ) : null}
      {hasVin(kind) && isVinShape(f.vin) ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            title="Fill in from VIN"
            variant="secondary"
            loading={decoding}
            accessibilityLabel="Fill in the year, make, model and trim from the VIN"
            onPress={() => void fillFromVin()}
          />
        </View>
      ) : null}
      {vinNote ? <Text variant="caption">{vinNote}</Text> : null}
      <TextField
        label="Notes"
        value={f.description}
        onChangeText={set("description")}
        maxLength={2000}
        multiline
        hint="Optional"
        error={errors.description}
      />
      <View style={styles.section}>
        <Text variant="title" accessibilityRole="header">
          Stock numbers
        </Text>
        {spec ? (
          <View style={styles.factory} accessibilityLiveRegion="polite">
            <Text variant="bodyStrong">{`Factory specs found: ${spec.label}`}</Text>
            <Text variant="caption" muted>
              {`${spec.hp} hp · ${spec.torque_lbft} lb-ft${spec.weight_lb ? ` · ${spec.weight_lb.toLocaleString()} lb` : ""}${spec.zero_to_sixty_s ? ` · 0–60 ${spec.zero_to_sixty_s.toFixed(1)} s` : ""}. Any box you leave blank uses these. Type your own if your car differs.`}
            </Text>
          </View>
        ) : starter ? (
          <View style={styles.factory} accessibilityLiveRegion="polite">
            <Text variant="bodyStrong">{`Stock specs found: ${starterLabel(starter)}`}</Text>
            <Text variant="caption" muted>
              {`${starterSummary(starter)}. Any box you leave blank uses these. Type your own if yours differs.`}
            </Text>
          </View>
        ) : (
          <Text variant="caption" muted>
            {kind !== "car"
              ? f.model.trim()
                ? `No stock specs on file for this ${kindNoun(kind)} yet. Add your own numbers, or leave blank.`
                : `Pick a model from the list and we will fill in its stock numbers. Your own numbers always win.`
              : looked
                ? "No factory specs on file for this car yet. Add your own numbers to get estimates, or leave blank."
                : "Pick the year, make and model and we will fill in the factory numbers. Your own numbers always win."}
          </Text>
        )}
        {kind === "ebike" ? (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Motor (W)"
                  value={f.motor_w}
                  onChangeText={set("motor_w")}
                  placeholder={phFig(ebike?.motor_w)}
                  keyboardType="number-pad"
                  error={errors.motor_w}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Battery (Wh)"
                  value={f.battery_wh}
                  onChangeText={set("battery_wh")}
                  placeholder={phFig(ebike?.battery_wh)}
                  keyboardType="number-pad"
                  error={errors.battery_wh}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Range (mi)"
                  value={f.range_mi}
                  onChangeText={set("range_mi")}
                  placeholder={phFig(ebike?.range_mi)}
                  keyboardType="decimal-pad"
                  error={errors.range_mi}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Top speed (mph)"
                  value={f.top_speed_mph}
                  onChangeText={set("top_speed_mph")}
                  placeholder={phFig(ebike?.top_speed_mph)}
                  keyboardType="decimal-pad"
                  error={errors.top_speed_mph}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Weight (lb)"
                  value={f.baseline_weight_lb}
                  onChangeText={set("baseline_weight_lb")}
                  placeholder={phFig(ebike?.weight_lb)}
                  keyboardType="decimal-pad"
                  error={errors.baseline_weight_lb}
                />
              </View>
              <View style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Power (hp)"
                  value={f.baseline_hp}
                  onChangeText={set("baseline_hp")}
                  placeholder={ph(spec?.hp) ?? phFig(moto?.hp)}
                  keyboardType="decimal-pad"
                  error={errors.baseline_hp}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Torque (lb-ft)"
                  value={f.baseline_torque_lbft}
                  onChangeText={set("baseline_torque_lbft")}
                  placeholder={ph(spec?.torque_lbft) ?? phFig(moto?.torque_lbft)}
                  keyboardType="decimal-pad"
                  error={errors.baseline_torque_lbft}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Weight (lb)"
                  value={f.baseline_weight_lb}
                  onChangeText={set("baseline_weight_lb")}
                  placeholder={ph(spec?.weight_lb) ?? phFig(moto?.weight_lb)}
                  keyboardType="decimal-pad"
                  error={errors.baseline_weight_lb}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="0–60 (s)"
                  value={f.baseline_zero_to_sixty_s}
                  onChangeText={set("baseline_zero_to_sixty_s")}
                  placeholder={ph(spec?.zero_to_sixty_s, 1) ?? phFig(moto?.zero_to_sixty_s, 1)}
                  keyboardType="decimal-pad"
                  error={errors.baseline_zero_to_sixty_s}
                />
              </View>
            </View>
          </>
        )}
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="label">Who can see it</Text>
        <View style={styles.units} accessibilityRole="radiogroup" accessibilityLabel="Visibility">
          <Chip label="Private" selected={visibility === "private"} onPress={() => setVisibility("private")} />
          <Chip label="Public" selected={visibility === "public"} onPress={() => setVisibility("public")} />
        </View>
        <Text variant="caption" muted>
          {visibility === "public"
            ? "Anyone can see this vehicle (never the VIN). Needs a verified email."
            : "Only you can see it."}
        </Text>
      </View>
      {children}
      {error ? <InlineError kind={error} /> : null}
      {/* the marked fields can be scrolled far out of sight, so a failed save says so beside the button */}
      {Object.keys(errors).length ? <FieldError message={fixFieldsText(Object.keys(errors).length)} /> : null}
      <Button title={submitLabel} loading={busy} onPress={submit} fullWidth />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
    kinds: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
    units: { flexDirection: "row", gap: space.sm, paddingTop: space.lg },
    suggest: {
      backgroundColor: color.surface,
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderColor: color.border,
    },
    suggestRow: { minHeight: touch.min, justifyContent: "center", paddingHorizontal: space.md },
    factory: {
      gap: space.xxs,
      padding: space.sm,
      borderRadius: radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: color.accent,
      backgroundColor: color.surface,
    },
    section: {
      gap: space.sm,
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: border.hairline,
      borderColor: color.border,
    },
  }),
);
