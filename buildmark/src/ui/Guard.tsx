import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { Loading, Screen } from "./kit";
import { useSession } from "./session";

/** Owner screens need a session. The buyer's record and the shop page don't use this. */
export function Guard({ children }: { children: ReactNode }) {
  const s = useSession();
  if (s.state === "loading")
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (s.state === "signed_out") return <Redirect href="/sign-in" />;
  return <>{children}</>;
}
