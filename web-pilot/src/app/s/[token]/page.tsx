import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicVehicle } from "@/components/publicVehicle";
import { getPublicShare } from "@/lib/services";
import { getStore } from "@/lib/store";

// Never indexed, never followed, never cached.
export const metadata: Metadata = {
  title: "Shared build record",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function SharedVehicle({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = getPublicShare(getStore(), token);
  if (!view) notFound(); // unknown, revoked, expired: all look the same
  return (
    <>
      <PublicVehicle view={view} />
      <p className="mt-8 text-sm text-silver">
        Made with <Link href="/">Dynorex</Link>. This page is read-only.
      </p>
    </>
  );
}
