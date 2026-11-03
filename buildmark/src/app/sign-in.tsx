import { Redirect, router } from "expo-router";
import { useState } from "react";
import { getSupabase } from "@/services/supabase";
import { Button, Field, Notice, Screen, T } from "@/ui/kit";
import { useSession } from "@/ui/session";

export default function SignIn() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "stamp"; text: string } | null>(null);
  const sb = getSupabase();
  if (session.state === "signed_in") return <Redirect href="/" />;

  async function go(mode: "in" | "up") {
    if (!sb) return;
    setBusy(mode);
    setMsg(null);
    const creds = { email: email.trim(), password };
    const { data, error } = mode === "in" ? await sb.auth.signInWithPassword(creds) : await sb.auth.signUp(creds);
    setBusy(null);
    if (error) return setMsg({ tone: "danger", text: error.message });
    if (mode === "up" && !data.session) return setMsg({ tone: "stamp", text: "Check your email to confirm your account, then sign in." });
    router.replace("/");
  }

  return (
    <Screen>
      <T v="title">Sign in</T>
      {!sb ? (
        <Notice tone="flag">Buildmark isn&apos;t connected to a backend yet, so accounts aren&apos;t available.</Notice>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" hint="At least 8 characters" />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button label="Sign in" busy={busy === "in"} disabled={!email || password.length < 8} onPress={() => go("in")} />
          <Button kind="secondary" label="Create an account" busy={busy === "up"} disabled={!email || password.length < 8} onPress={() => go("up")} />
        </>
      )}
    </Screen>
  );
}
