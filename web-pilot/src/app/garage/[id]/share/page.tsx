import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createRequestAction,
  createShareLinkAction,
  makePrivateAction,
  reviewRecordAction,
  revokeLinkAction,
} from "../../../actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { btn, Card, PageTitle, SelectInput, SourceNote, StatusBadge } from "@/components/ui";
import { SHARE_FIELD_LABELS, TYPE_LABELS } from "@/lib/labels";
import { getVehicle, listRecords, listRequests, listShareLinks } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { SHARE_FIELDS } from "@/lib/types";

export const metadata: Metadata = { title: "Share and shop requests" };

const when = (iso: string) => iso.slice(0, 10);

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const store = getStore();
  let d;
  try {
    d = {
      v: getVehicle(store, user.id, id),
      records: listRecords(store, user.id, id),
      pending: listRecords(store, user.id, id, { approval: "pending" }),
      links: listShareLinks(store, user.id, id),
      reqs: listRequests(store, user.id, id),
    };
  } catch {
    notFound();
  }
  const { v, records, pending, links, reqs } = d;
  const live = links.filter((l) => l.active).length + reqs.filter((r) => r.state === "open").length;

  return (
    <div className="max-w-3xl space-y-8">
      <PageTitle
        sub={
          <Link href={`/garage/${id}`}>
            ← Back to {v.year} {v.make} {v.model}
          </Link>
        }
      >
        Share and shop requests
      </PageTitle>

      <Card className="space-y-3">
        <h2 className="text-xl font-bold">
          Privacy status: {live > 0 ? `${live} live link${live > 1 ? "s" : ""}` : "Private"}
        </h2>
        <p className="text-sm text-silver">
          {live > 0
            ? "Anyone with a live link can open it. Revoke a link below, or make the whole vehicle private."
            : "No one but you can see this vehicle. Links below are the only way to share it."}
        </p>
        {live > 0 && (
          <form action={makePrivateAction.bind(null, id)}>
            <ConfirmButton
              message="Turn off every share link and shop request for this vehicle?"
              variant="secondary"
            >
              Make private now
            </ConfirmButton>
          </form>
        )}
      </Card>

      {pending.length > 0 && (
        <section aria-labelledby="review" className="space-y-3">
          <h2 id="review" className="text-xl font-bold">
            Waiting for your review ({pending.length})
          </h2>
          <p className="text-sm text-silver">
            These were sent through a one-time link. Nothing here appears on your timeline or share
            pages until you approve it.
          </p>
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2">
                  <p className="text-sm text-silver">
                    {TYPE_LABELS[r.type]} · <time dateTime={r.date}>{r.date}</time>{" "}
                    {r.status && <StatusBadge status={r.status} />}
                  </p>
                  <h3 className="font-bold">{r.title}</h3>
                  <p className="text-sm">
                    {[r.category, r.partName, r.brand, r.partNumber].filter(Boolean).join(" · ")}
                  </p>
                  {r.notes && <p className="whitespace-pre-wrap text-sm">{r.notes}</p>}
                  {r.submitterLabel && (
                    <p className="text-sm text-silver">
                      Sender typed: “{r.submitterLabel}” (not checked)
                    </p>
                  )}
                  <SourceNote source={r.source} />
                  <div className="flex flex-wrap gap-3 pt-1">
                    <form
                      action={reviewRecordAction.bind(null, id, r.id)}
                      className="flex flex-wrap gap-3"
                    >
                      <button name="decision" value="approve" className={btn.primary}>
                        Approve<span className="sr-only">: {r.title}</span>
                      </button>
                      <button name="decision" value="reject" className={btn.danger}>
                        Reject and delete<span className="sr-only">: {r.title}</span>
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mk" className="space-y-3">
        <h2 id="mk" className="text-xl font-bold">
          Create a read-only share link
        </h2>
        {records.length === 0 ? (
          <p className="rounded border border-dashed border-silver p-4 text-silver">
            Add at least one record before you create a share link.
          </p>
        ) : (
          <Card>
            <ActionForm action={createShareLinkAction.bind(null, id)} resetOnSuccess>
              <fieldset className="space-y-1">
                <legend className="font-semibold">1. Choose the entries to share</legend>
                {records.map((r) => (
                  <label key={r.id} className="flex min-h-11 items-start gap-3 py-1">
                    <input type="checkbox" name="recordIds" value={r.id} className="mt-1 size-5" />
                    <span className="text-sm">
                      <span className="font-semibold">{r.title}</span>{" "}
                      <span className="text-silver">
                        · {r.date} · {TYPE_LABELS[r.type]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-1">
                <legend className="font-semibold">2. Add optional details (off by default)</legend>
                {SHARE_FIELDS.map((f) => (
                  <label key={f} className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name="fields" value={f} className="size-5" />
                    <span className="text-sm">{SHARE_FIELD_LABELS[f]}</span>
                  </label>
                ))}
              </fieldset>
              <SelectInput
                label="3. Link expires after"
                name="days"
                required
                defaultValue="7"
                options={[
                  ["1", "1 day"],
                  ["7", "7 days"],
                  ["30", "30 days"],
                  ["90", "90 days"],
                ]}
              />
              <div className="rounded border border-line p-3 text-sm" role="note">
                <p className="font-semibold">Before you copy: what the link shows</p>
                <ul className="mt-1 list-disc pl-5 text-silver">
                  <li>
                    Visitors can read the entries you ticked: title, category, status, date, part
                    name, brand, and the source label.
                  </li>
                  <li>Plus the optional details you ticked above.</li>
                  <li>
                    Never shown: VIN, your email, attachments, exact location, or costs you did not
                    tick.
                  </li>
                  <li>
                    Read-only, hidden from search engines, expires on its own, and you can revoke it
                    any time.
                  </li>
                </ul>
              </div>
              <SubmitButton pending="Creating…">Create share link</SubmitButton>
            </ActionForm>
          </Card>
        )}
        <LinkList
          items={links.map((l) => ({
            id: l.id,
            title: `${l.entryCount} ${l.entryCount === 1 ? "entry" : "entries"}${l.fields.length ? ` + ${l.fields.map((f) => SHARE_FIELD_LABELS[f].toLowerCase()).join(", ")}` : ""}`,
            state: l.revokedAt ? "revoked" : l.active ? "active" : "expired",
            meta: `created ${when(l.createdAt)}, expires ${when(l.expiresAt)}`,
          }))}
          action={revokeLinkAction.bind(null, id, "share")}
          empty="No share links yet."
        />
      </section>

      <section aria-labelledby="rq" className="space-y-3">
        <h2 id="rq" className="text-xl font-bold">
          Request a shop record
        </h2>
        <p className="text-sm text-silver">
          Make a one-time link for a shop (or anyone) to send you one record for this vehicle, from
          their phone, with no app. You review it before it appears. Whatever they send is labeled
          &ldquo;Submitted through a shared link, sender identity not independently verified.&rdquo;
          Dynorex does not check who they are, and shops cannot attach files in this pilot.
        </p>
        <Card>
          <ActionForm action={createRequestAction.bind(null, id)} resetOnSuccess>
            <SelectInput
              label="Link expires after"
              name="days"
              required
              defaultValue="7"
              options={[
                ["1", "1 day"],
                ["7", "7 days"],
                ["14", "14 days"],
              ]}
            />
            <p className="text-sm text-silver">
              The sender will see only your car&apos;s year, make and model. Not your VIN, nickname,
              email, or other records.
            </p>
            <SubmitButton pending="Creating…">Create one-time link</SubmitButton>
          </ActionForm>
        </Card>
        <LinkList
          items={reqs.map((r) => ({
            id: r.id,
            title: "One-time shop link",
            state: r.state === "open" ? "active" : r.state,
            meta: `created ${when(r.createdAt)}, expires ${when(r.expiresAt)}`,
          }))}
          action={revokeLinkAction.bind(null, id, "request")}
          empty="No shop links yet."
        />
      </section>
    </div>
  );
}

function LinkList({
  items,
  action,
  empty,
}: {
  items: { id: string; title: string; state: string; meta: string }[];
  action: (id: string) => Promise<void>;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-silver">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li
          key={i.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3"
        >
          <div className="text-sm">
            <p className="font-semibold">
              {i.title}{" "}
              <span className="rounded border border-silver px-2 py-0.5 text-xs">
                {i.state === "active"
                  ? "● Active"
                  : i.state === "used"
                    ? "✓ Used"
                    : i.state === "revoked"
                      ? "✕ Revoked"
                      : "◌ Expired"}
              </span>
            </p>
            <p className="text-silver">{i.meta}</p>
          </div>
          {i.state === "active" && (
            <form action={action.bind(null, i.id)}>
              <ConfirmButton
                message="Revoke this link? It stops working immediately."
                variant="secondary"
              >
                Revoke
              </ConfirmButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
