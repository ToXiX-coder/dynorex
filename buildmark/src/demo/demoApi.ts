import { normalizeClaimCode } from "@/domain/codes";
import { confirmBlock } from "@/domain/compliance";
import type { EntryInput } from "@/domain/entryForm";
import type { Entry } from "@/domain/types";
import { normalizeVin } from "@/domain/vin";
import { ApiError, type Api } from "@/services/api";
import { claimableCar, DEMO_CLAIM, seed, type DemoCar } from "./data";

/**
 * The sample-data twin of the Supabase API: in memory, no network, same rules as the database
 * (append-only edits, the emissions rule for shop links, VIN-gated transfers).
 */
const wait = () => new Promise((r) => setTimeout(r, 120));
const hex = () => Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const now = () => new Date().toISOString();

const COLS: Record<string, keyof Entry> = {
  category: "category", title: "title", part_brand: "partBrand", part_number: "partNumber", carb_eo: "carbEo",
  compliance: "compliance", installer_type: "installerType", installer_name: "installerName",
  performed_on: "performedOn", odometer: "odometer", odometer_unit: "odometerUnit", cost_cents: "costCents",
  notes: "notes", dyno_whp: "dynoWhp", dyno_wtq: "dynoWtq",
};

export function demoApi(): Api {
  let { cars, entries, shopLinks } = seed();
  let claimed = false;
  let transferCode: { carId: string; code: string } | null = null;
  let ids = 100;

  const car = (id: string): DemoCar => {
    const c = cars.find((x) => x.id === id);
    if (!c) throw new ApiError("not_found");
    return c;
  };
  const owned = (id: string) => {
    const c = car(id);
    if (c.archived) throw new ApiError("not_owner");
    return c;
  };
  const entry = (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new ApiError("not_found");
    owned(e.carId);
    return e;
  };
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  return {
    async myCars() {
      await wait();
      return clone(cars.map(({ id, year, make, model, trim, nickname, vin, archived }) => ({
        id, year, make, model, trim, nickname, vin: archived ? null : vin, archived,
      })));
    },
    async addCar(c) {
      await wait();
      const id = `demo-car${++ids}`;
      cars.unshift({ ...c, id, nickname: null, archived: false, owners: 1, ownerSince: now(), shareToken: null, transferExpires: null });
      return id;
    },
    async setVin(carId, vin) {
      const c = owned(carId);
      if (c.vin) throw new ApiError("vin_already_set");
      c.vin = normalizeVin(vin);
    },
    async deleteCar(carId) {
      const c = owned(carId);
      if (c.owners > 1) throw new ApiError("has_history");
      cars = cars.filter((x) => x.id !== carId);
      entries = entries.filter((e) => e.carId !== carId);
    },
    async entries(carId) {
      await wait();
      car(carId);
      return clone(entries.filter((e) => e.carId === carId).sort((a, b) => a.performedOn.localeCompare(b.performedOn)));
    },
    async addEntry(carId, input: EntryInput) {
      await wait();
      owned(carId);
      const id = `demo-e${++ids}`;
      entries.push({
        ...input, id, carId, rev: 1, createdAt: now(), withdrawnAt: null, withdrawReason: null,
        receipts: [], confirmation: null, revisions: [],
      });
      return id;
    },
    async reviseEntry(entryId, patch, reason) {
      await wait();
      const e = entry(entryId);
      if (e.withdrawnAt) throw new ApiError("withdrawn");
      if (!reason.trim()) throw new ApiError("reason_required");
      const changed = Object.keys(patch).filter((k) => COLS[k] && e[COLS[k]!] !== patch[k]);
      if (changed.length === 0) throw new ApiError("no_change");
      e.revisions.push({ rev: e.rev, at: now(), reason: reason.trim(), changed });
      for (const k of changed) (e as unknown as Record<string, unknown>)[COLS[k]!] = patch[k];
      e.rev += 1;
    },
    async withdrawEntry(entryId, reason) {
      const e = entry(entryId);
      e.withdrawnAt = now();
      e.withdrawReason = reason.trim() || null;
    },
    async addReceipt(entryId, kind) {
      await wait();
      const e = entry(entryId);
      if (e.receipts.length >= 6) throw new ApiError("receipt_limit");
      e.receipts.push({ id: `demo-r${++ids}`, kind, uploadedAt: now(), sha256: hex() });
    },
    async removeReceipt(receiptId) {
      const e = entries.find((x) => x.receipts.some((r) => r.id === receiptId));
      if (!e) throw new ApiError("not_found");
      entry(e.id);
      const r = e.receipts.find((x) => x.id === receiptId)!;
      e.receipts = e.receipts.filter((x) => x.id !== receiptId);
      e.revisions.push({
        rev: e.rev, at: now(), changed: ["receipts"],
        reason: `Removed a ${r.kind === "receipt" ? "receipt" : "dyno sheet"} uploaded ${r.uploadedAt.slice(0, 10)}`,
      });
    },

    async requestConfirmation(entryId) {
      await wait();
      const e = entry(entryId);
      const block = confirmBlock(e);
      if (block) throw new ApiError(block);
      const open = Object.entries(shopLinks).find(([, l]) => l.entryId === entryId && l.rev === e.rev && !l.closed);
      if (open) return open[0];
      for (const l of Object.values(shopLinks)) if (l.entryId === entryId) l.closed = true;
      const token = hex();
      shopLinks[token] = { entryId, rev: e.rev, closed: false };
      return token;
    },
    async myConfirmLink(entryId) {
      const e = entry(entryId);
      return Object.entries(shopLinks).find(([, l]) => l.entryId === entryId && l.rev === e.rev && !l.closed)?.[0] ?? null;
    },
    async shopView(token) {
      await wait();
      const l = shopLinks[token];
      if (!l) return { status: "not_found" };
      const e = entries.find((x) => x.id === l.entryId)!;
      const c = car(e.carId);
      return {
        status: l.closed ? "closed" : e.rev !== l.rev || e.withdrawnAt ? "changed" : "open",
        car: { year: c.year, make: c.make, model: c.model, trim: c.trim },
        entry: clone(e),
      };
    },
    async confirmInstall(token, i) {
      await wait();
      const l = shopLinks[token];
      if (!l) return "not_found";
      if (l.closed) return "closed";
      const e = entries.find((x) => x.id === l.entryId)!;
      if (e.rev !== l.rev || e.withdrawnAt) return "changed";
      if (i.decision === "confirmed" && confirmBlock(e)) return "not_allowed";
      e.confirmation = { ...i, at: now(), rev: e.rev };
      l.closed = true;
      return "ok";
    },

    async myShareLink(carId) {
      return owned(carId).shareToken;
    },
    async createShareLink(carId) {
      const c = owned(carId);
      c.shareToken ??= hex();
      return c.shareToken;
    },
    async revokeShareLink(carId) {
      owned(carId).shareToken = null;
    },
    async publicRecord(token) {
      await wait();
      const c = cars.find((x) => x.shareToken === token && !x.archived);
      if (!c) return null;
      return clone({
        car: { year: c.year, make: c.make, model: c.model, trim: c.trim },
        owners: c.owners,
        ownerSince: c.ownerSince,
        entries: entries
          .filter((e) => e.carId === c.id)
          .sort((a, b) => a.performedOn.localeCompare(b.performedOn))
          .map((e) => ({ ...e, costCents: null, notes: null })),
      });
    },
    async checkVin(token, vin) {
      await wait();
      const c = cars.find((x) => x.shareToken === token && !x.archived);
      if (!c) return "not_found";
      if (!c.vin) return "no_vin_on_record";
      return c.vin === normalizeVin(vin) ? "match" : "no_match";
    },

    async startTransfer(carId) {
      const c = owned(carId);
      if (!c.vin) throw new ApiError("vin_required");
      transferCode = { carId, code: "K7RM-4XQ2" };
      c.transferExpires = new Date(Date.now() + 14 * 86_400_000).toISOString();
      return transferCode.code;
    },
    async cancelTransfer(carId) {
      owned(carId).transferExpires = null;
      transferCode = null;
    },
    async openTransfer(carId) {
      return owned(carId).transferExpires;
    },
    async claimTransfer(code, vin) {
      await wait();
      if (normalizeClaimCode(code) !== DEMO_CLAIM.code || claimed) return { status: "code_invalid" };
      if (normalizeVin(vin) !== DEMO_CLAIM.vin) return { status: "vin_mismatch" };
      claimed = true;
      const next = claimableCar();
      cars.unshift(next.car);
      entries.push(...next.entries);
      return { status: "ok", carId: next.car.id };
    },
  };
}
