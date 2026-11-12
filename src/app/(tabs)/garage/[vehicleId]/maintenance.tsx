import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, type ScrollView, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { DateField } from "@/components/forms/PickerFields";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { num } from "@/domain/calculators";
import {
  batteryReadingText,
  isBatteryCheck,
  latestPerJob,
  ODO_MAX,
  presetsFor,
  suggestNextDue,
} from "@/domain/maintenance";
import { kindNoun, kindOf, type VehicleKind } from "@/domain/vehicleKind";
import { parsePrice, priceText } from "@/domain/shop";
import { dayText, localToday } from "@/domain/when";
import { icsFileName, serviceIcs } from "@/domain/calendar";
import { shareIcs } from "@/features/paddock/addToCalendar";
import type { MappedError } from "@/features/auth/errors";
import { buildService } from "@/features/garage/buildService";
import { DueRow, upcomingJobs } from "@/features/garage/MaintenanceBits";
import { maintenanceService } from "@/features/garage/maintenanceService";
import { Receipts } from "@/features/garage/Receipts";
import {
  allowReminders,
  clearReminder,
  morningOf,
  remindersSupported,
  setReminder,
} from "@/features/notifications/reminders";
import type { MaintenanceInput, MaintenanceRecord, VehicleRow } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { space } from "@/theme/tokens";

const today = () => localToday();

/**
 * A car's maintenance log: what was done and when, and what's due next by date and/or mileage. Private to the
 * owner. Due dates become reminders on this phone (9 am that day); the "Due" list works everywhere.
 */
export default function Maintenance() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const id = String(vehicleId);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  // "new", a record to edit, or a due job being marked done (a new record for it, the old one stays as history)
  const [editing, setEditing] = useState<MaintenanceRecord | "new" | { redo: MaintenanceRecord } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(() => {
    void Promise.all([buildService.getVehicle(id), maintenanceService.list(id)]).then(([v, r]) => {
      if (v.ok) setVehicle(v.data);
      if (!r.ok) return setError(r.error);
      setError(null);
      setRecords(r.data);
    });
  }, [id]);
  useFocusEffect(load);

  if (records === null && !error) return <LoadingState label="Loading maintenance" />;
  // mileage reminders use miles; the database can hand numbers back as strings, so coerce
  const km = vehicle?.odometer_unit === "km";
  const odo = vehicle && vehicle.odometer !== null && !km ? Number(vehicle.odometer) : null;
  // the latest record per job carries the reminder; older ones are history
  const due = upcomingJobs(records ?? [], odo);
  const vehicleName =
    vehicle?.nickname || (vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "your vehicle");
  const noun = kindNoun(kindOf(vehicle));
  // "Log again" sits on the newest record of each job only; older ones are history
  const newest = new Set(latestPerJob(records ?? []).map((r) => r.id));
  const again = (r: MaintenanceRecord) => {
    setEditing({ redo: r });
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <Screen onRefresh={load} scrollRef={scroll}>
      <Text variant="caption" muted>
        {`Private to you.${
          km
            ? ` This ${noun}'s odometer is in km, so reminders here go by date (mileage reminders use miles).`
            : odo !== null
              ? ` Odometer on file: ${odo.toLocaleString()} mi (tap it on the ${noun}'s page to update it).`
              : ` Add the odometer on the ${noun}'s page to track mileage reminders.`
        }`}
      </Text>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {editing ? (
        <RecordForm
          vehicleId={id}
          vehicleName={vehicleName}
          odometer={odo}
          kind={kindOf(vehicle)}
          record={editing === "new" || "redo" in editing ? null : editing}
          redo={editing !== "new" && "redo" in editing ? editing.redo : null}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <Button title="Log maintenance" onPress={() => setEditing("new")} />
      )}

      {due.length ? (
        <>
          <SectionHeader>Coming up</SectionHeader>
          {due.map(({ r, due: d }) => (
            <View key={r.id} style={{ gap: space.xs }}>
              <DueRow record={r} due={d} action="Mark done" onPress={() => again(r)} />
              {r.next_due_on ? <CalendarButton record={r} car={vehicleName} /> : null}
            </View>
          ))}
        </>
      ) : null}

      <SectionHeader>History</SectionHeader>
      {records && records.length === 0 ? (
        <EmptyState
          expression="wrenching"
          message="Nothing logged yet"
          detail="Oil changes, fluids, tires: log them here and get a heads-up when they're due."
        />
      ) : null}
      {(records ?? []).map((r) => (
        <View key={r.id} style={{ gap: space.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${r.title}, ${dayText(r.done_on)}${r.odometer !== null ? `, ${r.odometer} miles` : ""}. Edit`}
            onPress={() => setEditing(r)}
            style={withPress({})}
          >
            <Card style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {r.title}
                </Text>
                {r.cost_minor !== null ? <Text variant="caption">{priceText(r.cost_minor, r.currency)}</Text> : null}
              </View>
              <Text variant="caption" muted>
                {`${new Date(`${r.done_on}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${r.odometer !== null ? ` · ${r.odometer.toLocaleString()} mi` : ""}`}
              </Text>
              {batteryReadingText(r) ? <Text variant="caption">{batteryReadingText(r)}</Text> : null}
              {r.notes ? <Text variant="caption">{r.notes}</Text> : null}
            </Card>
          </Pressable>
          {/* D-68: the same job again (oil, tires...) with today's date and mileage filled in */}
          {newest.has(r.id) ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button
                title="Log again"
                variant="secondary"
                accessibilityLabel={`Log ${r.title} again`}
                onPress={() => again(r)}
              />
            </View>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

/** D-68: the next due date into the phone's own calendar (an .ics made here; nothing leaves the phone otherwise). */
function CalendarButton({ record, car }: { record: MaintenanceRecord; car: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ gap: space.xs, alignSelf: "flex-start" }}>
      <Button
        title="Add to calendar"
        variant="secondary"
        accessibilityLabel={`Add ${record.title} to your calendar`}
        onPress={async () => {
          const ok = await shareIcs(
            serviceIcs({
              id: record.id,
              title: record.title,
              car,
              due_on: record.next_due_on!,
              due_miles: record.next_due_odometer,
            }),
            icsFileName(`${record.title} due`),
          );
          setFailed(!ok);
        }}
      />
      {failed ? (
        <Text variant="caption" muted>
          This phone can&apos;t add it from here. The reminder above still works.
        </Text>
      ) : null}
    </View>
  );
}

function RecordForm({
  vehicleId,
  vehicleName,
  odometer,
  kind,
  record,
  redo = null,
  onDone,
}: {
  vehicleId: string;
  vehicleName: string;
  odometer: number | null;
  /** D-72: the job list and intervals follow the kind of vehicle */
  kind: VehicleKind;
  record: MaintenanceRecord | null;
  /** marking this due job done: a new record with its title, due dates suggested from today */
  redo?: MaintenanceRecord | null;
  onDone: () => void;
}) {
  const start = redo ? suggestNextDue(redo.title, today(), odometer, kind) : null;
  const [title, setTitle] = useState(record?.title ?? redo?.title ?? "");
  const [doneOn, setDoneOn] = useState(record?.done_on ?? today());
  const [odo, setOdo] = useState(record?.odometer?.toString() ?? odometer?.toString() ?? "");
  const [cost, setCost] = useState(
    record?.cost_minor != null ? (record.cost_minor / 100).toFixed(record.cost_minor % 100 ? 2 : 0) : "",
  );
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [nextOn, setNextOn] = useState(record?.next_due_on ?? start?.next_due_on ?? "");
  const [nextOdo, setNextOdo] = useState(
    record?.next_due_odometer?.toString() ?? start?.next_due_odometer?.toString() ?? "",
  );
  // D-74: an e-moto battery check carries two readings a buyer asks for first
  const [cycles, setCycles] = useState(record?.battery_cycles?.toString() ?? "");
  const [fullV, setFullV] = useState(record?.battery_full_v != null ? String(Number(record.battery_full_v)) : "");
  const batteryCheck = isBatteryCheck(title, kind);
  const [remind, setRemind] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const pick = (t: string) => {
    setTitle(t);
    const s = suggestNextDue(t, doneOn, num(odo), kind);
    setNextOn(s.next_due_on ?? "");
    setNextOdo(s.next_due_odometer?.toString() ?? "");
  };

  const save = async () => {
    setError(null);
    const e: Record<string, string> = {};
    const t = title.trim();
    if (t.length < 2 || t.length > 80) e.title = "Use 2 to 80 characters";
    const o = odo.trim() ? num(odo) : null;
    // matches the database's 0 to 2,000,000 check, so a slip like a doubled reading is caught here
    if (odo.trim() && (o === null || o < 0 || o > ODO_MAX)) e.odo = "Use 0 to 2,000,000 miles";
    const no = nextOdo.trim() ? num(nextOdo) : null;
    if (nextOdo.trim() && (no === null || no < 0 || no > ODO_MAX)) e.nextOdo = "Use 0 to 2,000,000 miles";
    if (no !== null && o !== null && no <= o) e.nextOdo = "Should be more than the odometer above";
    let costMinor: number | null = null;
    if (cost.trim()) {
      const p = parsePrice(cost);
      if (!p.ok) e.cost = p.message;
      else costMinor = p.minor;
    }
    if (nextOn && nextOn < doneOn) e.nextOn = "Should be after the date it was done";
    const c = batteryCheck && cycles.trim() ? num(cycles) : null;
    if (batteryCheck && cycles.trim() && (c === null || c < 0 || c > 20000 || !Number.isInteger(c)))
      e.cycles = "Use a whole number, 0 to 20,000";
    const v = batteryCheck && fullV.trim() ? num(fullV) : null;
    if (batteryCheck && fullV.trim() && (v === null || v < 10 || v > 900)) e.fullV = "Use 10 to 900 volts";
    if (Object.keys(e).length) return setErrors(e);
    setErrors({});
    const input: MaintenanceInput = {
      title: t,
      done_on: doneOn,
      odometer: o === null ? null : Math.round(o),
      cost_minor: costMinor,
      notes: notes.trim() || null,
      next_due_on: nextOn || null,
      next_due_odometer: no === null ? null : Math.round(no),
      battery_cycles: c,
      battery_full_v: v === null ? null : Math.round(v * 10) / 10,
    };
    setBusy(true);
    const r = record
      ? await maintenanceService.update(record.id, input)
      : await maintenanceService.add(vehicleId, input);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const recordId = record?.id ?? (r.data as string);
    if (input.next_due_on && remind && remindersSupported()) {
      const ok =
        (await allowReminders()) &&
        (await setReminder(
          `maintenance:${recordId}`,
          morningOf(input.next_due_on),
          `${t} due`,
          `${vehicleName}: ${t} is due today.`,
          {
            entity_type: "maintenance",
            entity_id: vehicleId,
          },
        ));
      if (!ok) setNote("Saved. Reminders are off for Dynorex in your phone's settings, so check the Due list here.");
    } else await clearReminder(`maintenance:${recordId}`);
    // the job this replaces is history now: its reminder goes
    if (redo) await clearReminder(`maintenance:${redo.id}`);
    onDone();
  };

  return (
    <Card style={{ gap: space.md }}>
      <SectionHeader>
        {record
          ? "Edit record"
          : redo
            ? `${redo.next_due_on || redo.next_due_odometer !== null ? "Mark done" : "Log again"}: ${redo.title}`
            : "Log maintenance"}
      </SectionHeader>
      {!record && !redo ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {presetsFor(kind)
            .slice(0, 8)
            .map((p) => (
              <Chip key={p.title} label={p.title} selected={title === p.title} onPress={() => pick(p.title)} />
            ))}
        </View>
      ) : null}
      <TextField
        label="What was done"
        required
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        error={errors.title}
        placeholder={kind === "ebike" ? "Chain clean and lube" : "Oil change"}
      />
      <DateField label="Done on" value={doneOn} onChange={setDoneOn} max={today()} />
      <TextField
        label="Odometer (miles)"
        value={odo}
        onChangeText={setOdo}
        keyboardType="number-pad"
        error={errors.odo}
      />
      {batteryCheck ? (
        <View style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Charge cycles"
                value={cycles}
                onChangeText={setCycles}
                keyboardType="number-pad"
                maxLength={5}
                error={errors.cycles}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Volts at full charge"
                value={fullV}
                onChangeText={setFullV}
                keyboardType="decimal-pad"
                maxLength={5}
                error={errors.fullV}
              />
            </View>
          </View>
          <Text variant="caption" muted>
            Cycles from the BMS or charger app, volts from a meter or the dash right after a full charge. Goes on your
            Build Record as your own reading; buyers ask about the battery first.
          </Text>
        </View>
      ) : null}
      <TextField
        label="Cost in dollars (optional)"
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        error={errors.cost}
      />
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
        placeholder="Brand, part numbers, who did it"
      />
      <Text variant="label">Next due (optional)</Text>
      <Text variant="caption" muted>
        Typical intervals fill in for common jobs. Your owner&apos;s manual wins: change them as needed.
      </Text>
      <DateField label="Next due date" value={nextOn} onChange={setNextOn} min={doneOn} error={errors.nextOn} />
      <TextField
        label="Next due at (miles)"
        value={nextOdo}
        onChangeText={setNextOdo}
        keyboardType="number-pad"
        error={errors.nextOdo}
      />
      {nextOn && remindersSupported() ? (
        <Chip label="Remind me on this phone" selected={remind} onPress={() => setRemind(!remind)} />
      ) : null}
      {record ? (
        <Receipts vehicleId={vehicleId} item={{ maintenanceId: record.id }} />
      ) : (
        <Text variant="caption" muted>
          Log it first, then tap it in your history to add receipt photos.
        </Text>
      )}
      {note ? <InlineNotice title={note} /> : null}
      {error ? <InlineError kind={error.key} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button title={record ? "Save" : "Log it"} loading={busy} onPress={() => void save()} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={onDone} />
        {record ? (
          <Button title="Delete" variant="destructive" disabled={busy} onPress={() => setConfirmDelete(true)} />
        ) : null}
      </View>
      {record ? (
        <ConfirmModal
          visible={confirmDelete}
          kind="deleteMaintenance"
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            const r = await maintenanceService.remove(record.id);
            if (!r.ok) return setError(r.error);
            await clearReminder(`maintenance:${record.id}`);
            onDone();
          }}
        />
      ) : null}
    </Card>
  );
}
