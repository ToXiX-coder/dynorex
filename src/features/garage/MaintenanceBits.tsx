import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card } from "@/components/cards/Card";
import { AlertIcon, ChevronIcon } from "@/components/icons";
import { Text } from "@/components/Text";
import { byUrgency, dueStatus, dueText, latestPerJob, type Due } from "@/domain/maintenance";
import type { MaintenanceRecord } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, radius, space, touch } from "@/theme/tokens";
import { maintenanceService } from "./maintenanceService";
import { themed } from "@/theme/themed";

/** One upcoming job: a coloured edge plus words (overdue gets a ⚠), never colour alone. */
export function DueRow({
  record,
  due,
  onPress,
  action,
}: {
  record: MaintenanceRecord;
  due: Due;
  onPress: () => void;
  /** what tapping does, shown on the right (e.g. "Mark done") */
  action?: string;
}) {
  const tone = due.state === "overdue" ? color.danger : due.state === "soon" ? color.accent : color.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.title}: ${dueText(due)}${action ? `. ${action}` : ""}`}
      onPress={onPress}
      style={withPress({ minHeight: touch.min })}
    >
      <View style={[styles.due, { borderLeftColor: tone }, action ? styles.dueRow : null]}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{record.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {due.state === "overdue" ? <AlertIcon color={color.danger} size={14} /> : null}
            <Text variant="caption" style={due.state === "soon" ? { color: color.accent } : undefined}>
              {dueText(due)}
            </Text>
          </View>
        </View>
        {action ? <Text variant="label">{action}</Text> : null}
      </View>
    </Pressable>
  );
}

/** The latest record per job, with how due it is, most urgent first. */
export function upcomingJobs(records: MaintenanceRecord[], odometer: number | null) {
  return latestPerJob(records)
    .map((r) => ({ r, due: dueStatus(r, odometer) }))
    .filter((x) => x.due.state !== "none")
    .sort((a, b) => byUrgency(a.due, b.due));
}

/** A card's title row that opens a screen: the title, then the action word and a chevron. */
export function CardLinkHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <Text variant="title" style={{ flex: 1 }}>
        {title}
      </Text>
      <Text variant="label" muted>
        {action}
      </Text>
      <ChevronIcon color={color.textMuted} />
    </View>
  );
}

/** "Maintenance" card on the vehicle page: the two most urgent jobs and a way into the log. */
export function MaintenanceCard({ vehicleId, odometer }: { vehicleId: string; odometer: number | null }) {
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    void maintenanceService.list(vehicleId).then((r) => alive && r.ok && setRecords(r.data));
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  const open = () => router.push(`/garage/${vehicleId}/maintenance`);
  const jobs = records ? upcomingJobs(records, odometer).slice(0, 2) : [];
  const flagged = jobs.filter((j) => j.due.state !== "ok");
  return (
    <Card style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Maintenance log${flagged.length ? `, ${flagged.length} due` : ""}`}
        onPress={open}
        style={withPress({ minHeight: touch.min, justifyContent: "center" })}
      >
        <CardLinkHeader title="Maintenance" action={records && records.length ? "Log" : "Start a log"} />
      </Pressable>
      {records && records.length === 0 ? (
        <Text variant="caption" muted>
          Track oil changes, fluids and tires, and get reminded when they&apos;re due.
        </Text>
      ) : null}
      {jobs.map(({ r, due }) => (
        <DueRow key={r.id} record={r} due={due} onPress={open} />
      ))}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    due: {
      borderLeftWidth: 4,
      backgroundColor: color.background,
      borderRadius: radius.sm,
      padding: space.sm,
      gap: 2,
    },
    dueRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  }),
);
