import type { Metadata } from "next";
import { deleteAccountAction } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { btn, Card, PageTitle, TextInput } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function Account() {
  const user = await requireUser();
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle sub={`Signed in as ${user.email}`}>Account</PageTitle>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Export your data</h2>
        <p className="text-sm text-silver">
          Everything you entered, including your private VIN and costs. Only your own data is
          included.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=csv" className={btn.secondary}>
            Download CSV
          </a>
          <a href="/api/export?format=json" className={btn.secondary}>
            Download JSON
          </a>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Delete my account and data</h2>
        <p className="text-sm text-silver">
          This permanently deletes your account, vehicles, records, attachments, and every share and
          shop link. It cannot be undone. Export first if you want a copy.
        </p>
        <ActionForm action={deleteAccountAction}>
          <TextInput label="Type DELETE to confirm" name="confirm" required autoComplete="off" />
          <SubmitButton variant="danger" pending="Deleting…">
            Delete everything
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
