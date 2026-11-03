import type { Metadata } from "next";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GarageLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
