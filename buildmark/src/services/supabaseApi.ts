import * as Crypto from "expo-crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicRecord } from "@/domain/types";
import { ApiError, type Api } from "./api";
import { entryColumns, toEntry } from "./rows";

/** The real backend. Every rule is enforced by the database; this file only shapes calls and results. */
export function supabaseApi(sb: SupabaseClient): Api {
  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new ApiError(error.message || "network");
    return data as T;
  }
  async function uid(): Promise<string> {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new ApiError("not_signed_in");
    return data.user.id;
  }
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> => {
    if (error) throw new ApiError(error.message || "network");
    if (data == null) throw new ApiError("not_found");
    return data;
  };

  return {
    async myCars() {
      const rows = await rpc<Record<string, any>[]>("my_cars");
      return rows.map((r) => ({
        id: r.id,
        year: r.year,
        make: r.make,
        model: r.model,
        trim: r.trim_level,
        nickname: r.nickname,
        vin: r.vin,
        archived: r.archived,
      }));
    },
    async addCar(c) {
      const row = check(
        await sb
          .from("cars")
          .insert({ year: c.year, make: c.make, model: c.model, trim_level: c.trim, vin: c.vin })
          .select("id")
          .single(),
      );
      return row.id as string;
    },
    setVin: (carId, vin) => rpc("set_car_vin", { p_car: carId, p_vin: vin }),
    deleteCar: (carId) => rpc("delete_car", { p_car: carId }),

    async entries(carId) {
      const rows = check(await sb.from("entries").select("*").eq("car_id", carId).order("performed_on"));
      const ids = rows.map((r) => r.id as string);
      if (ids.length === 0) return [];
      const [receipts, confirmations, revisions] = await Promise.all([
        sb.from("receipts").select("*").in("entry_id", ids).is("removed_at", null).order("uploaded_at"),
        sb.from("confirmations").select("*").in("entry_id", ids).order("at", { ascending: false }),
        sb.from("entry_revisions").select("entry_id, rev, reason, changed, edited_at").in("entry_id", ids).order("edited_at"),
      ]);
      const by = (list: Record<string, any>[], id: string) => list.filter((x) => x.entry_id === id);
      const rec = check(receipts), con = check(confirmations), rev = check(revisions);
      return rows.map((e) => toEntry(e, { receipts: by(rec, e.id), confirmation: by(con, e.id)[0] ?? null, revisions: by(rev, e.id) }));
    },
    async addEntry(carId, input) {
      const row = check(await sb.from("entries").insert(entryColumns(carId, input)).select("id").single());
      return row.id as string;
    },
    reviseEntry: (entryId, patch, reason) => rpc("revise_entry", { p_entry: entryId, p_patch: patch, p_reason: reason }),
    withdrawEntry: (entryId, reason) => rpc("withdraw_entry", { p_entry: entryId, p_reason: reason }),

    async addReceipt(entryId, kind, file) {
      const me = await uid();
      const bytes = new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
      if (bytes.byteLength > 10 * 1024 * 1024) throw new ApiError("file_too_big");
      const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
      const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const ext = file.mimeType === "application/pdf" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg";
      const path = `${me}/${entryId}/${Crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("receipts").upload(path, bytes, { contentType: file.mimeType, upsert: false });
      if (up.error) throw new ApiError("upload_failed");
      await rpc("add_receipt", { p_entry: entryId, p_kind: kind, p_path: path, p_sha256: sha256, p_size: bytes.byteLength });
    },
    removeReceipt: (id) => rpc("remove_receipt", { p_receipt: id }),

    requestConfirmation: (entryId) => rpc<string>("request_confirmation", { p_entry: entryId }),
    myConfirmLink: (entryId) => rpc<string | null>("my_confirm_link", { p_entry: entryId }),
    async shopView(token) {
      const v = await rpc<Record<string, any>>("shop_view", { p_token: token });
      if (v.status === "not_found") return { status: "not_found" };
      const e = toEntry({ ...v.entry, id: "", rev: 0, created_at: "" });
      return { status: v.status, car: { ...v.car, trim: v.car.trim ?? null }, entry: e };
    },
    confirmInstall: (token, i) =>
      rpc("confirm_install", {
        p_token: token,
        p_decision: i.decision,
        p_shop_name: i.shopName,
        p_shop_city: i.shopCity,
        p_odometer: i.odometer,
        p_note: i.note,
      }),

    myShareLink: (carId) => rpc<string | null>("my_share_link", { p_car: carId }),
    createShareLink: (carId) => rpc<string>("create_share_link", { p_car: carId }),
    revokeShareLink: (carId) => rpc("revoke_share_link", { p_car: carId }),
    async publicRecord(token) {
      const r = await rpc<Record<string, any> | null>("public_record", { p_token: token });
      if (!r) return null;
      const rec: PublicRecord = {
        car: { year: r.car.year, make: r.car.make, model: r.car.model, trim: r.car.trim ?? null },
        owners: r.owners,
        ownerSince: r.owner_since,
        entries: (r.entries as Record<string, any>[]).map((e) => toEntry(e)),
      };
      return rec;
    },
    checkVin: (token, vin) => rpc("check_vin", { p_token: token, p_vin: vin }),

    startTransfer: (carId) => rpc<string>("start_transfer", { p_car: carId }),
    cancelTransfer: (carId) => rpc("cancel_transfer", { p_car: carId }),
    openTransfer: (carId) => rpc<string | null>("my_open_transfer", { p_car: carId }),
    async claimTransfer(code, vin) {
      const r = await rpc<{ status: any; car_id?: string }>("claim_transfer", { p_code: code, p_vin: vin });
      return { status: r.status, carId: r.car_id };
    },
  };
}
