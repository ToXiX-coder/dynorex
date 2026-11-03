import type { ProofServiceApi } from "@/features/garage/proofService";
import { DEMO_ME } from "./data";
import { recordGuard } from "./recordHooks";
import { demoKit as K } from "./services";

/** Pitch-mode twin for D-62 (migration 20261024000000_research_picks.sql), on sample data. */
const S = () => K.state();
const now = () => new Date().toISOString();
const mine = (vehicleId: string) =>
  S().vehicles.some((v) => v.id === vehicleId && v.owner_id === DEMO_ME && !v.deleted_at);

export const demoProofService: ProofServiceApi = {
  dynoResults: (vehicleId) =>
    K.run(() =>
      S()
        .dynoResults.filter((r) => r.vehicle_id === vehicleId && r.owner_id === DEMO_ME)
        .sort((a, b) => b.measured_on.localeCompare(a.measured_on)),
    ),
  addDyno: (input) =>
    K.run(() => {
      if (!mine(input.vehicle_id)) K.refuse("buildNotFound");
      const sold = recordGuard(S(), input.vehicle_id, null);
      if (sold) K.refuse(sold);
      if (input.whp < 20 || input.whp > 3000) K.refuse("saveFailed");
      const id = K.newId();
      S().dynoResults.push({
        id,
        owner_id: DEMO_ME,
        shop: null,
        wtq: null,
        fuel: null,
        notes: null,
        shared: false,
        ...input,
        sheet_path: null,
        created_at: now(),
      });
      return id;
    }),
  setDynoShared: (id, shared) =>
    K.run(() => {
      const r = S().dynoResults.find((x) => x.id === id && x.owner_id === DEMO_ME);
      const guard = r && recordGuard(S(), r.vehicle_id, r.inherited_at);
      if (guard) K.refuse(guard);
      if (r) r.shared = shared;
    }),
  removeDyno: (id) =>
    K.run(() => {
      const r = S().dynoResults.find((x) => x.id === id && x.owner_id === DEMO_ME);
      const guard = r && recordGuard(S(), r.vehicle_id, r.inherited_at);
      if (guard) K.refuse(guard);
      S().dynoResults = S().dynoResults.filter((x) => !(x.id === id && x.owner_id === DEMO_ME));
    }),
  publicDyno: (vehicleId) =>
    K.run(() =>
      K.isPublicVehicle(vehicleId)
        ? S()
            .dynoResults.filter((r) => r.vehicle_id === vehicleId && r.shared)
            .map(({ id, vehicle_id, measured_on, dyno, correction, shop, whp, wtq, fuel, sheet_path }) => ({
              result_id: id,
              vehicle_id,
              measured_on,
              dyno,
              correction,
              shop,
              whp,
              wtq,
              fuel,
              has_sheet: sheet_path !== null,
            }))
        : [],
    ),

  laps: (vehicleId) =>
    K.run(() =>
      S()
        .trackLaps.filter((l) => l.vehicle_id === vehicleId && l.owner_id === DEMO_ME)
        .sort((a, b) => b.driven_on.localeCompare(a.driven_on) || a.lap_ms - b.lap_ms),
    ),
  addLaps: (inputs) =>
    K.run(() => {
      for (const l of inputs) {
        if (!mine(l.vehicle_id) || l.lap_ms < 20_000 || l.lap_ms > 1_800_000) K.refuse("saveFailed");
        S().trackLaps.push({ id: K.newId(), owner_id: DEMO_ME, notes: null, shared: false, ...l, created_at: now() });
      }
    }),
  setLapShared: (id, shared) =>
    K.run(() => {
      const l = S().trackLaps.find((x) => x.id === id && x.owner_id === DEMO_ME);
      if (l) l.shared = shared;
    }),
  removeLap: (id) =>
    K.run(() => {
      S().trackLaps = S().trackLaps.filter((x) => !(x.id === id && x.owner_id === DEMO_ME));
    }),
  publicLaps: (vehicleId) =>
    K.run(() =>
      K.isPublicVehicle(vehicleId)
        ? S()
            .trackLaps.filter((l) => l.vehicle_id === vehicleId && l.shared)
            .sort((a, b) => a.lap_ms - b.lap_ms)
            .map(({ id, vehicle_id, track, lap_ms, driven_on, source }) => ({
              lap_id: id,
              vehicle_id,
              track,
              lap_ms,
              driven_on,
              source,
            }))
        : [],
    ),

  recalls: (vehicleId) =>
    K.run(() =>
      mine(vehicleId)
        ? S()
            .recalls.filter((r) => r.vehicle_id === vehicleId)
            .map(({ vehicle_id: _v, ...r }) => ({
              ...r,
              dismissed: S().recallDismissals.some((d) => d.vehicle_id === vehicleId && d.campaign === r.campaign),
            }))
        : [],
    ),
  setRecallDismissed: (vehicleId, campaign, dismissed) =>
    K.run(() => {
      if (!mine(vehicleId)) K.refuse("buildNotFound");
      S().recallDismissals = S().recallDismissals.filter(
        (d) => !(d.vehicle_id === vehicleId && d.campaign === campaign),
      );
      if (dismissed) S().recallDismissals.push({ vehicle_id: vehicleId, campaign });
    }),
};
