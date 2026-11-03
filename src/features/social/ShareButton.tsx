import { useState } from "react";
import { Share, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { Text } from "@/components/Text";
import { shareUrl } from "@/domain/deepLinks";
import type { MappedError } from "@/features/auth/errors";
import { analytics } from "@/services/analytics";
import { space } from "@/theme/tokens";
import { socialService } from "./socialService";

/**
 * Native share sheet for a build. The server first confirms the build is public right now and hands
 * back its canonical path (rate limited to 30 an hour), so a private build can't be shared even if the
 * screen is stale. The shared text is the title and the link only.
 */
export function ShareButton({ vehicleId, title }: { vehicleId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    const r = await socialService.shareLink(vehicleId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const url = shareUrl(r.data);
    try {
      const res = await Share.share({ message: `${title} on Dynorex: ${url}`, url, title });
      if (res.action === Share.sharedAction) analytics.track("build_shared", { share_method: "native" });
    } catch {
      // no share sheet (some desktop browsers): show the link so it can be copied
      setFallback(url);
      analytics.track("build_shared", { share_method: "link" });
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Button title="Share" variant="secondary" loading={busy} onPress={() => void share()} />
      {error ? <InlineError kind={error.key} /> : null}
      {fallback ? (
        <InlineNotice title="Link ready" body="Copy it from here.">
          <Text selectable>{fallback}</Text>
        </InlineNotice>
      ) : null}
    </View>
  );
}
