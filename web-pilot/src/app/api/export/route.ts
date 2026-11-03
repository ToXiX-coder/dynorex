import { currentUser } from "@/lib/session";
import { AppError } from "@/lib/security";
import { exportOwnerData, recordsToCsv } from "@/lib/services";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const vehicleId = url.searchParams.get("vehicleId") ?? undefined;
  try {
    const data = exportOwnerData(getStore(), user.id, vehicleId);
    const stamp = new Date().toISOString().slice(0, 10);
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (format === "csv") {
      return new Response("﻿" + recordsToCsv(data), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dynorex-records-${stamp}.csv"`,
        },
      });
    }
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dynorex-export-${stamp}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
