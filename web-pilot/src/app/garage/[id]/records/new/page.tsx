import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveRecordAction } from "../../../../actions";
import { RecordForm } from "@/components/entityForms";
import { Card, PageTitle } from "@/components/ui";
import { getVehicle } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Add a record" };

export default async function NewRecord({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    getVehicle(getStore(), user.id, id);
  } catch {
    notFound();
  }
  return (
    <div className="max-w-2xl">
      <PageTitle>Add a record</PageTitle>
      <Card>
        <RecordForm action={saveRecordAction.bind(null, id, null)} vehicleId={id} />
      </Card>
    </div>
  );
}
