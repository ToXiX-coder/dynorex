import { useCallback, useRef, useState } from "react";
import type { ErrorKey } from "@/domain/copy/errors";
import { analytics } from "@/services/analytics";
import {
  registerPhoto,
  uploadPhoto,
  type PhotoTarget,
  type PreparedPhoto,
  type UploadHandle,
} from "@/services/media/photos";

/** Where an uploaded photo goes (what register-photo is told, minus the file path). */
export type Target = PhotoTarget;

export interface UploadItem {
  id: string;
  photo: PreparedPhoto;
  target: Target;
  progress: number;
  state: "uploading" | "checking" | "done" | "failed";
  error?: ErrorKey;
}

/**
 * Runs uploads one at a time in the background with per-photo progress. The screen stays usable;
 * failed photos can be retried or removed. "done" only after the server accepted the file.
 */
export function usePhotoUploads(onDone?: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const handles = useRef(new Map<string, UploadHandle>());

  const patch = (id: string, p: Partial<UploadItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const runOne = useCallback(
    // resolves true only once the server accepted the photo
    async (item: UploadItem): Promise<boolean> => {
      patch(item.id, { state: "uploading", progress: 0, error: undefined });
      const h = uploadPhoto(item.photo, (p) => patch(item.id, { progress: p }));
      handles.current.set(item.id, h);
      const up = await h.promise;
      handles.current.delete(item.id);
      if (!up.ok) {
        if (up.error.cancelled) setItems((xs) => xs.filter((x) => x.id !== item.id));
        else patch(item.id, { state: "failed", error: up.error.key });
        return false;
      }
      patch(item.id, { state: "checking", progress: 1 });
      const reg = await registerPhoto({ ...item.target, path: up.data.path });
      if (!reg.ok) {
        patch(item.id, { state: "failed", error: reg.error.key });
        return false;
      }
      patch(item.id, { state: "done" });
      analytics.track("photo_uploaded", { count: 1, source: item.photo.source });
      onDone?.();
      return true;
    },
    [onDone],
  );

  const add = useCallback(
    async (photo: PreparedPhoto, target: Target) => {
      const item: UploadItem = { id: `${Date.now()}-${Math.random()}`, photo, target, progress: 0, state: "uploading" };
      setItems((xs) => [...xs, item]);
      return runOne(item);
    },
    [runOne],
  );

  return {
    items,
    add,
    retry: (id: string) => {
      const it = items.find((x) => x.id === id);
      if (it) void runOne(it);
    },
    cancel: async (id: string) => {
      await handles.current.get(id)?.cancel();
      setItems((xs) => xs.filter((x) => x.id !== id));
    },
    dismiss: (id: string) => setItems((xs) => xs.filter((x) => x.id !== id)),
    busy: items.some((x) => x.state === "uploading" || x.state === "checking"),
  };
}
