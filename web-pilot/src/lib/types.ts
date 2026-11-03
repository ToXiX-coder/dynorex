export const RECORD_TYPES = ["modification", "service", "setup"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const MOD_STATUSES = ["planned", "ordered", "in_progress", "installed", "removed"] as const;
export const STATUSES = [...MOD_STATUSES, "completed"] as const;
export type RecordStatus = (typeof STATUSES)[number];

/** Owners may pick the first two. `shared_link` is only ever set by the system. */
export const SOURCES = ["owner_entered", "shared_link", "measurement_attached"] as const;
export type Source = (typeof SOURCES)[number];

export const OWNER_SOURCES = ["owner_entered", "measurement_attached"] as const;

/** Rejected shop submissions are deleted, so there is no "rejected" state. */
export const APPROVALS = ["approved", "pending"] as const;
export type Approval = (typeof APPROVALS)[number];

export const SHARE_FIELDS = ["nickname", "mileage", "partNumbers", "cost", "notes"] as const;
export type ShareField = (typeof SHARE_FIELDS)[number];

export const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD"] as const;
export const UNITS = ["mi", "km"] as const;
export type Unit = (typeof UNITS)[number];

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  /** SHA-256 of the cookie token. The raw token is never stored. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  year: number;
  make: string;
  model: string;
  nickname?: string;
  /** Private. Never included in public share views. */
  vin?: string;
  mileage?: number;
  mileageUnit: Unit;
  photoAttachmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleRecord {
  id: string;
  vehicleId: string;
  ownerId: string;
  type: RecordType;
  title: string;
  category: string;
  partName?: string;
  brand?: string;
  partNumber?: string;
  status?: RecordStatus;
  /** YYYY-MM-DD */
  date: string;
  mileage?: number;
  costCents?: number;
  currency?: string;
  notes?: string;
  source: Source;
  approval: Approval;
  /** Set for records that came in through a shop link. Unchecked, as typed by the sender. */
  submitterLabel?: string;
  requestId?: string;
  /** Stays null unless a real identity-check process exists. Nothing sets it today. */
  identityCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  ownerId: string;
  vehicleId: string;
  /** null for the vehicle photo. */
  recordId: string | null;
  storageKey: string;
  displayName: string;
  mime: string;
  size: number;
  uploadedById: string;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  vehicleId: string;
  ownerId: string;
  tokenHash: string;
  fields: ShareField[];
  recordIds: string[];
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface RecordRequest {
  id: string;
  vehicleId: string;
  ownerId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  /** Set when the link has been used. Links are one-time. */
  usedAt: string | null;
  recordId: string | null;
  createdAt: string;
}

export interface ShopPilotInterest {
  id: string;
  shopName: string;
  contactName: string;
  email: string;
  region: string;
  workType: string;
  consentAt: string;
  consentText: string;
  createdAt: string;
}

export interface Db {
  users: User[];
  sessions: Session[];
  vehicles: Vehicle[];
  records: VehicleRecord[];
  attachments: Attachment[];
  shareLinks: ShareLink[];
  requests: RecordRequest[];
  interests: ShopPilotInterest[];
}

export const emptyDb = (): Db => ({
  users: [],
  sessions: [],
  vehicles: [],
  records: [],
  attachments: [],
  shareLinks: [],
  requests: [],
  interests: [],
});
