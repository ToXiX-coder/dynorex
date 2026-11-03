import { useEffect, useState } from "react";
import { socialService } from "./socialService";

type Media = { heroes: Record<string, string>; photos: Record<string, string> };
const EMPTY: Media = { heroes: {}, photos: {} };

/**
 * Signed, 5-minute URLs for public photos on one screen, fetched in a single batched call after the
 * server re-checks visibility for this viewer. Ids the server won't sign simply have no URL; the
 * image falls back to a plain box. Nothing is cached beyond the screen's lifetime.
 */
export function usePublicMedia(heroes: string[], photos: string[] = []): Media {
  const [media, setMedia] = useState<Media>(EMPTY);
  const key = `${heroes.join(",")}|${photos.join(",")}`;

  useEffect(() => {
    let alive = true;
    const [h, p] = key.split("|").map((s) => (s ? s.split(",") : []));
    if (!h!.length && !p!.length) return;
    // the server accepts 30 ids per call
    void socialService
      .publicMedia({ heroes: h!.slice(0, 30), photos: p!.slice(0, Math.max(0, 30 - h!.length)) })
      .then((r) => {
        if (alive && r.ok) setMedia(r.data);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return media;
}
