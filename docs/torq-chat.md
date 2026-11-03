# Ask Torq (Torq chat)

Torq answers "what should I do to my car?" using what the Dynorex community has publicly built on the same model.
Behind the `torqChat` flag: **off in production** (preflight fails a production build if it's on) until decision
D-48 is made. On in pitch mode, where Torq answers from sample builds with fixed rules (no AI call) and says so.

## How it works

| Piece                                    | What it does                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.mod_insights(make, model, year)` | Aggregates **public** builds only (through the public views, so private, deleted, hidden and blocked builds never count). Same model (or "WRX STI"-style variants), ±5 model years.                                                                                                                                                            |
| Privacy thresholds                       | A mod is listed only when **2+ builds** use it. HP/weight changes only when **3+ owners** reported them, as a **range** (25th–75th percentile) plus the typical (median) value. Costs, notes, VINs and usernames are never included.                                                                                                           |
| `supabase/functions/torq-chat`           | Runs as the signed-in user. Checks the rate limit (`torq_chat_allow`: 20/hour, 60/day), then calls Claude (`claude-opus-5-5`, effort `medium`, refusal fallbacks on) with one tool, `get_community_mods`, which calls `mod_insights`. Returns the reply and the data used. Conversations are **not stored** and their content is never logged. |
| `supabase/functions/_shared/torq.ts`     | The persona and rules (unit tested): never invent community numbers, gains always as ranges with report counts, say when data is thin, no "verified"/"dyno-proven", no help defeating emissions equipment, legality varies by place, pro install for safety parts, track days not street racing, never discuss individual members.             |
| App (`/torq`)                            | Pick one of your cars; Torq sees the car and your own mod names with their status ("Stage 2 tune (planned)"). Community snapshot card (share bars, gain ranges), chat, suggestion chips. Entry points: Home banner, vehicle page "Ask Torq".                                                                                                   |

## What is sent to the AI provider (Anthropic)

The conversation text, the car (year, make, model), the asker's own mod names and statuses, and the aggregated
public data above. Never usernames, emails, VINs, costs, notes, photos, locations or anyone's individual build.
Add Anthropic to the privacy policy's processor list before turning this on (docs/legal/privacy-facts.md).

## Turning it on (when D-48 is decided)

1. `npx supabase db push` (migration `20261014000000_torq_chat.sql`).
2. `npx supabase secrets set ANTHROPIC_API_KEY=...` (server-side only; never an `EXPO_PUBLIC_` variable).
3. `npx supabase functions deploy torq-chat`.
4. Set `torqChat: true` in `DEFAULT_FLAGS` and update the preflight check.

Until the secret is set, the function answers "Torq chat isn't connected yet" (503) and the app says so.

## Estimates are ranges (app-wide)

Separately, the app now shows spec estimates as ranges (`src/domain/specRange.ts`): power and torque ±6% (nearest
5), weight ±2% (nearest 10 lb), 0–60 ±7%, power-to-weight ±8%, rounded outward so the range always contains the
estimate. A **stock** car (no completed mods) shows the owner's exact stock numbers instead.
