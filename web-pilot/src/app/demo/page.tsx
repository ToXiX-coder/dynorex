import type { Metadata } from "next";
import Link from "next/link";
import { demoRecords, DEMO_VEHICLES } from "@/lib/demo";
import { btn, Card, PageTitle, SampleBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Demo garage" };

export default function DemoGarage() {
  return (
    <>
      <SampleBanner />
      <PageTitle sub="No login needed. Look around, change the filters, and see what a share page would show.">
        Demo garage
      </PageTitle>
      <ul className="grid gap-4 sm:grid-cols-2">
        {DEMO_VEHICLES.map((v) => (
          <li key={v.id}>
            <Card className="h-full space-y-2">
              <h2 className="text-xl font-bold">
                {v.year} {v.make} {v.model}
              </h2>
              {v.nickname && <p className="text-silver">“{v.nickname}”</p>}
              <p className="text-sm text-silver">
                {demoRecords(v.id).length} sample records · Private by default
              </p>
              <Link href={`/demo/${v.id}`} className={btn.primary}>
                Open
                <span className="sr-only">
                  {" "}
                  {v.year} {v.make} {v.model}
                </span>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-silver">
        Want your own garage? <Link href="/signup">Create a local-mode account</Link>.
      </p>
    </>
  );
}
