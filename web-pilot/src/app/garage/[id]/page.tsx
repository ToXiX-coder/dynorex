import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicle, listRecords, listShareLinks } from "@/lib/services";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { FilterBar, parseFilter, Timeline } from "@/components/timeline";
import { btn, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Vehicle" };

export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const filter = parseFilter(await searchParams);
  const store = getStore();
  let data;
  try {
    data = {
      vehicle: getVehicle(store, user.id, id),
      items: listRecords(store, user.id, id, filter),
      pending: listRecords(store, user.id, id, { approval: "pending" }).length,
      live: listShareLinks(store, user.id, id).filter((l) => l.active).length,
    };
  } catch {
    notFound(); // same answer for "missing" and "not yours"
  }
  const { vehicle: v, items, pending, live } = data;
  return (
    <>
      <PageTitle
        sub={[
          v.nickname && `“${v.nickname}”`,
          v.mileage !== undefined && `${v.mileage.toLocaleString("en-US")} ${v.mileageUnit}`,
          live > 0 ? `Shared by ${live} active link${live > 1 ? "s" : ""}` : "Private",
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {v.year} {v.make} {v.model}
      </PageTitle>
      {v.photoAttachmentId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/attachments/${v.photoAttachmentId}`}
          alt={`Photo of your ${v.year} ${v.make} ${v.model}`}
          className="mb-6 max-h-72 w-full rounded-lg object-cover"
        />
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/garage/${id}/records/new`} className={btn.primary}>
          Add a record
        </Link>
        <Link href={`/garage/${id}/share`} className={btn.secondary}>
          Share and shop requests{pending > 0 && ` (${pending} to review)`}
        </Link>
        <Link href={`/garage/${id}/edit`} className={btn.secondary}>
          Edit vehicle
        </Link>
        <a href={`/api/export?vehicleId=${id}&format=csv`} className={btn.secondary}>
          Export CSV
        </a>
        <a href={`/api/export?vehicleId=${id}&format=json`} className={btn.secondary}>
          Export JSON
        </a>
      </div>
      <h2 className="mb-2 text-xl font-bold">Build timeline</h2>
      <FilterBar filter={filter} />
      <Timeline
        items={items}
        vehicleId={id}
        mode="owner"
        unit={v.mileageUnit}
        filtered={!!(filter.type || filter.status)}
      />
    </>
  );
}
