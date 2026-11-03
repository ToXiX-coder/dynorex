import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRecordAction, saveRecordAction } from "../../../../../actions";
import { RecordForm } from "@/components/entityForms";
import { ConfirmButton } from "@/components/forms";
import { Card, PageTitle } from "@/components/ui";
import { getRecord } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Edit record" };

export default async function EditRecord({
  params,
}: {
  params: Promise<{ id: string; rid: string }>;
}) {
  const user = await requireUser();
  const { id, rid } = await params;
  let record;
  try {
    record = getRecord(getStore(), user.id, rid);
  } catch {
    notFound();
  }
  // The record must belong to the vehicle in the URL, and to this user.
  if (record.vehicleId !== id || record.source === "shared_link") notFound();
  return (
    <div className="max-w-2xl space-y-8">
      <PageTitle>Edit record</PageTitle>
      <Card>
        <RecordForm action={saveRecordAction.bind(null, id, rid)} record={record} vehicleId={id} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Delete this record</h2>
        <p className="text-sm text-silver">
          This also deletes its attachments and removes it from share links.
        </p>
        <form action={deleteRecordAction.bind(null, id, rid)}>
          <ConfirmButton message="Delete this record and its attachments? This cannot be undone.">
            Delete record
          </ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
