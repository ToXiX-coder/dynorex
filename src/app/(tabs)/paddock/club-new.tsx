import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { communityService } from "@/features/paddock/communityService";
import { useFlags } from "@/providers/AppProviders";
import { space } from "@/theme/tokens";

/** Start a club. Names are unique; the server allows 3 new clubs a day per person. */
export default function NewClub() {
  const flags = useFlags();
  const { status } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  if (!flags.paddock) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to start a club" />
      </Screen>
    );

  const submit = async () => {
    setNameError(null);
    setError(null);
    const n = name.trim();
    if (n.length < 3) return setNameError("Use at least 3 characters");
    setBusy(true);
    const r = await communityService.createClub(n, description.trim() || null, visibility);
    setBusy(false);
    if (!r.ok) {
      if (r.error.key === "clubNameTaken") return setNameError("That name is taken");
      return setError(r.error);
    }
    router.replace(`/clubs/${r.data}`);
  };

  return (
    <Screen>
      <TextField
        label="Club name"
        required
        value={name}
        onChangeText={setName}
        maxLength={60}
        error={nameError}
        placeholder="Sample Hills Canyon Club"
      />
      <TextField
        label="What's it about (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
      />
      <View
        style={{ flexDirection: "row", gap: space.xs }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Who can join"
      >
        <Chip label="Open to anyone" selected={visibility === "public"} onPress={() => setVisibility("public")} />
        <Chip label="Invite-only" selected={visibility === "private"} onPress={() => setVisibility("private")} />
      </View>
      <Text variant="caption" muted>
        {visibility === "public"
          ? "Anyone can find the club, join and read its posts."
          : "Anyone can find the club by name, but you approve who joins, and posts and chat are members-only. Club events stay public."}{" "}
        You can change this or delete the club later.
      </Text>
      {error ? <InlineError kind={error.key} /> : null}
      <Button title="Start club" fullWidth loading={busy} onPress={() => void submit()} />
    </Screen>
  );
}
