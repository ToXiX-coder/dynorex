import { ErrorState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { backOr } from "@/components/navigation/stackOptions";

/**
 * Every unknown, private or deleted path lands here with the same message, so a link never
 * confirms that a private build exists.
 */
export default function NotFound() {
  return (
    <Screen>
      <ErrorState kind="buildNotFound" onAction={() => backOr()} />
    </Screen>
  );
}
