// POST /functions/v1/torq-chat
// Torq answers mod questions using aggregated community data. Runs AS the signed-in user (their JWT), so the
// rate limit and the data function apply to them. The Anthropic API key is an Edge Function secret
// (ANTHROPIC_API_KEY) and never reaches the app. Conversations are not stored; nothing about their content is
// logged.
// NOT YET RUN: needs Deno + Supabase + the secret (see docs/torq-chat.md).
import Anthropic from "npm:@anthropic-ai/sdk";
import { errorResponse, HttpError, userClient } from "../_shared/auth.ts";
import {
  garageContext,
  MAX_TOOL_ROUNDS,
  parseChatRequest,
  TORQ_MODEL,
  TORQ_SYSTEM,
  TORQ_TOOL,
} from "../_shared/torq.ts";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const client = apiKey ? new Anthropic({ apiKey }) : null;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Something broke on our end");
    if (!client) throw new HttpError(503, "Torq chat isn't connected yet");
    const sb = userClient(req);
    const { data: who, error } = await sb.auth.getUser();
    if (error || !who.user) throw new HttpError(401, "You've been logged out");

    const parsed = parseChatRequest(await req.json().catch(() => null));
    if (!parsed) throw new HttpError(400, "Something broke on our end");

    // server-side rate limit (20/hour, 60/day) before any model call
    const allow = await sb.rpc("torq_chat_allow");
    if (allow.error) throw allow.error;

    const messages: Anthropic.Beta.BetaMessageParam[] = parsed.messages.map((m, i) =>
      i === 0 ? { role: m.role, content: `${garageContext(parsed.car)}\n\n${m.content}` } : m,
    );
    let insights: unknown = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: TORQ_MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        // fixed system prompt + tool first, so the prefix caches across every chat
        cache_control: { type: "ephemeral" },
        system: TORQ_SYSTEM,
        tools: [TORQ_TOOL as unknown as Anthropic.Beta.BetaTool],
        messages,
        // if a safety classifier declines, the API retries on a suitable fallback model in the same call
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);

      if (response.stop_reason === "refusal") {
        return json({ reply: "Torq can't help with that one. Ask me about mods for your car instead.", insights });
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return json({ reply: reply || "Torq lost the thread there. Try asking again.", insights });
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const input = use.input as { make?: unknown; model?: unknown; year?: unknown };
        if (use.name !== TORQ_TOOL.name || typeof input.make !== "string" || typeof input.model !== "string") {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool or bad input", is_error: true });
          continue;
        }
        const r = await sb.rpc("mod_insights", {
          p_make: input.make.slice(0, 40),
          p_model: input.model.slice(0, 60),
          p_year: Number.isInteger(input.year) ? input.year : null,
        });
        if (r.error) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Community data unavailable", is_error: true });
          continue;
        }
        insights = r.data;
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(r.data) });
      }
      messages.push({ role: "user", content: results });
    }
    throw new HttpError(500, "Something broke on our end");
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      return errorResponse(new HttpError(503, "Torq is busy. Try again in a minute."));
    }
    return errorResponse(e);
  }
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
