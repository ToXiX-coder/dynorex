import { buildSpecDeltas, modFormSchema, type DeltaInputs } from "@/domain/validation/build";
import { buildService } from "@/features/garage/buildService";
import { drafts, type ModDraft } from "./drafts";

/**
 * Submits mods that were saved while offline. Safe to run any number of times: each draft carries the
 * same client_ref it was created with, so the database returns the existing mod instead of a duplicate.
 * Drafts that fail validation or hit a plan limit stay on the phone for the person to fix.
 */
export async function syncQueuedMods(userId: string): Promise<{ sent: number; kept: number }> {
  let sent = 0;
  let kept = 0;
  for (const d of await drafts.queued(userId)) {
    const ok = await submitDraft(d);
    if (ok) {
      await drafts.remove(userId, d.clientRef);
      sent++;
    } else kept++;
  }
  return { sent, kept };
}

async function submitDraft(d: ModDraft): Promise<boolean> {
  const form = modFormSchema.safeParse(d.fields);
  const deltas = buildSpecDeltas(d.deltas as DeltaInputs);
  if (!form.success || !deltas.ok) return false;
  const r = await buildService.createMod(d.vehicleId, form.data, deltas.value, d.clientRef);
  return r.ok;
}
