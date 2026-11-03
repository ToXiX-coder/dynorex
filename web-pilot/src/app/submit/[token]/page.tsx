import type { Metadata } from "next";
import { submitShopRecordAction } from "../../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle, SelectInput, TextArea, TextInput } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/labels";
import { getOpenRequest } from "@/lib/services";
import { getStore } from "@/lib/store";
import { MOD_STATUSES } from "@/lib/types";

export const metadata: Metadata = {
  title: "Send a record",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function SubmitRecord({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = getOpenRequest(getStore(), token);
  if (!req) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle>This link is not open</PageTitle>
        <p className="text-silver">
          It may have been used, expired, or turned off by the owner. Ask the owner for a new link.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="The owner will review this before it is added to their build record.">
        Send a record for a {req.year} {req.make} {req.model}
      </PageTitle>
      <p className="mb-4 rounded border border-line p-3 text-sm text-silver">
        This link works once. Your record will be labeled{" "}
        <strong className="text-bone">
          &ldquo;Submitted through a shared link. Sender identity not independently verified.&rdquo;
        </strong>{" "}
        Dynorex does not check who you are or the work. Please do not include customer names,
        plates, VINs, or addresses.
      </p>
      <Card>
        <ActionForm
          action={submitShopRecordAction.bind(null, token)}
          success={
            <>
              <p className="text-lg font-bold">✓ Sent to the owner</p>
              <p className="text-silver">
                They will review it. This link can&apos;t be used again.
              </p>
            </>
          }
        >
          <SelectInput
            label="What kind of record?"
            name="type"
            required
            defaultValue="service"
            options={[
              ["service", "Service / repair"],
              ["modification", "Modification"],
            ]}
          />
          <TextInput
            label="What was done?"
            name="title"
            required
            maxLength={120}
            hint="A short title, like “Front brake pads and rotors”."
          />
          <TextInput
            label="Category"
            name="category"
            required
            maxLength={60}
            hint="For example: Brakes, Suspension, Engine."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Part or service name" name="partName" maxLength={120} />
            <TextInput label="Brand" name="brand" maxLength={80} />
          </div>
          <TextInput label="Part number" name="partNumber" maxLength={80} />
          <SelectInput
            label="Status (modifications only)"
            name="status"
            blank="Not a modification"
            options={MOD_STATUSES.map((s) => [s, STATUS_LABELS[s]] as const)}
          />
          <TextInput
            label="Date of work"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <TextArea label="Notes" name="notes" maxLength={1000} />
          <TextInput
            label="Your name or shop (optional)"
            name="submitterLabel"
            maxLength={80}
            hint="Shown to the owner as typed. It is not checked."
          />
          <div aria-hidden="true" className="absolute -left-[9999px]">
            <label>
              Leave this empty
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <SubmitButton pending="Sending…">Send to owner</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
