import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { useAction } from "@/hooks/useAction";
import { radius, space, touch } from "@/theme/tokens";
import { authService } from "./authService";

/**
 * Apple + Google sign-in. iOS shows Apple's own button (required styling); elsewhere both use the
 * secure browser flow. Closing the sheet is a cancel, not an error.
 */
export function SocialButtons({ disabled }: { disabled?: boolean }) {
  const [appleNative, setAppleNative] = useState(false);
  const apple = useAction(authService.signInWithApple);
  const google = useAction(authService.signInWithGoogle);

  useEffect(() => {
    void authService.appleAvailable().then(setAppleNative);
  }, []);

  const error = apple.error ?? google.error;
  return (
    <View style={{ gap: space.sm }}>
      {appleNative && Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.md}
          style={{ height: touch.min + 4 }}
          onPress={() => void apple.run()}
        />
      ) : (
        <Button
          title="Continue with Apple"
          variant="secondary"
          loading={apple.busy}
          disabled={disabled || google.busy}
          onPress={() => void apple.run()}
        />
      )}
      <Button
        title="Continue with Google"
        variant="secondary"
        loading={google.busy}
        disabled={disabled || apple.busy}
        onPress={() => void google.run()}
      />
      {error ? <InlineError kind={error.key} /> : null}
    </View>
  );
}
