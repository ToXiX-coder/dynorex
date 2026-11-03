import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TAGLINE } from "@/components/mascot/BrandSplash";
import { LogoLockup, Torq } from "@/components/mascot/Torq";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { flash } from "@/features/auth/flash";
import { space } from "@/theme/tokens";

/** First screen for anyone signed out. */
export default function Welcome() {
  const { enterGuest, status } = useAuth();
  const [message] = useState(() => flash.take());
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View style={{ alignItems: "center", gap: space.md, paddingTop: space.xl }}>
        <LogoLockup width={200} />
        <Text variant="heading" style={{ textAlign: "center" }}>
          {TAGLINE}
        </Text>
        <Text muted style={{ textAlign: "center" }}>
          Log every mod and service in one place. It stays private until you choose to share it.
        </Text>
      </View>
      {message ? <InlineNotice title={message.title} body={message.body} /> : null}
      {status === "unconfigured" ? <InlineError kind="notConnected" /> : null}
      <View style={{ gap: space.sm }}>
        <Button title="Create account" onPress={() => router.push("/sign-up")} />
        <Button title="Sign in" variant="secondary" onPress={() => router.push("/sign-in")} />
        <Button title="Look around first" variant="secondary" onPress={enterGuest} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Torq expression="excited" size={90} />
      </View>
    </Screen>
  );
}
