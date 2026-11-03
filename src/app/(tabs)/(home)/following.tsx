import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { userPath } from "@/domain/deepLinks";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { socialService, type PublicProfile } from "@/features/social/socialService";
import { space, touch } from "@/theme/tokens";
import { withPress } from "@/theme/press";

/** Your own follower / following lists. Blocked and hidden accounts drop out (public profiles only). */
export default function Connections() {
  const { status } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"following" | "followers">(params.tab === "followers" ? "followers" : "following");
  const [list, setList] = useState<PublicProfile[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    void socialService.myConnections(tab).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setList(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [status, tab, reload]);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );

  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Chip label="Following" selected={tab === "following"} onPress={() => setTab("following")} />
        <Chip label="Followers" selected={tab === "followers"} onPress={() => setTab("followers")} />
      </View>
      {error ? (
        <ErrorState kind={error.key} onAction={() => setReload((n) => n + 1)} />
      ) : list === null ? (
        <LoadingState label="Loading" />
      ) : list.length === 0 ? (
        <EmptyState
          expression="neutral"
          message={tab === "following" ? "Not following anyone yet" : "No followers yet"}
          detail={tab === "following" ? "Find builds in Discover." : "Share a public build to get some."}
        />
      ) : (
        list.map((p) => (
          <Pressable
            key={p.user_id}
            accessibilityRole="link"
            accessibilityLabel={`${p.display_name ?? ""} @${p.username}`}
            onPress={() => router.push(userPath(p.username))}
            style={withPress({ minHeight: touch.min })}
          >
            <Card>
              <Text variant="bodyStrong">{p.display_name || `@${p.username}`}</Text>
              {p.display_name ? <Text variant="caption" muted>{`@${p.username}`}</Text> : null}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
