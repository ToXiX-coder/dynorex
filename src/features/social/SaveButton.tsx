import { useEffect, useState } from "react";
import { Button } from "@/components/buttons/Button";
import { Pop } from "@/components/motion/Motion";
import { haptic } from "@/services/haptics";
import { useAuth } from "@/features/auth/AuthProvider";
import type { SaveKind } from "@/services/supabase/database.types";
import { savesService } from "./savesService";

/**
 * Save for later (a private bookmark). Only you see what you saved, under Profile > Saved. Hidden when signed
 * out. The button only flips after the server confirms.
 */
export function SaveButton({ kind, id }: { kind: SaveKind; id: string }) {
  const { status } = useAuth();
  const signed = status === "signedIn";
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (signed) void savesService.isSaved(kind, id).then((r) => alive && r.ok && setSaved(r.data));
    return () => {
      alive = false;
    };
  }, [kind, id, signed]);

  if (!signed || saved === null) return null;
  return (
    <Pop trigger={saved}>
      <Button
        title={saved ? "Saved" : "Save"}
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const r = saved ? await savesService.unsave(kind, id) : await savesService.save(kind, id);
          setBusy(false);
          if (r.ok) {
            if (!saved) haptic.success();
            setSaved(!saved);
          }
        }}
      />
    </Pop>
  );
}
