import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoRecordViews, demoVehicle } from "@/lib/demo";
import { sortAndFilter } from "@/lib/services";
import { FilterBar, parseFilter, Timeline } from "@/components/timeline";
import { btn, PageTitle, SampleBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Demo vehicle" };

export default async function DemoVehicle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const v = demoVehicle(id);
  if (!v) notFound();
  const filter = parseFilter(await searchParams);
  const items = sortAndFilter(demoRecordViews(id), filter);
  return (
    <>
      <SampleBanner />
      <PageTitle
        sub={`${v.mileage?.toLocaleString("en-US")} ${v.mileageUnit} · Private by default`}
      >
        {v.year} {v.make} {v.model}
      </PageTitle>
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/demo/${id}/public`} className={btn.primary}>
          See a sample share page
        </Link>
        <Link href="/demo" className={btn.secondary}>
          Back to demo garage
        </Link>
      </div>
      <h2 className="mb-2 text-xl font-bold">Build timeline</h2>
      <FilterBar filter={filter} />
      <Timeline
        items={items}
        vehicleId={id}
        mode="demo"
        unit={v.mileageUnit}
        filtered={!!(filter.type || filter.status)}
      />
    </>
  );
}
