import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { recordDate, recordSummary } from "@/domain/record";
import type { BuildRecord } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";
import { RecordStrip } from "./RecordBits";
import { recordService } from "./recordService";

/**
 * The Build Record on the vehicle screen (D-64): how much of the car's work a buyer could weigh today, and the way
 * in to share it, put it in a listing, or hand it over at a sale.
 */
export function BuildRecordCard({ vehicleId }: { vehicleId: string }) {
  const [rec, setRec] = useState<BuildRecord | null>(null);
  useFocusEffect(
    useCallback(() => {
      void recordService.myRecord(vehicleId).then((r) => r.ok && setRec(r.data));
    }, [vehicleId]),
  );
  const s = rec ? recordSummary(rec.entries) : null;
  return (
    <Card style={{ gap: space.sm }}>
      <SectionHeader>Build Record</SectionHeader>
      {rec?.sold_at ? (
        <Text>{`Sold ${recordDate(rec.sold_at)}. This is your read-only copy of the record you handed over.`}</Text>
      ) : (
        <Text variant="caption" muted>
          Finished mods, the service log and dyno results, with their paperwork and shop confirmations, in one record a
          buyer can check. Edits and removals stay visible, so it&apos;s worth more when you sell.
        </Text>
      )}
      {s && rec ? (
        <>
          <Text>
            {`${s.entries} ${s.entries === 1 ? "entry" : "entries"} · ${s.withPaperwork} with paperwork · ${s.shopConfirmed} shop-confirmed${rec.owners > 1 ? ` · ${rec.owners} owners` : ""}`}
          </Text>
          {/* the whole record in one look: taller and brighter marks are better backed */}
          <RecordStrip entries={rec.entries} height={22} />
        </>
      ) : null}
      <Button
        title="Open Build Record"
        variant="secondary"
        onPress={() => router.push({ pathname: "/garage/[vehicleId]/record", params: { vehicleId } })}
      />
    </Card>
  );
}
