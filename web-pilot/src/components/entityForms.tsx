import Link from "next/link";
import type { FormState } from "@/app/actions";
import { SOURCE_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { RecordView } from "@/lib/services";
import { ACCEPT_ATTR, MAX_FILES_PER_RECORD, MAX_UPLOAD_BYTES } from "@/lib/upload";
import { CURRENCIES, MOD_STATUSES, OWNER_SOURCES, RECORD_TYPES, type Vehicle } from "@/lib/types";
import { ActionForm, SubmitButton } from "./forms";
import { btn, Field, inputCls, SelectInput, TextArea, TextInput } from "./ui";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;
const MB = MAX_UPLOAD_BYTES / 1024 / 1024;

export function VehicleForm({ action, vehicle }: { action: Action; vehicle?: Vehicle }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="Year"
          name="year"
          type="number"
          inputMode="numeric"
          min={1886}
          max={new Date().getFullYear() + 2}
          required
          defaultValue={vehicle?.year}
        />
        <TextInput label="Make" name="make" required maxLength={50} defaultValue={vehicle?.make} />
        <TextInput
          label="Model"
          name="model"
          required
          maxLength={50}
          defaultValue={vehicle?.model}
        />
      </div>
      <TextInput
        label="Nickname"
        name="nickname"
        maxLength={60}
        defaultValue={vehicle?.nickname}
        hint="Optional."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Odometer"
          name="mileage"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={vehicle?.mileage}
          hint="Optional."
        />
        <SelectInput
          label="Units"
          name="mileageUnit"
          defaultValue={vehicle?.mileageUnit ?? "mi"}
          options={[
            ["mi", "Miles"],
            ["km", "Kilometres"],
          ]}
        />
      </div>
      <TextInput
        label="VIN"
        name="vin"
        maxLength={17}
        minLength={17}
        pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}"
        defaultValue={vehicle?.vin}
        autoComplete="off"
        hint="Optional. Private: only you see it. It is never put on a share page. Leave it blank if you prefer."
      />
      <Field
        label="Vehicle photo"
        name="photo"
        hint={`Optional. JPG, PNG or WebP, up to ${MB} MB.`}
      >
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="photo-hint"
          className={inputCls}
        />
      </Field>
      {vehicle?.photoAttachmentId && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="removePhoto" className="size-5" /> Remove the current photo
        </label>
      )}
      <p className="text-sm text-silver">Dynorex does not collect license plates or location.</p>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending="Saving…">{vehicle ? "Save changes" : "Add vehicle"}</SubmitButton>
        <Link href={vehicle ? `/garage/${vehicle.id}` : "/garage"} className={btn.secondary}>
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}

export function RecordForm({
  action,
  record,
  vehicleId,
}: {
  action: Action;
  record?: RecordView;
  vehicleId: string;
}) {
  const statusOptions = [
    ...MOD_STATUSES.map((s) => [s, STATUS_LABELS[s]] as const),
    ["completed", STATUS_LABELS.completed] as const,
  ];
  return (
    <ActionForm action={action}>
      <SelectInput
        label="Record type"
        name="type"
        required
        defaultValue={record?.type ?? "modification"}
        options={RECORD_TYPES.map((t) => [t, TYPE_LABELS[t]] as const)}
      />
      <TextInput label="Title" name="title" required maxLength={120} defaultValue={record?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Category"
          name="category"
          required
          maxLength={60}
          defaultValue={record?.category}
          hint="For example: Suspension, Engine, Brakes."
        />
        <SelectInput
          label="Status"
          name="status"
          blank="No status"
          defaultValue={record?.status}
          options={statusOptions}
          hint="Modifications need a status. Service records are completed. Setup notes have none."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="Part or service name"
          name="partName"
          maxLength={120}
          defaultValue={record?.partName}
        />
        <TextInput label="Brand" name="brand" maxLength={80} defaultValue={record?.brand} />
        <TextInput
          label="Part number"
          name="partNumber"
          maxLength={80}
          defaultValue={record?.partNumber}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Date"
          name="date"
          type="date"
          required
          defaultValue={record?.date ?? new Date().toISOString().slice(0, 10)}
        />
        <TextInput
          label="Odometer"
          name="mileage"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={record?.mileage}
          hint="Optional."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Cost"
          name="cost"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={
            record?.costCents !== undefined ? (record.costCents / 100).toFixed(2) : undefined
          }
          hint="Optional. Only shared if you tick it on a share link."
        />
        <SelectInput
          label="Currency"
          name="currency"
          defaultValue={record?.currency ?? "USD"}
          options={CURRENCIES.map((c) => [c, c] as const)}
        />
      </div>
      <TextArea label="Notes" name="notes" maxLength={2000} defaultValue={record?.notes} />

      <fieldset className="space-y-2 rounded border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Source label</legend>
        {OWNER_SOURCES.map((s) => (
          <label key={s} className="flex items-start gap-3 py-1">
            <input
              type="radio"
              name="source"
              value={s}
              defaultChecked={(record?.source ?? "owner_entered") === s}
              className="mt-1 size-5"
            />
            <span className="text-sm">
              <span className="font-semibold">{SOURCE_LABELS[s].short}.</span>{" "}
              {SOURCE_LABELS[s].long.split(": ")[1] ?? ""}
            </span>
          </label>
        ))}
        <p className="text-sm text-silver">
          &ldquo;Measurement attached&rdquo; needs at least one attached file. Records sent by a
          shop through a link get their own label automatically.
        </p>
      </fieldset>

      <fieldset className="space-y-2 rounded border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Attachments</legend>
        {record?.attachments.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="removeAttachment" value={a.id} className="size-5" />
            <span>
              Remove{" "}
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
                {a.displayName}
              </a>
            </span>
          </label>
        ))}
        <Field
          label="Add files (receipt, invoice, dyno sheet, alignment sheet…)"
          name="files"
          hint={`JPG, PNG, WebP or PDF. Up to ${MAX_FILES_PER_RECORD} files, ${MB} MB each. Files stay private to you.`}
        >
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            aria-describedby="files-hint"
            className={inputCls}
          />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <SubmitButton pending="Saving…">{record ? "Save changes" : "Add record"}</SubmitButton>
        <Link href={`/garage/${vehicleId}`} className={btn.secondary}>
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}
