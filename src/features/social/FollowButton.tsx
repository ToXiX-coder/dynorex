import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { analytics } from "@/services/analytics";
import { space } from "@/theme/tokens";
import { socialService } from "./socialService";
import { haptic } from "@/services/haptics";

type Target = { kind: "build"; buildId: string } | { kind: "user"; userId: string };

/** Leave guest mode (or the public page) for the welcome / sign-in screen. */
export function useGoToSignIn() {
  const { exitGuest } = useAuth();
  return () => {
    exitGuest();
    router.replace("/");
  };
}

/**
 * Follow / Following toggle. The state shown is always what the server confirmed: it only flips after
 * the insert or delete succeeds. The server refuses private builds, your own build, blocked people
 * and more than 100 follows an hour.
 */
export function FollowButton({ target, label }: { target: Target; label: string }) {
  const { status } = useAuth();
  const goToSignIn = useGoToSignIn();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const id = target.kind === "build" ? target.buildId : target.userId;

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    const check = target.kind === "build" ? socialService.isFollowingBuild(id) : socialService.isFollowingUser(id);
    void check.then((r) => alive && r.ok && setFollowing(r.data));
    return () => {
      alive = false;
    };
  }, [status, id, target.kind]);

  if (status !== "signedIn") {
    return <Button title="Sign in to follow" variant="secondary" onPress={goToSignIn} />;
  }

  // Optimistic (D-67): the button flips the moment it's tapped, and flips back with an inline error if the server
  // says no. One request at a time, so fast double taps can't race.
  const toggle = async () => {
    if (busy || following === null) return;
    const before = following;
    const next = !before;
    setBusy(true);
    setError(null);
    setFollowing(next);
    haptic.tap();
    const r =
      target.kind === "build"
        ? next
          ? await socialService.followBuild(id)
          : await socialService.unfollowBuild(id)
        : next
          ? await socialService.followUser(id)
          : await socialService.unfollowUser(id);
    setBusy(false);
    if (!r.ok) {
      setFollowing(before);
      haptic.warning();
      return setError(r.error);
    }
    if (target.kind === "build") analytics.track(next ? "build_followed" : "build_unfollowed", {});
  };

  return (
    <View style={{ gap: space.sm }}>
      <Button
        title={following ? "Following" : "Follow"}
        variant={following ? "secondary" : "primary"}
        loading={following === null}
        accessibilityLabel={following ? `Following ${label}. Tap to unfollow` : `Follow ${label}`}
        onPress={() => void toggle()}
      />
      {error ? <InlineError kind={error.key} /> : null}
    </View>
  );
}
