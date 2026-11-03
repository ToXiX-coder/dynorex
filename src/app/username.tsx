import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/buttons/Button";
import { InlineError } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { usernameSchema } from "@/domain/validation/account";
import { useAuth } from "@/features/auth/AuthProvider";
import { profileService } from "@/features/profiles/profileService";
import { useAction } from "@/hooks/useAction";

type Check = { name: string; result: "free" | "taken" | "error" };

/** Right after email verification. A username is needed before following or publishing. */
export default function Username() {
  const { refreshProfile } = useAuth();
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const save = useAction(profileService.setUsername);

  // Format rules are checked instantly; only "is it taken" needs the server.
  const parsed = useMemo(() => usernameSchema.safeParse(value), [value]);
  const name = parsed.success ? parsed.data : null;

  // ask the server 400 ms after typing stops
  useEffect(() => {
    if (!name) return;
    const t = setTimeout(async () => {
      const r = await profileService.usernameAvailable(name);
      setCheck({ name, result: !r.ok ? "error" : r.data ? "free" : "taken" });
    }, 400);
    return () => clearTimeout(t);
  }, [name]);

  const status = !value ? "idle" : !parsed.success ? "invalid" : check?.name === name ? check.result : "checking";

  const error =
    status === "invalid"
      ? parsed.error?.issues[0]?.message
      : status === "taken"
        ? "That username is taken or reserved"
        : undefined;
  const hint =
    status === "free"
      ? "Available"
      : status === "checking"
        ? "Checking…"
        : status === "error"
          ? "Couldn't check right now. You can still try."
          : "3-20 characters: a-z, 0-9 and _";

  return (
    <Screen>
      <Text variant="heading">Pick a username</Text>
      <Text muted>This is how other people find you. You can change it later.</Text>
      <TextField
        label="Username"
        required
        value={value}
        onChangeText={(t) => setValue(t.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        hint={hint}
        error={error}
      />
      {save.error ? <InlineError kind={save.error.key} /> : null}
      <Button
        title="Continue"
        // a failed availability check doesn't block: the database's unique rule is the real check
        disabled={!name || (status !== "free" && status !== "error")}
        loading={save.busy}
        onPress={async () => {
          if (!name) return;
          const r = await save.run(name);
          if (r?.ok) await refreshProfile();
        }}
      />
    </Screen>
  );
}
