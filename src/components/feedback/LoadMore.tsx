import { Button } from "@/components/buttons/Button";

/** "Load more" at the end of a paged list; hidden once the server has nothing more. */
export function LoadMore({
  hasMore,
  loading,
  onPress,
  label = "Load more",
}: {
  hasMore: boolean;
  loading: boolean;
  onPress: () => void;
  label?: string;
}) {
  if (!hasMore) return null;
  return <Button title={label} variant="secondary" loading={loading} onPress={onPress} />;
}
