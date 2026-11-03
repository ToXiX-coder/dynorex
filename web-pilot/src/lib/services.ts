import type { z } from "zod";
import { SOURCE_LABELS } from "./labels";
import {
  credentialsSchema,
  PILOT_CONSENT_TEXT,
  pilotSchema,
  recordSchema,
  shareLinkSchema,
  submissionSchema,
  vehicleSchema,
} from "./schemas";
import {
  AppError,
  addDays,
  hashPassword,
  hashToken,
  newId,
  newToken,
  nowIso,
  rateLimit,
  verifyPassword,
} from "./security";
import type { DataStore } from "./store";
import type { Attachment, Db, RecordStatus, RecordType, Vehicle, VehicleRecord } from "./types";
import { buildPublicView, type PublicVehicleView } from "./publicView";
import { MAX_FILES_PER_RECORD, validateUpload, type IncomingFile } from "./upload";

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new AppError(
    "invalid",
    "Some details need fixing.",
    r.error.issues.map((i) => ({ path: i.path.join(".") || "form", message: i.message })),
  );
}

const SESSION_DAYS = 30;
const notFound = (what = "That item") => new AppError("not_found", `${what} was not found.`);

// ---------------------------------------------------------------- auth (LOCAL MODE)

export async function signUp(store: DataStore, raw: unknown): Promise<string> {
  if (process.env.DYNOREX_ALLOW_SIGNUP === "false")
    throw new AppError("forbidden", "Signups are closed.");
  const { email, password } = parse(credentialsSchema, raw);
  const passwordHash = await hashPassword(password);
  return store.write((db) => {
    if (db.users.some((u) => u.email === email)) {
      throw new AppError("conflict", "Could not create that account. Try logging in instead.");
    }
    const id = newId();
    db.users.push({ id, email, passwordHash, createdAt: nowIso() });
    return id;
  });
}

export async function logIn(
  store: DataStore,
  raw: unknown,
): Promise<{ token: string; userId: string }> {
  const { email, password } = parse(credentialsSchema, raw);
  rateLimit(`login:${email}`, 8, 10 * 60_000);
  const user = store.read((db) => db.users.find((u) => u.email === email));
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw new AppError("invalid", "Email or password is not right.");
  const token = newToken();
  store.write((db) => {
    db.sessions = db.sessions.filter((s) => s.expiresAt > nowIso());
    db.sessions.push({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: addDays(SESSION_DAYS),
    });
  });
  return { token, userId: user.id };
}

export function userForSession(store: DataStore, token: string | undefined) {
  if (!token) return null;
  const h = hashToken(token);
  return store.read((db) => {
    const s = db.sessions.find((x) => x.tokenHash === h && x.expiresAt > nowIso());
    const u = s && db.users.find((x) => x.id === s.userId);
    return u ? { id: u.id, email: u.email } : null;
  });
}

export function logOut(store: DataStore, token: string | undefined) {
  if (!token) return;
  const h = hashToken(token);
  store.write((db) => {
    db.sessions = db.sessions.filter((s) => s.tokenHash !== h);
  });
}

// ---------------------------------------------------------------- ownership helpers

function ownVehicle(db: Readonly<Db>, ownerId: string, vehicleId: string): Vehicle {
  const v = db.vehicles.find((x) => x.id === vehicleId && x.ownerId === ownerId);
  if (!v) throw notFound("That vehicle");
  return v;
}

function ownRecord(db: Readonly<Db>, ownerId: string, recordId: string): VehicleRecord {
  const r = db.records.find((x) => x.id === recordId && x.ownerId === ownerId);
  if (!r) throw notFound("That record");
  return r;
}

function dropAttachments(store: DataStore, db: Db, pick: (a: Attachment) => boolean) {
  for (const a of db.attachments.filter(pick)) store.deleteFile(a.storageKey);
  db.attachments = db.attachments.filter((a) => !pick(a));
}

function makeAttachment(
  ownerId: string,
  vehicleId: string,
  recordId: string | null,
  f: IncomingFile,
  imageOnly = false,
) {
  const { mime, displayName } = validateUpload(f, imageOnly);
  const id = newId();
  const att: Attachment = {
    id,
    ownerId,
    vehicleId,
    recordId,
    storageKey: `${ownerId}/${id}`,
    displayName,
    mime,
    size: f.size,
    uploadedById: ownerId,
    createdAt: nowIso(),
  };
  return { att, bytes: f.bytes };
}

// ---------------------------------------------------------------- vehicles

export const listVehicles = (store: DataStore, ownerId: string) =>
  store.read((db) =>
    db.vehicles
      .filter((v) => v.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((v) => ({
        ...v,
        recordCount: db.records.filter((r) => r.vehicleId === v.id && r.approval === "approved")
          .length,
        pendingCount: db.records.filter((r) => r.vehicleId === v.id && r.approval === "pending")
          .length,
        activeLinkCount: db.shareLinks.filter((l) => l.vehicleId === v.id && isActiveLink(l))
          .length,
      })),
  );

export const getVehicle = (store: DataStore, ownerId: string, vehicleId: string) =>
  store.read((db) => ownVehicle(db, ownerId, vehicleId));

export function createVehicle(
  store: DataStore,
  ownerId: string,
  raw: unknown,
  photo?: IncomingFile,
): string {
  const input = parse(vehicleSchema, raw);
  const att = photo ? makeAttachment(ownerId, "pending", null, photo, true) : undefined;
  const id = newId();
  if (att) {
    att.att.vehicleId = id;
    store.putFile(att.att.storageKey, att.bytes);
  }
  try {
    store.write((db) => {
      const now = nowIso();
      db.vehicles.push({
        id,
        ownerId,
        ...input,
        photoAttachmentId: att?.att.id,
        createdAt: now,
        updatedAt: now,
      });
      if (att) db.attachments.push(att.att);
    });
  } catch (e) {
    if (att) store.deleteFile(att.att.storageKey);
    throw e;
  }
  return id;
}

export function updateVehicle(
  store: DataStore,
  ownerId: string,
  vehicleId: string,
  raw: unknown,
  opts: { photo?: IncomingFile; removePhoto?: boolean } = {},
) {
  const input = parse(vehicleSchema, raw);
  const att = opts.photo ? makeAttachment(ownerId, vehicleId, null, opts.photo, true) : undefined;
  store.read((db) => ownVehicle(db, ownerId, vehicleId));
  if (att) store.putFile(att.att.storageKey, att.bytes);
  store.write((db) => {
    const v = ownVehicle(db, ownerId, vehicleId);
    Object.assign(v, input, { updatedAt: nowIso() });
    if (!input.nickname) delete v.nickname;
    if (!input.vin) delete v.vin;
    if (input.mileage === undefined) delete v.mileage;
    if (att || opts.removePhoto) {
      dropAttachments(store, db, (a) => a.vehicleId === vehicleId && a.recordId === null);
      v.photoAttachmentId = att?.att.id;
      if (att) db.attachments.push(att.att);
    }
  });
}

export function deleteVehicle(store: DataStore, ownerId: string, vehicleId: string) {
  store.write((db) => {
    ownVehicle(db, ownerId, vehicleId);
    dropAttachments(store, db, (a) => a.vehicleId === vehicleId);
    db.records = db.records.filter((r) => r.vehicleId !== vehicleId);
    db.shareLinks = db.shareLinks.filter((l) => l.vehicleId !== vehicleId);
    db.requests = db.requests.filter((r) => r.vehicleId !== vehicleId);
    db.vehicles = db.vehicles.filter((v) => v.id !== vehicleId);
  });
}

// ---------------------------------------------------------------- records

export interface RecordView extends VehicleRecord {
  attachments: Pick<Attachment, "id" | "displayName" | "mime" | "size">[];
  sourceLabel: string;
}

export interface RecordFilter {
  type?: RecordType;
  status?: RecordStatus;
  sort?: "newest" | "oldest";
}

export function sortAndFilter<T extends VehicleRecord>(rows: T[], f: RecordFilter = {}): T[] {
  const out = rows.filter(
    (r) => (!f.type || r.type === f.type) && (!f.status || r.status === f.status),
  );
  const dir = f.sort === "oldest" ? 1 : -1;
  return out.sort(
    (a, b) => dir * (a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
  );
}

function toView(db: Readonly<Db>, r: VehicleRecord): RecordView {
  return {
    ...r,
    attachments: db.attachments
      .filter((a) => a.recordId === r.id)
      .map(({ id, displayName, mime, size }) => ({ id, displayName, mime, size })),
    sourceLabel: SOURCE_LABELS[r.source].long,
  };
}

export const listRecords = (
  store: DataStore,
  ownerId: string,
  vehicleId: string,
  filter: RecordFilter & { approval?: "approved" | "pending" } = {},
): RecordView[] =>
  store.read((db) => {
    ownVehicle(db, ownerId, vehicleId);
    const rows = db.records.filter(
      (r) =>
        r.vehicleId === vehicleId &&
        r.ownerId === ownerId &&
        r.approval === (filter.approval ?? "approved"),
    );
    return sortAndFilter(rows, filter).map((r) => toView(db, r));
  });

export const getRecord = (store: DataStore, ownerId: string, recordId: string): RecordView =>
  store.read((db) => toView(db, ownRecord(db, ownerId, recordId)));

function applyRecordInput(r: VehicleRecord, input: z.output<typeof recordSchema>) {
  const { cost, ...rest } = input;
  Object.assign(r, rest, { costCents: cost === undefined ? undefined : Math.round(cost * 100) });
  for (const k of [
    "partName",
    "brand",
    "partNumber",
    "status",
    "mileage",
    "costCents",
    "currency",
    "notes",
  ] as const) {
    if (r[k] === undefined) delete r[k];
  }
}

export function createRecord(
  store: DataStore,
  ownerId: string,
  vehicleId: string,
  raw: unknown,
  files: IncomingFile[] = [],
): string {
  const input = parse(recordSchema, raw);
  if (files.length > MAX_FILES_PER_RECORD) {
    throw new AppError("invalid", `Attach at most ${MAX_FILES_PER_RECORD} files.`, [
      { path: "files", message: "Too many files" },
    ]);
  }
  if (input.source === "measurement_attached" && files.length === 0) {
    throw new AppError("invalid", 'Attach the measurement file, or choose "Owner-entered".', [
      { path: "source", message: "A measurement label needs an attached file" },
    ]);
  }
  store.read((db) => ownVehicle(db, ownerId, vehicleId));
  const id = newId();
  const atts = files.map((f) => makeAttachment(ownerId, vehicleId, id, f));
  atts.forEach((a) => store.putFile(a.att.storageKey, a.bytes));
  try {
    store.write((db) => {
      ownVehicle(db, ownerId, vehicleId);
      const now = nowIso();
      const rec = {
        id,
        vehicleId,
        ownerId,
        approval: "approved",
        identityCheckedAt: null,
        createdAt: now,
        updatedAt: now,
      } as VehicleRecord;
      applyRecordInput(rec, input);
      db.records.push(rec);
      db.attachments.push(...atts.map((a) => a.att));
    });
  } catch (e) {
    atts.forEach((a) => store.deleteFile(a.att.storageKey));
    throw e;
  }
  return id;
}

export function updateRecord(
  store: DataStore,
  ownerId: string,
  recordId: string,
  raw: unknown,
  files: IncomingFile[] = [],
  removeAttachmentIds: string[] = [],
) {
  const input = parse(recordSchema, raw);
  const existing = store.read((db) => ownRecord(db, ownerId, recordId));
  if (existing.source === "shared_link") {
    throw new AppError(
      "conflict",
      "Records sent through a shared link can be approved or deleted, but not edited.",
    );
  }
  const atts = files.map((f) => makeAttachment(ownerId, existing.vehicleId, recordId, f));
  atts.forEach((a) => store.putFile(a.att.storageKey, a.bytes));
  try {
    store.write((db) => {
      const rec = ownRecord(db, ownerId, recordId);
      const remaining =
        db.attachments.filter((a) => a.recordId === recordId && !removeAttachmentIds.includes(a.id))
          .length + atts.length;
      if (remaining > MAX_FILES_PER_RECORD)
        throw new AppError("invalid", `Attach at most ${MAX_FILES_PER_RECORD} files.`);
      if (input.source === "measurement_attached" && remaining === 0) {
        throw new AppError("invalid", "A measurement label needs an attached file.", [
          { path: "source", message: "A measurement label needs an attached file" },
        ]);
      }
      dropAttachments(
        store,
        db,
        (a) => a.recordId === recordId && removeAttachmentIds.includes(a.id),
      );
      db.attachments.push(...atts.map((a) => a.att));
      applyRecordInput(rec, input);
      rec.updatedAt = nowIso();
    });
  } catch (e) {
    atts.forEach((a) => store.deleteFile(a.att.storageKey));
    throw e;
  }
}

export function deleteRecord(store: DataStore, ownerId: string, recordId: string) {
  store.write((db) => {
    ownRecord(db, ownerId, recordId);
    dropAttachments(store, db, (a) => a.recordId === recordId);
    db.records = db.records.filter((r) => r.id !== recordId);
    for (const l of db.shareLinks) l.recordIds = l.recordIds.filter((id) => id !== recordId);
  });
}

// ---------------------------------------------------------------- attachments (owner only)

export function readAttachment(store: DataStore, ownerId: string, attachmentId: string) {
  const meta = store.read((db) =>
    db.attachments.find((a) => a.id === attachmentId && a.ownerId === ownerId),
  );
  if (!meta) throw notFound("That file");
  const bytes = store.getFile(meta.storageKey);
  if (!bytes) throw notFound("That file");
  return { meta, bytes };
}

// ---------------------------------------------------------------- sharing

const isActiveLink = (l: { revokedAt: string | null; expiresAt: string }) =>
  !l.revokedAt && l.expiresAt > nowIso();

export function createShareLink(
  store: DataStore,
  ownerId: string,
  vehicleId: string,
  raw: unknown,
) {
  const input = parse(shareLinkSchema, raw);
  const token = newToken();
  const expiresAt = addDays(input.days);
  store.write((db) => {
    ownVehicle(db, ownerId, vehicleId);
    const ok = new Set(
      db.records
        .filter(
          (r) => r.vehicleId === vehicleId && r.ownerId === ownerId && r.approval === "approved",
        )
        .map((r) => r.id),
    );
    if (input.recordIds.length === 0) {
      throw new AppError("invalid", "Choose at least one entry to share.", [
        { path: "recordIds", message: "Choose at least one entry" },
      ]);
    }
    if (!input.recordIds.every((id) => ok.has(id))) throw notFound("One of those records");
    db.shareLinks.push({
      id: newId(),
      vehicleId,
      ownerId,
      tokenHash: hashToken(token),
      fields: input.fields,
      recordIds: input.recordIds,
      expiresAt,
      revokedAt: null,
      createdAt: nowIso(),
    });
  });
  return { token, expiresAt };
}

export const listShareLinks = (store: DataStore, ownerId: string, vehicleId: string) =>
  store.read((db) => {
    ownVehicle(db, ownerId, vehicleId);
    return db.shareLinks
      .filter((l) => l.vehicleId === vehicleId && l.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, fields, recordIds, expiresAt, revokedAt, createdAt }) => ({
        id,
        fields,
        entryCount: recordIds.length,
        expiresAt,
        revokedAt,
        createdAt,
        active: isActiveLink({ revokedAt, expiresAt }),
      }));
  });

export function revokeShareLink(store: DataStore, ownerId: string, linkId: string) {
  store.write((db) => {
    const l = db.shareLinks.find((x) => x.id === linkId && x.ownerId === ownerId);
    if (!l) throw notFound("That link");
    l.revokedAt ??= nowIso();
  });
}

/** "Private" means no live links. This closes every share link and shop request for the vehicle. */
export function makeVehiclePrivate(store: DataStore, ownerId: string, vehicleId: string) {
  store.write((db) => {
    ownVehicle(db, ownerId, vehicleId);
    const now = nowIso();
    for (const l of db.shareLinks) if (l.vehicleId === vehicleId && !l.revokedAt) l.revokedAt = now;
    for (const r of db.requests) if (r.vehicleId === vehicleId && !r.revokedAt) r.revokedAt = now;
  });
}

/** Same `null` for unknown, revoked, expired or deleted, so callers cannot tell them apart. */
export function getPublicShare(store: DataStore, token: string): PublicVehicleView | null {
  if (!token || token.length > 100) return null;
  const h = hashToken(token);
  return store.read((db) => {
    const link = db.shareLinks.find((l) => l.tokenHash === h);
    if (!link || !isActiveLink(link)) return null;
    const vehicle = db.vehicles.find((v) => v.id === link.vehicleId && v.ownerId === link.ownerId);
    if (!vehicle) return null;
    return buildPublicView(
      vehicle,
      db.records.filter((r) => r.vehicleId === vehicle.id),
      link,
    );
  });
}

// ---------------------------------------------------------------- shop record requests

export function createRecordRequest(
  store: DataStore,
  ownerId: string,
  vehicleId: string,
  days: number,
) {
  if (![1, 7, 14].includes(days)) throw new AppError("invalid", "Pick 1, 7 or 14 days.");
  const token = newToken();
  const expiresAt = addDays(days);
  store.write((db) => {
    ownVehicle(db, ownerId, vehicleId);
    db.requests.push({
      id: newId(),
      vehicleId,
      ownerId,
      tokenHash: hashToken(token),
      expiresAt,
      revokedAt: null,
      usedAt: null,
      recordId: null,
      createdAt: nowIso(),
    });
  });
  return { token, expiresAt };
}

export const listRequests = (store: DataStore, ownerId: string, vehicleId: string) =>
  store.read((db) => {
    ownVehicle(db, ownerId, vehicleId);
    return db.requests
      .filter((r) => r.vehicleId === vehicleId && r.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        state: r.revokedAt
          ? ("revoked" as const)
          : r.usedAt
            ? ("used" as const)
            : r.expiresAt <= nowIso()
              ? ("expired" as const)
              : ("open" as const),
      }));
  });

export function revokeRequest(store: DataStore, ownerId: string, requestId: string) {
  store.write((db) => {
    const r = db.requests.find((x) => x.id === requestId && x.ownerId === ownerId);
    if (!r) throw notFound("That request");
    r.revokedAt ??= nowIso();
  });
}

const requestIsOpen = (r: Db["requests"][number]) =>
  !r.revokedAt && !r.usedAt && r.expiresAt > nowIso();

/** Only the car's year/make/model are shown to the sender. Never nickname, VIN, or owner details. */
export function getOpenRequest(store: DataStore, token: string) {
  if (!token || token.length > 100) return null;
  const h = hashToken(token);
  return store.read((db) => {
    const req = db.requests.find((r) => r.tokenHash === h);
    if (!req || !requestIsOpen(req)) return null;
    const v = db.vehicles.find((x) => x.id === req.vehicleId && x.ownerId === req.ownerId);
    return v ? { year: v.year, make: v.make, model: v.model, expiresAt: req.expiresAt } : null;
  });
}

export function submitViaRequest(store: DataStore, token: string, raw: unknown): void {
  if (!token || token.length > 100) throw notFound("This link");
  const h = hashToken(token);
  rateLimit(`submit:${h}`, 20, 10 * 60_000);
  const input = parse(submissionSchema, raw);
  store.write((db) => {
    const req = db.requests.find((r) => r.tokenHash === h);
    // vehicle and owner come from the stored request, never from the form
    if (
      !req ||
      !requestIsOpen(req) ||
      !db.vehicles.some((v) => v.id === req.vehicleId && v.ownerId === req.ownerId)
    ) {
      throw new AppError("not_found", "This link is no longer open. Ask the owner for a new one.");
    }
    const now = nowIso();
    const id = newId();
    db.records.push({
      id,
      vehicleId: req.vehicleId,
      ownerId: req.ownerId,
      type: input.type,
      title: input.title,
      category: input.category,
      partName: input.partName,
      brand: input.brand,
      partNumber: input.partNumber,
      status: input.status,
      date: input.date,
      notes: input.notes,
      source: "shared_link",
      approval: "pending",
      submitterLabel: input.submitterLabel,
      requestId: req.id,
      identityCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    req.usedAt = now;
    req.recordId = id;
  });
}

export function approveRecord(store: DataStore, ownerId: string, recordId: string) {
  store.write((db) => {
    const r = ownRecord(db, ownerId, recordId);
    if (r.approval !== "pending")
      throw new AppError("conflict", "That record is not waiting for review.");
    r.approval = "approved";
    r.updatedAt = nowIso();
  });
}

export function rejectRecord(store: DataStore, ownerId: string, recordId: string) {
  store.write((db) => {
    const r = ownRecord(db, ownerId, recordId);
    if (r.approval !== "pending")
      throw new AppError("conflict", "That record is not waiting for review.");
    db.records = db.records.filter((x) => x.id !== recordId);
  });
}

// ---------------------------------------------------------------- export and deletion

export function exportOwnerData(store: DataStore, ownerId: string, vehicleId?: string) {
  return store.read((db) => {
    if (vehicleId) ownVehicle(db, ownerId, vehicleId);
    const vehicles = db.vehicles.filter(
      (v) => v.ownerId === ownerId && (!vehicleId || v.id === vehicleId),
    );
    const ids = new Set(vehicles.map((v) => v.id));
    const records = db.records
      .filter((r) => r.ownerId === ownerId && ids.has(r.vehicleId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        ...toView(db, r),
        cost: r.costCents === undefined ? undefined : r.costCents / 100,
      }));
    return {
      exportedAt: nowIso(),
      note: "Owner-entered or attached records. Dynorex does not independently verify them.",
      vehicles,
      records,
    };
  });
}

const csvCell = (v: unknown) => {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export function recordsToCsv(data: ReturnType<typeof exportOwnerData>): string {
  const byId = new Map(data.vehicles.map((v) => [v.id, v]));
  const head = [
    "vehicle",
    "vin",
    "date",
    "type",
    "status",
    "title",
    "category",
    "part_or_service",
    "brand",
    "part_number",
    "odometer",
    "mileage_unit",
    "cost",
    "currency",
    "notes",
    "source",
    "approval",
    "attachments",
  ];
  const rows = data.records.map((r) => {
    const v = byId.get(r.vehicleId);
    return [
      v ? `${v.year} ${v.make} ${v.model}` : "",
      v?.vin,
      r.date,
      r.type,
      r.status,
      r.title,
      r.category,
      r.partName,
      r.brand,
      r.partNumber,
      r.mileage,
      v?.mileageUnit,
      r.cost,
      r.currency,
      r.notes,
      SOURCE_LABELS[r.source].short,
      r.approval,
      r.attachments.map((a) => a.displayName).join("; "),
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}

export function deleteAccount(store: DataStore, ownerId: string) {
  store.write((db) => {
    dropAttachments(store, db, (a) => a.ownerId === ownerId);
    db.records = db.records.filter((r) => r.ownerId !== ownerId);
    db.shareLinks = db.shareLinks.filter((l) => l.ownerId !== ownerId);
    db.requests = db.requests.filter((r) => r.ownerId !== ownerId);
    db.vehicles = db.vehicles.filter((v) => v.ownerId !== ownerId);
    db.sessions = db.sessions.filter((s) => s.userId !== ownerId);
    db.users = db.users.filter((u) => u.id !== ownerId);
  });
}

// ---------------------------------------------------------------- shop pilot interest

export function submitPilotInterest(store: DataStore, raw: unknown, honeypot = "") {
  if (honeypot.trim() !== "") return; // bots fill hidden fields; pretend it worked
  rateLimit("pilot", 30, 60 * 60_000);
  const { consent: _consent, ...input } = parse(pilotSchema, raw);
  store.write((db) => {
    const now = nowIso();
    db.interests.push({
      id: newId(),
      ...input,
      consentAt: now,
      consentText: PILOT_CONSENT_TEXT,
      createdAt: now,
    });
  });
}
