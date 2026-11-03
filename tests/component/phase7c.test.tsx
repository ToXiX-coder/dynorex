import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { TrackPoint } from "@/domain/routes";

/** Phase 7c: offline drive uploads and per-user drive drafts. */
type SaveArgs = [string, string, string | null, TrackPoint[], boolean];
const mockSave = jest.fn<(...a: SaveArgs) => Promise<unknown>>();
jest.mock("@/features/line/lineService", () => ({
  lineService: { save: (...a: SaveArgs) => mockSave(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pendingDrives } = require("@/features/line/pendingDrives") as typeof import("@/features/line/pendingDrives");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recorderDrafts } = require("@/features/line/useRecorder") as typeof import("@/features/line/useRecorder");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cache } = require("@/services/cache") as typeof import("@/services/cache");

const A = "user-a";
const B = "user-b";
const pts: TrackPoint[] = [
  [34, -118, 1],
  [34.01, -118, 60_001],
];
const offline = { ok: false, error: { key: "offline" } };
const drive = (ref: string) => ({ clientRef: ref, title: "Canyon", share: true, points: pts });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSave.mockReset();
});

describe("offline drive queue", () => {
  it("keeps a drive while offline and uploads it once with the same client_ref", async () => {
    await pendingDrives.add(A, drive("ref-1"));
    await pendingDrives.add(A, drive("ref-1")); // adding twice doesn't duplicate
    mockSave.mockResolvedValueOnce(offline);
    let r = await pendingDrives.sync(A);
    expect(r.uploaded).toEqual([]);
    expect(r.waiting).toHaveLength(1);
    expect(r.waiting[0]!.lastError).toBeUndefined(); // offline is not an error worth showing
    mockSave.mockResolvedValueOnce({ ok: true, data: "route-9" });
    r = await pendingDrives.sync(A);
    expect(r.uploaded).toEqual(["route-9"]);
    expect(await pendingDrives.list(A)).toEqual([]);
    expect(mockSave.mock.calls.map((c) => c[0])).toEqual(["ref-1", "ref-1"]);
    expect(mockSave.mock.calls[1]!.slice(1)).toEqual(["Canyon", null, pts, true]);
  });

  it("a refused drive stays listed with the reason; nothing is dropped silently", async () => {
    await pendingDrives.add(A, drive("ref-2"));
    mockSave.mockResolvedValueOnce({ ok: false, error: { key: "planLimitRoutes" } });
    const r = await pendingDrives.sync(A);
    expect(r.waiting.map((d) => [d.clientRef, d.lastError])).toEqual([["ref-2", "planLimitRoutes"]]);
    await pendingDrives.discard(A, "ref-2");
    expect(await pendingDrives.list(A)).toEqual([]);
  });

  it("a drive queued during a sync is kept", async () => {
    await pendingDrives.add(A, drive("ref-3"));
    mockSave.mockImplementationOnce(async () => {
      await pendingDrives.add(A, drive("ref-4"));
      return { ok: true, data: "route-3" };
    });
    await pendingDrives.sync(A);
    expect((await pendingDrives.list(A)).map((d) => d.clientRef)).toEqual(["ref-4"]);
  });
});

describe("drives on a shared phone", () => {
  it("drafts and queued drives belong to one account and are wiped on sign-out", async () => {
    await pendingDrives.add(A, drive("ref-5"));
    await recorderDrafts.save(A, { points: pts, savedAt: 1 });
    expect(await pendingDrives.list(B)).toEqual([]);
    expect(await recorderDrafts.load(B)).toBeNull();
    expect(await recorderDrafts.load(A)).toEqual({ points: pts, savedAt: 1 });
    await cache.clearUser(A);
    expect(await pendingDrives.list(A)).toEqual([]);
    expect(await recorderDrafts.load(A)).toBeNull();
  });

  it("the old shared draft (owner unknown) is deleted, never offered to whoever signs in", async () => {
    await AsyncStorage.setItem("dynorex.lineDraft", JSON.stringify({ points: pts, savedAt: 1 }));
    expect(await recorderDrafts.load(B)).toBeNull();
    expect(await AsyncStorage.getItem("dynorex.lineDraft")).toBeNull();
  });
});
