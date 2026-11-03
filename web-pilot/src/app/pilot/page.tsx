import type { Metadata } from "next";
import { pilotInterestAction } from "../actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle, TextArea, TextInput } from "@/components/ui";
import { PILOT_CONSENT_TEXT } from "@/lib/schemas";

export const metadata: Metadata = { title: "Join the shop pilot" };

export default function Pilot() {
  return (
    <div className="max-w-2xl">
      <PageTitle sub="Dynorex is testing whether a simple record link is useful to shops and owners. This is a conversation, not a contract. No shop has agreed to anything yet.">
        Join the shop pilot
      </PageTitle>
      <Card>
        <ActionForm
          action={pilotInterestAction}
          success={
            <>
              <p className="text-lg font-bold">✓ Got it. Your details are saved.</p>
              <p className="text-silver">
                Local pilot mode: this MVP does not send email, so nothing was emailed. The
                submission is stored and a person would need to read it and reach out.
              </p>
            </>
          }
        >
          <TextInput
            label="Shop name"
            name="shopName"
            required
            maxLength={120}
            autoComplete="organization"
          />
          <TextInput
            label="Contact name"
            name="contactName"
            required
            maxLength={80}
            autoComplete="name"
          />
          <TextInput
            label="Email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
          <TextInput label="City or region" name="region" required maxLength={80} />
          <TextArea
            label="What kind of work do you do?"
            name="workType"
            required
            maxLength={300}
            rows={3}
            hint="For example: suspension, tuning, restoration, brakes."
          />
          <div aria-hidden="true" className="absolute -left-[9999px]">
            <label>
              Leave this empty
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="consent" required className="mt-1 size-5" />
            <span className="text-sm">{PILOT_CONSENT_TEXT}</span>
          </label>
          <SubmitButton pending="Sending…">Send my details</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
