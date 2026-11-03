import { currentUser } from "@/lib/session";
import { AppError } from "@/lib/security";
import { readAttachment } from "@/lib/services";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Owner-only. Attachments are never served on public share pages. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  try {
    const { meta, bytes } = readAttachment(getStore(), user.id, id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": meta.mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(meta.displayName)}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
