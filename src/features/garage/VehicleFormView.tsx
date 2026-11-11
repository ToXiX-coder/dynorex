import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { CheckIcon } from "@/components/icons";
import { YearField } from "@/components/forms/PickerFields";
import { Segmented } from "@/components/forms/Segmented";
import { SelectField } from "@/components/forms/SelectField";
import { VehicleArt } from "@/components/vehicle/VehicleArt";
import { FieldError, TextField, fixFieldsText } from "@/components/forms/TextField";
import { makeOptions } from "@/domain/catalog";
import { catalogModels } from "@/domain/modelCatalog";
import { config } from "@/services/config";
import {
  EBIKE_MAKES,
  ROAD_USE,
  MOTORCYCLE_MAKES,
  starterLabel,
  starterModels,
  starterSpec,
  starterSummary,
  type Fig,
} from "@/domain/twoWheelCatalog";
import {
  hasVin,
  kindDetail,
  kindLabel,
  kindNoun,
  kindOf,
  usesNhtsa,
  VEHICLE_KINDS,
  type VehicleKind,
} from "@/domain/vehicleKind";
import { Text } from "@/components/Text";
import type { ErrorKey } from "@/domain/copy/errors";
import { fieldErrors, vehicleForKind, vehicleFormSchema, type VehicleForm } from "@/domain/validation/build";
import { buildService, type StockLookup } from "@/features/garage/buildService";
import { isVinShape, normalizeVin } from "@/domain/record";
import { decodeVin, nhtsa, type NhtsaMake, type NhtsaModel } from "@/services/nhtsa";
import type { VehicleRow } from "@/services/supabase/database.types";
import { color, radius, space } from "@/theme/tokens";
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
  | "top_speed_mph"
  | "engine_cc"
  | "frame_serial"
  | "motor_kw"
  | "battery_v",
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
    engine_cc: str(initial?.engine_cc),
    frame_serial: str(initial?.frame_serial),
    // D-73: e-moto peak power is entered in kW (stored in watts), plus the pack voltage
    motor_kw: initial?.motor_w ? String(Number(initial.motor_w) / 1000) : "",
    battery_v: str(initial?.battery_v),
  }));
  const [kind, setKind] = useState<VehicleKind>(() => kindOf(initial));
  const [road, setRoad] = useState<"street" | "offroad" | null>(() =>
    initial?.street_legal === true ? "street" : initial?.street_legal === false ? "offroad" : null,
  );
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
    // kW in the form, watts in the data (a typo that isn't a number stays text, so it's flagged, not dropped)
    const kw = f.motor_kw.trim().replace(",", ".");
    const motorW = kw === "" ? "" : Number.isFinite(Number(kw)) ? String(Math.round(Number(kw) * 1000)) : kw;
    const parsed = vehicleFormSchema.safeParse({
      ...f,
      motor_w: motorW,
      street_legal: road === null ? null : road === "street",
      odometer_unit: unit,
      visibility,
      kind,
    });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      if (errs.motor_w) errs.motor_kw = "Peak power: a number of kW, up to 100";
      return setErrors(errs);
    }
    setErrors({});
    const data = vehicleForKind(parsed.data);
    // blanks take the starter list's stock numbers, as a car's take the factory table's
    const fill = <T,>(own: T | null | undefined, fig: Fig | null | undefined) => own ?? (fig ? fig.v : null);
    if (moto) {
      data.engine_cc = fill(data.engine_cc, moto.engine_cc);
      data.baseline_hp = fill(data.baseline_hp, moto.hp);
      data.baseline_torque_lbft = fill(data.baseline_torque_lbft, moto.torque_lbft);
      data.baseline_weight_lb = fill(data.baseline_weight_lb, moto.weight_lb);
      data.baseline_zero_to_sixty_s = fill(data.baseline_zero_to_sixty_s, moto.zero_to_sixty_s);
    }
    if (ebike) {
      data.motor_w = fill(data.motor_w, ebike.motor_w);
      data.battery_v = fill(data.battery_v, ebike.battery_v);
      data.street_legal = data.street_legal ?? ebike.street_legal.v;
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

  const noun = kindNoun(kind);
  const named = f.nickname.trim() || [f.year, f.make.trim(), f.model.trim()].filter(Boolean).join(" ");
  const detail = kindDetail({
    kind,
    engine_cc: Number(f.engine_cc) || (moto?.engine_cc.v ?? null),
    motor_w: Number(f.motor_kw) ? Number(f.motor_kw) * 1000 : (ebike?.motor_w.v ?? null),
    battery_v: Number(f.battery_v) || (ebike?.battery_v.v ?? null),
  });
  const caption = [named ? kindLabel(kind) : null, detail].filter(Boolean).join(" · ");
  const roadShown = road ?? (ebike ? (ebike.street_legal.v ? "street" : "offroad") : null);
  return (
    <View style={styles.form}>
      {/* the build's own drawing, redrawn as it's described: the type, the model's shape, a colour named in the
          build name. It's the same art the garage shows until there's a photo */}
      <View style={styles.preview}>
        <VehicleArt
          kind={kind}
          make={f.make || " "}
          model={f.model || " "}
          year={/^\d{4}$/.test(f.year) ? Number(f.year) : null}
          seed={initial?.id ?? "new-vehicle"}
          hint={f.nickname}
          label={false}
          style={styles.art}
        />
        <View style={{ gap: 2 }}>
          <Text variant="heading" numberOfLines={2}>
            {named || `Your ${noun}`}
          </Text>
          {/* the type only once there's a name to put it beside (an empty form already says "Your e-bike") */}
          {caption ? (
            <Text variant="caption" muted>
              {caption}
            </Text>
          ) : null}
        </View>
      </View>
      <Segmented
        label="Vehicle type"
        options={VEHICLE_KINDS}
        value={kind}
        onChange={(k) => {
          if (k === kind) return;
          setKind(k);
          // another kind's make list: keep what was typed, but drop NHTSA's car ids
          setPickedMake(null);
          setPickedModel(null);
          setErrors({});
        }}
      />

      <View style={styles.section}>
        <Text variant="section" accessibilityRole="header">{`The ${noun}`}</Text>
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
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Trim"
            value={f.trim_level}
            onChangeText={set("trim_level")}
            maxLength={50}
            placeholder={kind === "car" ? "Premium" : kind === "motorcycle" ? "ABS" : "Street"}
            error={errors.trim_level}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Build name"
            value={f.nickname}
            onChangeText={set("nickname")}
            maxLength={60}
            placeholder={kind === "car" ? "Weekend Warrior" : kind === "motorcycle" ? "Canyon Carver" : "Trail Bee"}
            error={errors.nickname}
          />
        </View>
      </View>
      {kind === "motorcycle" ? (
        <TextField
          label="Engine size (cc)"
          value={f.engine_cc}
          onChangeText={set("engine_cc")}
          placeholder={phFig(moto?.engine_cc)}
          keyboardType="number-pad"
          maxLength={5}
          error={errors.engine_cc}
        />
      ) : null}
      {kind === "ebike" ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label">Road use</Text>
          <Segmented label="Road use" options={ROAD_USE} value={roadShown} onChange={setRoad} />
          <Text variant="caption" muted>
            {roadShown === "street"
              ? "Plated and insured for the road, with lights, mirrors and a horn."
              : roadShown === "offroad"
                ? "Trails and private land only. Most e-motos ship this way."
                : "Most e-motos are sold off-road only; some come plated, and some owners plate theirs."}
            {!road && ebike ? (ebike.street_legal.est ? " (our estimate for this model)" : " (as sold)") : ""}
          </Text>
        </View>
      ) : null}
      </View>

      <View style={styles.section}>
        <Text variant="section" accessibilityRole="header">
          Stock numbers
        </Text>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {spec || starter ? <CheckIcon color={color.accent} /> : null}
          <Text variant="caption" muted={!(spec || starter)} style={{ flex: 1 }}>
            {spec
              ? `From the factory: ${spec.label}. Blank boxes use these.`
              : starter
                ? `${starterLabel(starter)}: ${starterSummary(starter)}. Blank boxes use these.`
                : kind !== "car"
                  ? f.model.trim()
                    ? `Nothing on file for this ${noun} yet. Add your own, or leave them blank.`
                    : "Pick a model and its stock numbers fill in. Yours always win."
                  : looked
                    ? "Nothing on file for this car yet. Add your own, or leave them blank."
                    : "Pick the year, make and model and the factory numbers fill in. Yours always win."}
          </Text>
        </View>
        {kind === "ebike" ? (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Peak power (kW)"
                  value={f.motor_kw}
                  onChangeText={set("motor_kw")}
                  placeholder={phFig(ebike ? { ...ebike.motor_w, v: ebike.motor_w.v / 1000 } : null, 1)}
                  keyboardType="decimal-pad"
                  error={errors.motor_kw}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Battery (V)"
                  value={f.battery_v}
                  onChangeText={set("battery_v")}
                  placeholder={phFig(ebike?.battery_v)}
                  keyboardType="number-pad"
                  maxLength={3}
                  error={errors.battery_v}
                />
              </View>
            </View>
            <View style={styles.row}>
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
      <View style={styles.section}>
        <Text variant="section" accessibilityRole="header">
          Ownership
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Odometer"
              value={f.odometer}
              onChangeText={set("odometer")}
              keyboardType="number-pad"
              error={errors.odometer}
            />
          </View>
          <View style={styles.unit}>
            <Segmented label="Odometer unit" options={UNITS} value={unit} onChange={setUnit} />
          </View>
        </View>
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
            hint="Private. Never shown on public pages. Fill in from VIN asks NHTSA's free public decoder, from your phone."
            error={errors.vin}
          />
        ) : (
          // an e-moto's VIN or frame number, stamped by the steering head. Proves it's yours if it's ever stolen
          <TextField
            label="VIN or frame number"
            value={f.frame_serial}
            onChangeText={(t) => set("frame_serial")(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            hint="Private. Stamped on the frame by the steering head. E-motos get stolen a lot: police and insurers ask for this."
            error={errors.frame_serial}
          />
        )}
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
          error={errors.description}
        />
      </View>

      {children}

      <View style={styles.section}>
        <Text variant="section" accessibilityRole="header">
          Sharing
        </Text>
        <Segmented label="Who can see it" options={VISIBILITY} value={visibility} onChange={setVisibility} />
        <Text variant="caption" muted>
          {visibility === "public"
            ? `Anyone can see this ${noun} and its build (never the ${hasVin(kind) ? "VIN" : "frame number"}). Needs a verified email.`
            : "Only you can see it."}
        </Text>
      </View>
      {error ? <InlineError kind={error} /> : null}
      {/* the marked fields can be scrolled far out of sight, so a failed save says so beside the button */}
      {Object.keys(errors).length ? <FieldError message={fixFieldsText(Object.keys(errors).length)} /> : null}
      <Button title={submitLabel} loading={busy} onPress={submit} fullWidth />
    </View>
  );
}

const UNITS = [
  { id: "mi", label: "mi" },
  { id: "km", label: "km" },
] as const;
const VISIBILITY = [
  { id: "private", label: "Private" },
  { id: "public", label: "Public" },
] as const;

const styles = themed(() =>
  StyleSheet.create({
    // sections sit further apart than the fields inside them, so the groups read without boxes or rules
    form: { gap: space.xl },
    section: { gap: space.md },
    preview: { gap: space.sm },
    art: { height: 150, borderRadius: radius.md },
    status: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
    unit: { width: 116, paddingTop: space.lg },
    row: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  }),
);
