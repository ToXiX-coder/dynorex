import type { Metadata } from "next";
import Link from "next/link";
import { logInAction } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle, TextInput } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default function Login() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>Log in</PageTitle>
      <Card>
        <ActionForm action={logInAction}>
          <TextInput label="Email" name="email" type="email" autoComplete="email" required />
          <TextInput
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <SubmitButton pending="Logging in…">Log in</SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-4 text-sm text-silver">
        No account? <Link href="/signup">Create one</Link>. Or{" "}
        <Link href="/demo">try the demo</Link>.
      </p>
      <p className="mt-4 rounded border border-line p-3 text-sm text-silver">
        Local pilot mode: accounts live in this install&apos;s own storage. This sign-in is not a
        production identity system.
      </p>
    </div>
  );
}
