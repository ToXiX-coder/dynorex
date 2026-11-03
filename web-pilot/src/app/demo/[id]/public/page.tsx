import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoRecords, demoVehicle } from "@/lib/demo";
import { buildPublicView } from "@/lib/publicView";
import { PublicVehicle } from "@/components/publicVehicle";
import { btn, SampleBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Sample share page", robots: { index: false } };

export default async function DemoPublic({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = demoVehicle(id);
  if (!v) notFound();
  const records = demoRecords(id);
  // Sample owner chose: no costs, no notes, no part numbers. Records not chosen are left out.
  const view = buildPublicView(v, records, {
    fields: ["nickname"],
    recordIds: records.filter((r) => r.type !== "setup").map((r) => r.id),
    expiresAt: "2026-12-31T00:00:00Z",
  });
  return (
    <>
      <SampleBanner />
      <p className="mb-6 rounded border border-line p-3 text-sm text-silver">
        This is what a visitor sees. In this sample the owner left out costs, notes, part numbers,
        odometer readings, the VIN and the setup notes.
      </p>
      <PublicVehicle view={view} />
      <p className="mt-8">
        <Link href={`/demo/${id}`} className={btn.secondary}>
          Back to the owner view
        </Link>
      </p>
    </>
  );
}
