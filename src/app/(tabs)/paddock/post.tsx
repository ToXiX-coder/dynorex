import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { InlineError } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { buildService, type VehicleCard } from "@/features/garage/buildService";
import { communityService } from "@/features/paddock/communityService";
import { useFlags } from "@/providers/AppProviders";
import type { MyClub } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

/**
 * Write a Paddock post: to everyone, or to one of your clubs (?clubId=). You can attach one of your PUBLIC
 * builds; private builds aren't offered, and the server refuses them anyway.
 */
export default function NewPost() {
  const flags = useFlags();
  const { status } = useAuth();
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  const [body, setBody] = useState("");
  const [club, setClub] = useState<string | null>(typeof clubId === "string" && isUuid(clubId) ? clubId : null);
  const [build, setBuild] = useState<string | null>(null);
  const [clubs, setClubs] = useState<MyClub[]>([]);
  const [builds, setBuilds] = useState<VehicleCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (status !== "signedIn") return;
    let alive = true;
    void communityService.myClubs().then((r) => alive && r.ok && setClubs(r.data));
    void buildService
      .listVehicles(0)
      .then((r) => alive && r.ok && setBuilds(r.data.filter((v) => v.visibility === "public")));
    return () => {
      alive = false;
    };
  }, [status]);

  if (!flags.paddock) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to post" />
      </Screen>
    );

  const submit = async () => {
    setEmpty(false);
    setError(null);
    if (!body.trim()) return setEmpty(true);
    setBusy(true);
    const r = await communityService.createPost({ body: body.trim(), club_id: club, build_vehicle_id: build });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(`/posts/${r.data}`);
  };

  return (
    <Screen>
      <TextField
        label="Post"
        required
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        error={empty ? "Write something first" : null}
        placeholder="What's happening with your build?"
      />
      <Text variant="label">Post to</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Chip label="Everyone" selected={club === null} onPress={() => setClub(null)} />
        {clubs.map((c) => (
          <Chip key={c.club_id} label={c.name} selected={club === c.club_id} onPress={() => setClub(c.club_id)} />
        ))}
      </View>
      {builds.length ? (
        <>
          <Text variant="label">Attach a build (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            <Chip label="None" selected={build === null} onPress={() => setBuild(null)} />
            {builds.map((v) => (
              <Chip
                key={v.id}
                label={v.nickname ?? `${v.year} ${v.make} ${v.model}`}
                selected={build === v.id}
                onPress={() => setBuild(v.id)}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text variant="caption" muted>
        Posts are public. Don&apos;t share addresses, plates or anything you wouldn&apos;t say at a meet.
      </Text>
      {error ? <InlineError kind={error.key} /> : null}
      <Button title="Post" fullWidth loading={busy} onPress={() => void submit()} />
    </Screen>
  );
}
