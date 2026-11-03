import { useEffect, useState } from "react";
import { kindOf, type VehicleKind } from "@/domain/vehicleKind";
import { buildService } from "./buildService";

/**
 * D-71: the kind of one of my vehicles, for screens that only have its id (the mod forms). Reads as a car until it
 * loads, and stays a car if it can't, which is what every vehicle was before kinds existed.
 */
export function useVehicleKind(vehicleId: string): VehicleKind {
  const [kind, setKind] = useState<{ id: string; kind: VehicleKind } | null>(null);
  useEffect(() => {
    let alive = true;
    void buildService.getVehicle(vehicleId).then((r) => {
      if (alive && r.ok) setKind({ id: vehicleId, kind: kindOf(r.data) });
    });
    return () => {
      alive = false;
    };
  }, [vehicleId]);
  return kind?.id === vehicleId ? kind.kind : "car";
}
