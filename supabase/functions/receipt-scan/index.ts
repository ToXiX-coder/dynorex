// POST /functions/v1/receipt-scan
// Body: { image: base64 JPEG } (the app re-encodes the photo first, so no location or camera data).
// D-68: reads a receipt and returns the fields for the Add mod form (part, brand, part number, amount, date, shop).
// Runs AS the signed-in user, rate-limited by receipt_scan_allow() before any model call. The photo goes to
// Anthropic (ANTHROPIC_API_KEY, an Edge Function secret) and nothing is stored or logged: not the image, not the
// result. The owner checks every field before saving; the receipt itself is filed only if they attach it.
// NOT YET RUN: needs Deno + Supabase + the secret (see docs/receipt-scan.md).
import Anthropic from "npm:@anthropic-ai/sdk";
import { errorResponse, HttpError, userClient } from "../_shared/auth.ts";
import { acceptImage } from "../_shared/image.ts";
import { cleanReceipt, RECEIPT_MODEL, RECEIPT_SYSTEM, RECEIPT_TOOL } from "../_shared/receipt.ts";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const client = apiKey ? new Anthropic({ apiKey }) : null;
// the phone sends at most a 2048 px JPEG; anything much bigger isn't from the app
const MAX_BYTES = 6 * 1024 * 1024;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    if (!client) throw new HttpError(503, "Receipt scanning isn't connected yet");
    const sb = userClient(req);
    const { data: who, error } = await sb.auth.getUser();
    if (error || !who.user) throw new HttpError(401, "You've been logged out");

    const body = (await req.json().catch(() => null)) as { image?: unknown } | null;
    const b64 = typeof body?.image === "string" ? body.image : "";
    if (!b64 || b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) throw new HttpError(400, "That photo didn't make it. Try again.");
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      throw new HttpError(400, "That photo didn't make it. Try again.");
    }
    // the same byte check as uploads: a real JPEG, size limits, no metadata
    if (!acceptImage(bytes, "jpg").ok) throw new HttpError(400, "That photo didn't make it. Try again.");

    const allow = await sb.rpc("receipt_scan_allow");
    if (allow.error) throw new HttpError(429, "You're moving fast. Wait a minute and try again.", 3600);

    const response = await client.messages.create({
      model: RECEIPT_MODEL,
      max_tokens: 1024,
      system: RECEIPT_SYSTEM,
      tools: [RECEIPT_TOOL as unknown as Anthropic.Tool],
      // one structured answer, no free text
      tool_choice: { type: "tool", name: RECEIPT_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: "Read this receipt for my mod log." },
          ],
        },
      ],
    });

    // a refusal or a cut-off answer reads as "couldn't read it", never as half-filled fields
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return json({ fields: null });
    const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    return json({ fields: use && use.name === RECEIPT_TOOL.name ? cleanReceipt(use.input) : null });
  } catch (e) {
    return errorResponse(e);
  }
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
