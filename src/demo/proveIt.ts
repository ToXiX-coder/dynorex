import type { PerfServiceApi } from "@/features/garage/perfService";
import type { DriveServiceApi } from "@/features/paddock/driveService";
import type { DrivePosition, FitmentRow, PerfRunRow } from "@/services/supabase/database.types";
import { DEMO_ME } from "./data";
import { demoKit as K } from "./services";

/** Pitch-mode twins for D-60 (migration 20261022000000_prove_it.sql), on sample data. */
const S = () => K.state();
const now = () => new Date().toISOString();
const myVehicle = (id: string) => S().vehicles.some((v) => v.id === id && v.owner_id === DEMO_ME && !v.deleted_at);
const between = (x: number | null, lo: number, hi: number) => x === null || (x >= lo && x <= hi);

export const demoPerfService: PerfServiceApi = {
  list: (vehicleId) =>
    K.run(() =>
      S()
        .perfRuns.filter((r) => r.vehicle_id === vehicleId && r.owner_id === DEMO_ME && !r.deleted_at)
        .sort((a, b) => b.ran_at.localeCompare(a.ran_at)),
    ),
  save: (input) =>
    K.run(() => {
      if (!myVehicle(input.vehicle_id)) return K.refuse("buildNotFound");
      // the same checks as the table
      const ok =
        (input.zero_sixty_s !== null || input.quarter_s !== null || input.zero_thirty_s != null) &&
        (input.quarter_s === null) === (input.trap_mph === null) &&
        between(input.zero_sixty_s, 1.5, 30) &&
        between(input.zero_thirty_s ?? null, 0.5, 20) &&
        between(input.weight_lb, 100, 12000) &&
        between(input.quarter_s, 6, 40) &&
        between(input.est_whp, 20, 3000);
      if (!ok) K.refuse("saveFailed");
      const r: PerfRunRow = { id: K.newId(), owner_id: DEMO_ME, ...input, created_at: now(), deleted_at: null };
      S().perfRuns.push(r);
      return r.id;
    }),
  setShared: (id, shared) =>
    K.run(() => {
      const r = S().perfRuns.find((x) => x.id === id && x.owner_id === DEMO_ME && !x.deleted_at);
      if (!r) return K.refuse("buildNotFound");
      r.shared = shared;
    }),
  remove: (id) =>
    K.run(() => {
      const r = S().perfRuns.find((x) => x.id === id && x.owner_id === DEMO_ME);
      if (r) r.deleted_at = now();
    }),
  publicRuns: (vehicleId) =>
    K.run(() =>
      K.isPublicVehicle(vehicleId)
        ? S()
            .perfRuns.filter((r) => r.vehicle_id === vehicleId && r.shared && !r.deleted_at)
            .sort((a, b) => b.ran_at.localeCompare(a.ran_at))
            .map((r) => ({
              run_id: r.id,
              vehicle_id: r.vehicle_id,
              ran_at: r.ran_at,
              zero_sixty_s: r.zero_sixty_s,
              zero_thirty_s: r.zero_thirty_s ?? null,
              quarter_s: r.quarter_s,
              trap_mph: r.trap_mph,
              est_whp: r.est_whp,
              sample_hz: r.sample_hz,
              quality: r.quality,
            }))
        : [],
    ),
  fitment: (car, category, terms) =>
    K.run(() => {
      const words = (terms ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3)
        .slice(0, 6);
      const cars = S().vehicles.filter(
        (v) =>
          K.isPublicVehicle(v.id) &&
          !K.blockedWith(v.owner_id) &&
          v.make.toLowerCase() === car.make.toLowerCase() &&
          v.model.toLowerCase() === car.model.toLowerCase() &&
          Math.abs(v.year - car.year) <= 3,
      );
      const groups = new Map<string, FitmentRow & { set: Set<string> }>();
      for (const m of S().mods) {
        if (m.deleted_at || m.status !== "complete" || !cars.some((v) => v.id === m.vehicle_id)) continue;
        if (category && m.category !== category) continue;
        const text = `${m.name} ${m.brand ?? ""}`.toLowerCase();
        if (words.length && !words.some((w) => text.includes(w))) continue;
        const key = `${m.name.toLowerCase()}|${(m.brand ?? "").toLowerCase()}`;
        const g = groups.get(key) ?? {
          name: m.name,
          brand: m.brand,
          category: m.category,
          owners: 0,
          vehicle_ids: [],
          set: new Set<string>(),
        };
        g.set.add(m.vehicle_id);
        groups.set(key, g);
      }
      return [...groups.values()]
        .map(({ set, ...g }) => ({ ...g, owners: set.size, vehicle_ids: [...set].slice(0, 5) }))
        .sort((a, b) => b.owners - a.owners || a.name.localeCompare(b.name))
        .slice(0, 10);
    }),
};

/** Same window as the server: drive events, host or going, 30 minutes either side. */
function live(eventId: string) {
  const e = S().events.find((x) => x.id === eventId && !x.deleted_at);
  if (!e || e.kind !== "drive" || e.status !== "scheduled") return null;
  const t = Date.now();
  if (t < Date.parse(e.starts_at) - 30 * 60_000 || t > Date.parse(e.ends_at) + 30 * 60_000) return null;
  const going = S().rsvps.some((r) => r.event_id === eventId && r.user_id === DEMO_ME && r.status === "going");
  return e.organizer_id === DEMO_ME || going ? e : null;
}

/** Sample drivers move along the drive's route, spaced out, looping (pitch only). */
function sampleDriver(points: readonly [number, number, number][], slot: number) {
  const n = points.length;
  const i = (Math.floor(Date.now() / 1500) + slot * Math.max(3, Math.floor(n / 5))) % n;
  const [lat, lng] = points[i]!;
  const [nlat, nlng] = points[(i + 1) % n]!;
  const heading = ((Math.atan2(nlng - lng, nlat - lat) * 180) / Math.PI + 360) % 360;
  return { lat, lng, heading: Math.round(heading) };
}

export const demoDriveService: DriveServiceApi = {
  share: (eventId, lat, lng, heading) =>
    K.run(() => {
      if (!live(eventId)) return K.refuse("driveNotLive");
      S().drivePositions = S().drivePositions.filter((p) => p.event_id !== eventId);
      S().drivePositions.push({ event_id: eventId, lat, lng, heading, updated_at: now() });
    }),
  stop: (eventId) =>
    K.run(() => {
      S().drivePositions = S().drivePositions.filter((p) => p.event_id !== eventId);
    }),
  positions: (eventId) =>
    K.run(() => {
      const e = live(eventId);
      if (!e) return [];
      const route = S().routes.find((r) => r.id === e.route_id);
      const points = (route?.points ?? []) as [number, number, number][];
      const others = [
        e.organizer_id,
        ...S()
          .rsvps.filter((r) => r.event_id === eventId && r.status === "going")
          .map((r) => r.user_id),
      ].filter((u, i, all) => u !== DEMO_ME && all.indexOf(u) === i && !K.blockedWith(u));
      const out: DrivePosition[] = points.length
        ? others.map((u, slot) => ({
            username: K.userById(u)!.username!,
            ...sampleDriver(points, slot),
            seconds_ago: 2 + slot,
            mine: false,
          }))
        : [];
      const mine = S().drivePositions.find(
        (p) => p.event_id === eventId && Date.now() - Date.parse(p.updated_at) < 5 * 60_000,
      );
      if (mine)
        out.push({
          username: K.userById(DEMO_ME)!.username!,
          lat: mine.lat,
          lng: mine.lng,
          heading: mine.heading,
          seconds_ago: Math.round((Date.now() - Date.parse(mine.updated_at)) / 1000),
          mine: true,
        });
      return out.sort((a, b) => a.username.localeCompare(b.username));
    }),
};
