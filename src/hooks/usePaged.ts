import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { MappedError } from "@/features/auth/errors";

type PageResult<T> = { ok: true; data: T[] } | { ok: false; error: MappedError };
export const PAGE_SIZE = 20;

/**
 * A list that loads 20 at a time. Reloads page 0 whenever the screen gains focus or `fetchPage` changes
 * (e.g. a different filter); "Load more" appends the next page. Answers for an older filter are ignored,
 * so switching tabs quickly never mixes lists. `hasMore` is false once a page comes back short.
 */
export function usePaged<T>(fetchPage: (page: number) => Promise<PageResult<T>>, key: (item: T) => string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useRef(0);
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    page.current = 0;
    void fetchPage(0).then((r) => {
      if (gen !== generation.current) return;
      if (!r.ok) return setError(r.error);
      setError(null);
      setItems(r.data);
      setHasMore(r.data.length >= PAGE_SIZE);
    });
  }, [fetchPage]);
  useFocusEffect(reload);

  const loadMore = useCallback(async () => {
    const gen = generation.current;
    setLoadingMore(true);
    const r = await fetchPage(page.current + 1);
    setLoadingMore(false);
    if (gen !== generation.current) return;
    if (!r.ok) return setError(r.error);
    page.current += 1;
    setHasMore(r.data.length >= PAGE_SIZE);
    setItems((prev) => {
      const seen = new Set((prev ?? []).map(key));
      return [...(prev ?? []), ...r.data.filter((x) => !seen.has(key(x)))];
    });
  }, [fetchPage, key]);

  return { items, error, hasMore, loadingMore, reload, loadMore };
}
