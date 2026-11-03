import type { Metadata } from "next";
import { saveVehicleAction } from "../../actions";
import { VehicleForm } from "@/components/entityForms";
import { Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Add a vehicle" };

export default function NewVehicle() {
  return (
    <div className="max-w-2xl">
      <PageTitle>Add a vehicle</PageTitle>
      <Card>
        <VehicleForm action={saveVehicleAction.bind(null, null)} />
      </Card>
    </div>
  );
}
