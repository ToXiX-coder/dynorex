import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Platform } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { authService } from "@/features/auth/authService";
import { flash } from "@/features/auth/flash";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { useAction } from "@/hooks/useAction";

/**
 * Export and account deletion. Deletion needs a fresh sign-in (the server checks it happened in the
 * last 5 minutes), typing DELETE, and a red confirm. The server removes the account; the app only
 * signs out after the server says it's done.
 */
export default function DataSettings() {
  const { status, user } = useAuth();
  const [exported, setExported] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [askConfirm, setAskConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const exportData = useAction(authService.exportData);
  const reauth = useAction(async () => {
    if (!user) return { ok: false as const, error: { key: "sessionExpired" as const } };
    if (user.providers.includes("email") && user.email) return authService.signInWithEmail(user.email, password);
    if (user.providers.includes("apple")) return authService.signInWithApple();
    return authService.signInWithGoogle();
  });
  const del = useAction(authService.deleteAccount);
  const signOut = useAction(authService.signOut);

  if (deleted) {
    return (
      <Screen>
        <InlineNotice
          title="Account deleted"
          body="Your profile, vehicles, mods and follows are gone. Reports you filed are kept without your name so moderators can finish them."
        />
      </Screen>
    );
  }
  if (status !== "signedIn" || !user)
    return (
      <Screen>
        <SignInPrompt />
      </Screen>
    );
  const usesPassword = user.providers.includes("email");

  return (
    <Screen>
      <Card>
        <SectionHeader>Export your data</SectionHeader>
        <Text>Everything Dynorex stores about you, as a JSON file: profile, vehicles, mods, follows and settings.</Text>
        {exportData.error ? <InlineError kind={exportData.error.key} /> : null}
        {exported ? <InlineNotice title="Export ready" body={exported} /> : null}
        <Button
          title="Export my data"
          loading={exportData.busy}
          onPress={async () => {
            const r = await exportData.run();
            if (!r?.ok) return;
            const file = new File(Paths.cache, `dynorex-export-${new Date().toISOString().slice(0, 10)}.json`);
            file.write(JSON.stringify(r.data, null, 2));
            if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
              await Sharing.shareAsync(file.uri, {
                mimeType: "application/json",
                dialogTitle: "Save your Dynorex data",
              });
              setExported("Saved through the share sheet.");
            } else {
              setExported(`Saved to ${file.uri}`);
            }
          }}
        />
      </Card>

      <Card>
        <SectionHeader>Delete account</SectionHeader>
        <Text>
          This permanently removes your profile, vehicles, mods, photos and follows. Reports you filed stay, without
          your name, so moderators can finish them. Encrypted backups are cycled out on the hosting provider&apos;s
          schedule.
        </Text>
        <Text variant="bodyStrong">
          Have Dynorex+? Cancel it in your App Store or Google Play settings first. Deleting your account doesn&apos;t
          stop the store from billing you.
        </Text>
        <TextField
          label='Type "DELETE" to confirm'
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {usesPassword ? (
          <TextField
            label="Your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            hint="We ask again to make sure it's really you."
          />
        ) : (
          <Text variant="caption" muted>
            You&apos;ll sign in with {user.providers.includes("apple") ? "Apple" : "Google"} again to confirm.
          </Text>
        )}
        {reauth.error ? <InlineError kind={reauth.error.key} /> : null}
        {del.error ? <InlineError kind={del.error.key} /> : null}
        <Button
          title="Delete my account"
          variant="destructive"
          disabled={confirmText !== "DELETE" || (usesPassword && password.length === 0)}
          onPress={() => setAskConfirm(true)}
        />
      </Card>

      <ConfirmModal
        visible={askConfirm}
        kind="deleteAccount"
        busy={reauth.busy || del.busy || signOut.busy}
        onCancel={() => setAskConfirm(false)}
        onConfirm={async () => {
          const a = await reauth.run();
          if (!a?.ok) return setAskConfirm(false);
          const d = await del.run();
          setAskConfirm(false);
          if (!d?.ok) return;
          setDeleted(true);
          flash.set({
            title: "Account deleted",
            body: "Your profile, vehicles, mods and follows are gone. Reports you filed are kept without your name.",
          });
          await signOut.run();
        }}
      />
    </Screen>
  );
}
