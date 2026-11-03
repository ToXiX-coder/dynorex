import type { Approval, RecordStatus, RecordType, ShareField, Source } from "./types";

export const SOURCE_LABELS: Record<Source, { short: string; long: string }> = {
  owner_entered: {
    short: "Owner-entered",
    long: "Owner-entered: typed or uploaded by the owner.",
  },
  shared_link: {
    short: "Submitted through a shared link",
    long: "Submitted through a shared link. Sender identity not independently verified.",
  },
  measurement_attached: {
    short: "Measurement attached",
    long: "Measurement attached: a named measurement file is attached. Dynorex has not reproduced or validated it.",
  },
};

export const TYPE_LABELS: Record<RecordType, string> = {
  modification: "Modification",
  service: "Service / repair",
  setup: "Setup note",
};

export const STATUS_LABELS: Record<RecordStatus, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_progress: "In progress",
  installed: "Installed",
  removed: "Removed",
  completed: "Completed",
};

export const APPROVAL_LABELS: Record<Approval, string> = {
  approved: "Approved",
  pending: "Waiting for your review",
};

export const SHARE_FIELD_LABELS: Record<ShareField, string> = {
  nickname: "Nickname",
  mileage: "Odometer readings",
  partNumbers: "Part numbers",
  cost: "Costs",
  notes: "Notes",
};

export const NO_VERIFY_NOTE =
  "Dynorex keeps records. It does not independently check the vehicle, the parts, the work, or the people who submit it.";
