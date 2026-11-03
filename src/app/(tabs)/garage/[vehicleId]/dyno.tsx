import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { SignedImage } from "@/components/build/SignedImage";
import { UploadList } from "@/components/build/UploadList";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { DateField } from "@/components/forms/PickerFields";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { num } from "@/domain/calculators";
import { CORRECTIONS, DYNO_BRANDS, dynoImpact, dynoLabel, OWNER_REPORTED } from "@/domain/proof";
import { localToday } from "@/domain/when";
import type { ErrorKey } from "@/domain/copy/errors";
import type { MappedError } from "@/features/auth/errors";
import { usePhotoUploads } from "@/features/garage/usePhotoUploads";
import { analytics } from "@/services/analytics";
import { pickPhoto } from "@/services/media/photos";
import { buildService } from "@/features/garage/buildService";
import { proofService } from "@/features/garage/proofService";
import type { DynoBrand, DynoCorrection, DynoResultRow, ModRow } from "@/services/supabase/database.types";
import { color, space } from "@/theme/tokens";

const today = () => localToday();

/**
 * A car's dyno log: results copied from a shop's dyno sheet, with the dyno brand and correction, because different
 * dynos read differently. Before and after per mod only compares the same dyno and correction. Owner-reported,
 * private unless shared on the public build (numbers only).
 */
export default function DynoLog() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [results, setResults] = useState<DynoResultRow[] | null>(null);
  const [mods, setMods] = useState<ModRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [photoError, setPhotoError] = useState<ErrorKey | null>(null);

  const load = useCallback(() => {
    void proofService.dynoResults(id).then((r) => (r.ok ? setResults(r.data) : setError(r.error)));
    void buildService.listMods(id, 0).then((r) => r.ok && setMods(r.data));
  }, [id]);
  useFocusEffect(load);
  const uploads = usePhotoUploads(load);

  if (results === null && !error) return <LoadingState label="Loading dyno log" />;
  const impact = dynoImpact(results ?? [], mods);

  return (
    <Screen onRefresh={load}>
      <Text variant="caption" muted>
        {`${OWNER_REPORTED} Different dynos read differently, so compare results from the same dyno.`}
      </Text>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {adding ? (
        <DynoForm
          vehicleId={id}
          last={results?.[0] ?? null}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      ) : (
        <Button title="Log a dyno result" onPress={() => setAdding(true)} />
      )}

      {impact.length ? (
        <>
          <SectionHeader>What each mod changed</SectionHeader>
          <Text variant="caption" muted>
            Last result before the mod against the first after it, on the same dyno and correction only.
          </Text>
          {impact.map((m) => (
            <Card key={m.modId} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{m.name}</Text>
                <Text variant="caption" muted>{`${m.before} → ${m.after} whp · ${dynoLabel(m.dyno)}`}</Text>
              </View>
              <Text variant="title" style={{ color: m.delta >= 0 ? color.accent : color.textMuted }}>
                {`${m.delta >= 0 ? "+" : ""}${m.delta}`}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader>Results</SectionHeader>
      <Text variant="caption" muted>
        Attach a photo of the shop&apos;s sheet: anyone looking at a shared result can see a sheet is on file.
      </Text>
      {photoError ? <InlineError kind={photoError} /> : null}
      <UploadList items={uploads.items} onRetry={uploads.retry} onCancel={uploads.cancel} onDismiss={uploads.dismiss} />
      {results && results.length === 0 ? (
        <EmptyState
          expression="wrenching"
          message="No dyno results yet"
          detail="Been on a dyno? Copy the numbers off the sheet: before and after a mod is where it gets interesting."
        />
      ) : null}
      {(results ?? []).map((r) => (
        <Card key={r.id} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="title">{`${r.whp} whp${r.wtq !== null ? ` · ${r.wtq} lb-ft` : ""}`}</Text>
            <Text variant="caption">{r.measured_on}</Text>
          </View>
          <Text variant="caption" muted>
            {[dynoLabel(r.dyno), CORRECTIONS.find((c) => c.id === r.correction)?.label, r.shop, r.fuel]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {r.notes ? <Text variant="caption">{r.notes}</Text> : null}
          {r.sheet_path ? (
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <SignedImage
                path={r.sheet_path}
                alt="Photo of the dyno sheet"
                style={{ width: 56, height: 72, borderRadius: 6 }}
              />
              <Text variant="caption" style={{ flex: 1 }}>
                Sheet on file. The photo stays private; a shared result says a sheet is on file.
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Chip
              label={r.shared ? "On your public build" : "Show on public build"}
              selected={r.shared}
              onPress={async () => {
                const res = await proofService.setDynoShared(r.id, !r.shared);
                if (res.ok) load();
              }}
            />
            <Chip
              label={r.sheet_path ? "Replace sheet photo" : "Attach sheet photo"}
              selected={false}
              onPress={async () => {
                setPhotoError(null);
                const p = await pickPhoto("library");
                if (!p.ok) return setPhotoError(p.error.key);
                if (p.data) void uploads.add(p.data, { kind: "dyno", resultId: r.id });
              }}
            />
            <Chip
              label="Delete"
              selected={false}
              onPress={async () => {
                const res = await proofService.removeDyno(r.id);
                if (res.ok) load();
              }}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function DynoForm({ vehicleId, last, onDone }: { vehicleId: string; last: DynoResultRow | null; onDone: () => void }) {
  // a second visit to the same shop is the common case: start from the last result's dyno, correction and shop
  const [day, setDay] = useState(today());
  const [dyno, setDyno] = useState<DynoBrand>(last?.dyno ?? "dynojet");
  const [correction, setCorrection] = useState<DynoCorrection>(last?.correction ?? "sae");
  const [shop, setShop] = useState(last?.shop ?? "");
  const [whp, setWhp] = useState("");
  const [wtq, setWtq] = useState("");
  const [fuel, setFuel] = useState(last?.fuel ?? "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    const p = num(whp);
    const t = wtq.trim() ? num(wtq) : null;
    if (p === null || p < 20 || p > 3000) e.whp = "Use 20 to 3,000";
    if (wtq.trim() && (t === null || t < 20 || t > 3000)) e.wtq = "Use 20 to 3,000";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    const r = await proofService.addDyno({
      vehicle_id: vehicleId,
      measured_on: day,
      dyno,
      correction,
      whp: Math.round(p! * 10) / 10,
      wtq: t === null ? null : Math.round(t * 10) / 10,
      shop: shop.trim() || null,
      fuel: fuel.trim() || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    analytics.track("proof_logged", { kind: "dyno" });
    onDone();
  };

  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>Log a dyno result</SectionHeader>
      <DateField label="Date" value={day} onChange={setDay} max={today()} />
      <Text variant="label">Dyno</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {DYNO_BRANDS.map((d) => (
          <Chip key={d.id} label={d.label} selected={dyno === d.id} onPress={() => setDyno(d.id)} />
        ))}
      </View>
      <Text variant="label">Correction (on the sheet)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {CORRECTIONS.map((c) => (
          <Chip key={c.id} label={c.label} selected={correction === c.id} onPress={() => setCorrection(c.id)} />
        ))}
      </View>
      <TextField
        label="Peak wheel horsepower"
        required
        value={whp}
        onChangeText={setWhp}
        keyboardType="decimal-pad"
        error={errors.whp}
      />
      <TextField
        label="Peak wheel torque, lb-ft (optional)"
        value={wtq}
        onChangeText={setWtq}
        keyboardType="decimal-pad"
        error={errors.wtq}
      />
      <TextField label="Shop (optional)" value={shop} onChangeText={setShop} maxLength={80} />
      <TextField
        label="Fuel (optional)"
        value={fuel}
        onChangeText={setFuel}
        maxLength={40}
        placeholder="93 octane, E85"
      />
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        multiline
        placeholder="Tune, boost, weather. Private to you."
      />
      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title="Save" loading={busy} onPress={() => void save()} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={onDone} />
      </View>
    </Card>
  );
}
