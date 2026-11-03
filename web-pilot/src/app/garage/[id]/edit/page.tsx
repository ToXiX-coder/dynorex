import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteVehicleAction, saveVehicleAction } from "../../../actions";
import { VehicleForm } from "@/components/entityForms";
import { ConfirmButton } from "@/components/forms";
import { Card, PageTitle } from "@/components/ui";
import { getVehicle } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Edit vehicle" };

export default async function EditVehicle({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let vehicle;
  try {
    vehicle = getVehicle(getStore(), user.id, id);
  } catch {
    notFound();
  }
  return (
    <div className="max-w-2xl space-y-8">
      <PageTitle>
        Edit {vehicle.year} {vehicle.make} {vehicle.model}
      </PageTitle>
      <Card>
        <VehicleForm action={saveVehicleAction.bind(null, id)} vehicle={vehicle} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Delete this vehicle</h2>
        <p className="text-sm text-silver">
          This deletes the vehicle, all of its records and attachments, and turns off every share
          and shop link. It cannot be undone.
        </p>
        <form action={deleteVehicleAction.bind(null, id)}>
          <ConfirmButton message="Delete this vehicle and everything attached to it? This cannot be undone.">
            Delete vehicle
          </ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
