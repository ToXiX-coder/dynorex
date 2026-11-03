import type { Metadata } from "next";
import Link from "next/link";
import { signUpAction } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle, TextInput } from "@/components/ui";

export const metadata: Metadata = { title: "Create account" };

export default function Signup() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="Your garage is private by default.">Create account</PageTitle>
      <Card>
        <ActionForm action={signUpAction}>
          <TextInput
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            hint="Used only to log in. Never shown on share pages."
          />
          <TextInput
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            hint="At least 10 characters."
          />
          <SubmitButton pending="Creating…">Create account</SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-4 text-sm text-silver">
        Already have one? <Link href="/login">Log in</Link>.
      </p>
      <p className="mt-4 rounded border border-line p-3 text-sm text-silver">
        Local pilot mode: accounts live in this install&apos;s own storage. There is no password
        reset or email sending. This is not a production identity system.
      </p>
    </div>
  );
}
