import { StyleSheet, Text, View } from "react-native";
import { categoryLabel, COMPLIANCE_LABELS, isEmissionsCategory } from "@/domain/compliance";
import { KIND_LABELS } from "@/domain/entryForm";
import { evidence, evidenceSteps, formatDate, LEVELS } from "@/domain/evidence";
import { formatMiles, toMiles } from "@/domain/odometer";
import type { Entry } from "@/domain/types";
import { Card } from "./kit";
import { color, font, size, space } from "./theme";

/** The evidence ladder: four marks, filled to the entry's level, with the level named in words. */
export function Ladder({ level, steps, compact }: { level: number; steps?: boolean[]; compact?: boolean }) {
  const name = LEVELS[level]!.name;
  return (
    <View style={l.row} accessible accessibilityLabel={`Evidence: ${name}, step ${level + 1} of 4`}>
      <View style={l.marks}>
        {LEVELS.map((x) => (
          <View
            key={x.level}
            style={[l.mark, (steps ? steps[x.level] : x.level <= level) && (x.level === 3 ? l.markStamp : l.markOn)]}
          />
        ))}
      </View>
      {!compact && <Text style={[l.name, level === 3 && { color: color.stamp }]}>{name}</Text>}
    </View>
  );
}

export function EntryCard({ e, backwards, onPress }: { e: Entry; backwards?: boolean; onPress?: () => void }) {
  const ev = evidence(e);
  const meta = [formatDate(e.performedOn)];
  if (e.odometer != null) meta.push(formatMiles(toMiles(e.odometer, e.odometerUnit)));
  meta.push(e.installerType === "shop" ? (e.installerName ?? "Shop") : "Owner");
  const flags = [...ev.flags.map((f) => f.text), ...(backwards ? ["Odometer lower than an earlier entry"] : [])];
  return (
    <Card onPress={onPress} style={e.withdrawnAt ? { opacity: 0.6 } : undefined}>
      <Text style={r.meta}>{meta.join(" · ")}</Text>
      <Text style={[r.title, e.withdrawnAt && r.struck]}>
        {[e.partBrand, e.title].filter(Boolean).join(" ")}
      </Text>
      <Text style={r.kind}>
        {KIND_LABELS[e.kind]} · {categoryLabel(e.category)}
        {e.kind === "dyno" && (e.dynoWhp || e.dynoWtq)
          ? ` · ${[e.dynoWhp && `${e.dynoWhp} whp`, e.dynoWtq && `${e.dynoWtq} wtq`].filter(Boolean).join(" / ")}`
          : ""}
      </Text>
      {isEmissionsCategory(e.category) ? (
        <Text style={r.kind}>{e.carbEo ? `CARB EO ${e.carbEo}` : COMPLIANCE_LABELS[e.compliance]}</Text>
      ) : null}
      <Ladder level={ev.level} steps={evidenceSteps(e)} />
      <Text style={r.labels}>{ev.labels.slice(1).join(" · ") || "No receipt, part number or shop confirmation yet"}</Text>
      {flags.map((f) => (
        <Text key={f} style={r.flag}>
          ⚑ {f}
        </Text>
      ))}
    </Card>
  );
}

const l = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  marks: { flexDirection: "row", gap: 3 },
  mark: { width: 14, height: 6, borderRadius: 1, backgroundColor: color.ladderOff, transform: [{ skewX: "-20deg" }] },
  markOn: { backgroundColor: color.accent },
  markStamp: { backgroundColor: color.stamp },
  name: { fontFamily: font.sans, fontSize: size.small, fontWeight: "700", color: color.accent },
});
const r = StyleSheet.create({
  meta: { fontFamily: font.mono, fontSize: size.label + 1, color: color.muted },
  title: { fontFamily: font.serif, fontSize: 18, lineHeight: 24, fontWeight: "700", color: color.ink },
  struck: { textDecorationLine: "line-through" },
  kind: { fontFamily: font.sans, fontSize: size.small, color: color.muted },
  labels: { fontFamily: font.sans, fontSize: size.small, color: color.ink },
  flag: { fontFamily: font.sans, fontSize: size.small, color: color.flag, fontWeight: "600" },
});
