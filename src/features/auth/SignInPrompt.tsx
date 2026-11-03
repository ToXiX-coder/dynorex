import { Button } from "@/components/buttons/Button";
import { EmptyState } from "@/components/feedback/States";
import { useAuth } from "./AuthProvider";

/** For guests on screens that need an account. Leaving guest mode returns to the welcome screen. */
export function SignInPrompt({ message = "Sign in to see this" }: { message?: string }) {
  const { exitGuest, status } = useAuth();
  return (
    <>
      <EmptyState
        expression="neutral"
        message={message}
        detail={
          status === "unconfigured"
            ? "This build isn't connected to a Dynorex server yet, so sign-in won't work."
            : "It takes a minute. Your garage stays private unless you share it."
        }
      />
      <Button title="Sign in or create account" onPress={exitGuest} />
    </>
  );
}
