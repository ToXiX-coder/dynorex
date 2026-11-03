import type { Metadata } from "next";
import Link from "next/link";
import { listVehicles } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { btn, Card, EmptyState, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "My garage" };

export default async function Garage() {
  const user = await requireUser();
  const vehicles = listVehicles(getStore(), user.id);
  return (
    <>
      <PageTitle sub="Everything here is private until you create a share link.">
        My garage
      </PageTitle>
      {vehicles.length === 0 ? (
        <EmptyState title="Your garage is empty">
          <p>
            Add your first vehicle to start a build record. Only year, make and model are required.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/garage/new" className={btn.primary}>
              Add a vehicle
            </Link>
            <Link href="/demo" className={btn.secondary}>
              Look at the sample garage first
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <p className="mb-4">
            <Link href="/garage/new" className={btn.primary}>
              Add a vehicle
            </Link>
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Card className="flex h-full flex-col gap-2">
                  {v.photoAttachmentId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/attachments/${v.photoAttachmentId}`}
                      alt={`Photo of your ${v.year} ${v.make} ${v.model}`}
                      className="h-40 w-full rounded object-cover"
                    />
                  )}
                  <h2 className="text-xl font-bold">
                    {v.year} {v.make} {v.model}
                  </h2>
                  {v.nickname && <p className="text-silver">“{v.nickname}”</p>}
                  <p className="text-sm text-silver">
                    {v.recordCount} {v.recordCount === 1 ? "record" : "records"}
                    {v.pendingCount > 0 && ` · ${v.pendingCount} waiting for review`}
                    {" · "}
                    {v.activeLinkCount > 0
                      ? `Shared by ${v.activeLinkCount} active link${v.activeLinkCount > 1 ? "s" : ""}`
                      : "Private"}
                  </p>
                  <div className="mt-auto pt-2">
                    <Link href={`/garage/${v.id}`} className={btn.primary}>
                      Open
                      <span className="sr-only">
                        {" "}
                        {v.year} {v.make} {v.model}
                      </span>
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
