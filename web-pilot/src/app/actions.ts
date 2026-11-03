"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/security";
import * as svc from "@/lib/services";
import { endSession, requireUser, setSessionCookie, siteOrigin } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { IncomingFile } from "@/lib/upload";

export interface FormState {
  error?: string;
  issues?: { path: string; message: string }[];
  message?: string;
  /** One-time URL shown right after a link is created. The raw token is not stored. */
  linkUrl?: string;
  linkNote?: string;
}

const store = () => getStore();

/** Turn expected errors into form messages. Redirects and real bugs pass through. */
async function run(fn: () => Promise<FormState | void> | FormState | void): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, issues: e.issues };
    throw e;
  }
}

const fields = (fd: FormData, skip: string[] = []) => {
  const o: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of fd.entries())
    if (typeof v === "string" && !skip.includes(k) && !k.startsWith("$ACTION")) o[k] = v;
  return o;
};

async function filesFrom(fd: FormData, name: string): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const v of fd.getAll(name)) {
    if (typeof v === "string" || (v.size === 0 && !v.name)) continue;
    out.push({
      name: v.name,
      type: v.type,
      size: v.size,
      bytes: new Uint8Array(await v.arrayBuffer()),
    });
  }
  return out;
}

// ------------------------------------------------------------ auth (local mode)

export async function signUpAction(_: FormState, fd: FormData) {
  return run(async () => {
    const data = fields(fd);
    await svc.signUp(store(), data);
    const { token } = await svc.logIn(store(), data);
    await setSessionCookie(token);
    redirect("/garage");
  });
}

export async function logInAction(_: FormState, fd: FormData) {
  return run(async () => {
    const { token } = await svc.logIn(store(), fields(fd));
    await setSessionCookie(token);
    redirect("/garage");
  });
}

export async function logOutAction() {
  await endSession();
  redirect("/");
}

// ------------------------------------------------------------ vehicles

export async function saveVehicleAction(vehicleId: string | null, _: FormState, fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const photo = (await filesFrom(fd, "photo"))[0];
    const data = fields(fd, ["removePhoto"]);
    let id = vehicleId;
    if (id)
      svc.updateVehicle(store(), user.id, id, data, {
        photo,
        removePhoto: fd.get("removePhoto") === "on",
      });
    else id = svc.createVehicle(store(), user.id, data, photo);
    revalidatePath("/garage", "layout");
    redirect(`/garage/${id}`);
  });
}

export async function deleteVehicleAction(vehicleId: string) {
  const user = await requireUser();
  svc.deleteVehicle(store(), user.id, vehicleId);
  revalidatePath("/garage", "layout");
  redirect("/garage");
}

// ------------------------------------------------------------ records

export async function saveRecordAction(
  vehicleId: string,
  recordId: string | null,
  _: FormState,
  fd: FormData,
) {
  const user = await requireUser();
  return run(async () => {
    const files = await filesFrom(fd, "files");
    const data = fields(fd, ["removeAttachment"]);
    if (recordId) {
      svc.updateRecord(
        store(),
        user.id,
        recordId,
        data,
        files,
        fd.getAll("removeAttachment").map(String),
      );
    } else {
      svc.createRecord(store(), user.id, vehicleId, data, files);
    }
    revalidatePath("/garage", "layout");
    redirect(`/garage/${vehicleId}`);
  });
}

export async function deleteRecordAction(vehicleId: string, recordId: string) {
  const user = await requireUser();
  svc.deleteRecord(store(), user.id, recordId);
  revalidatePath("/garage", "layout");
  redirect(`/garage/${vehicleId}`);
}

export async function reviewRecordAction(vehicleId: string, recordId: string, fd: FormData) {
  const user = await requireUser();
  if (fd.get("decision") === "approve") svc.approveRecord(store(), user.id, recordId);
  else svc.rejectRecord(store(), user.id, recordId);
  revalidatePath("/garage", "layout");
  redirect(`/garage/${vehicleId}/share`);
}

// ------------------------------------------------------------ sharing and shop requests

export async function createShareLinkAction(vehicleId: string, _: FormState, fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const { token, expiresAt } = svc.createShareLink(store(), user.id, vehicleId, {
      days: fd.get("days"),
      fields: fd.getAll("fields"),
      recordIds: fd.getAll("recordIds"),
    });
    revalidatePath(`/garage/${vehicleId}`, "layout");
    return {
      linkUrl: `${await siteOrigin()}/s/${token}`,
      linkNote: `Read-only. Not indexed by search engines. Expires ${expiresAt.slice(0, 10)}. Copy it now: for safety, Dynorex cannot show this link again. You can revoke it any time.`,
    };
  });
}

export async function createRequestAction(vehicleId: string, _: FormState, fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const { token, expiresAt } = svc.createRecordRequest(
      store(),
      user.id,
      vehicleId,
      Number(fd.get("days")),
    );
    revalidatePath(`/garage/${vehicleId}`, "layout");
    return {
      linkUrl: `${await siteOrigin()}/submit/${token}`,
      linkNote: `One-time link. Whoever has it can send ONE record for this vehicle. You review it before it appears. Expires ${expiresAt.slice(0, 10)}. Copy it now: Dynorex cannot show it again.`,
    };
  });
}

export async function revokeLinkAction(vehicleId: string, kind: "share" | "request", id: string) {
  const user = await requireUser();
  if (kind === "share") svc.revokeShareLink(store(), user.id, id);
  else svc.revokeRequest(store(), user.id, id);
  revalidatePath(`/garage/${vehicleId}`, "layout");
  redirect(`/garage/${vehicleId}/share`);
}

export async function makePrivateAction(vehicleId: string) {
  const user = await requireUser();
  svc.makeVehiclePrivate(store(), user.id, vehicleId);
  revalidatePath(`/garage/${vehicleId}`, "layout");
  redirect(`/garage/${vehicleId}/share`);
}

/** Public: anyone holding a valid one-time link. Ownership comes from the stored link, never the form. */
export async function submitShopRecordAction(token: string, _: FormState, fd: FormData) {
  return run(async () => {
    if (String(fd.get("website") ?? "").trim() !== "") return { message: "sent" }; // bot trap
    svc.submitViaRequest(getStore(), token, fields(fd, ["website"]));
    return { message: "sent" };
  });
}

// ------------------------------------------------------------ account and pilot

export async function deleteAccountAction(_: FormState, fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    if (fd.get("confirm") !== "DELETE") {
      throw new AppError("invalid", "Type DELETE (capital letters) to confirm.");
    }
    svc.deleteAccount(store(), user.id);
    await endSession();
    redirect("/?deleted=1");
  });
}

export async function pilotInterestAction(_: FormState, fd: FormData) {
  return run(() => {
    svc.submitPilotInterest(getStore(), fields(fd, ["website"]), String(fd.get("website") ?? ""));
    return { message: "saved" };
  });
}
