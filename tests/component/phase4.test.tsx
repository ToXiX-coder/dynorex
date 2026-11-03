import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import DiscoverScreen from "@/app/(tabs)/(home)/discover/index";
import SearchScreen from "@/app/(tabs)/(home)/search";
import NotificationSettings from "@/app/(tabs)/(home)/settings/notifications";
import PublicBuildScreen from "@/app/build/[vehicleId]/index";
import { ERROR_COPY } from "@/domain/copy/errors";
import { NOTIFICATION_CATEGORIES } from "@/domain/notifications";
import { SPEC_DISCLAIMER } from "@/domain/specs";
import { AuthContext, type AuthState } from "@/features/auth/AuthProvider";

// ---------------------------------------------------------------- mocks
let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    const { useEffect: ue } = jest.requireActual<typeof import("react")>("react");
    ue(() => cb(), [cb]);
  },
  // render the header's right-hand button (the "⋯" menu) so it can be tested and audited
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
  Redirect: () => null,
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("@/services/analytics", () => ({ analytics: { track: jest.fn() } }));
jest.mock("@/services/supabase/client", () => ({ getSupabase: () => null }));

type Res = { ok: true; data: unknown } | { ok: false; error: { key: string } };
const ok = (data: unknown = undefined): Res => ({ ok: true, data });
const fn = () => jest.fn<(...a: unknown[]) => Promise<Res>>();
const mockSocial = {
  publicBuild: fn(),
  publicMods: fn(),
  publicMedia: fn(),
  shareLink: fn(),
  isFollowingBuild: fn(),
  followBuild: fn(),
  unfollowBuild: fn(),
  discover: fn(),
  search: fn(),
  prefs: fn(),
  setPref: fn(),
  myRegion: fn(),
  nearby: fn(),
};
jest.mock("@/features/social/socialService", () => ({
  get socialService() {
    return mockSocial;
  },
  FEED_PAGE: 20,
}));

const VID = "a0000000-0000-4000-8000-000000000001";
const VIN = "1SAMPLEVXN0000042";
const baseAuth = {
  gate: "app",
  guest: false,
  enterGuest: () => {},
  exitGuest: jest.fn(),
  refreshProfile: async () => {},
  refreshSession: async () => {},
};
const signedIn = {
  ...baseAuth,
  status: "signedIn",
  user: { id: "u1", email: "sample@example.test", emailVerified: true, providers: ["email"] },
  profile: { username: "viewer_one" },
} as unknown as AuthState;
const guest = { ...baseAuth, status: "signedOut", guest: true, user: null, profile: null } as unknown as AuthState;
const withAuth = (ui: ReactElement, auth: AuthState = signedIn) =>
  render(<AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>);

const publicBuild = {
  build_id: "b0000000-0000-4000-8000-000000000001",
  vehicle_id: VID,
  owner_username: "sample_owner",
  title: "Coupe track prep",
  description: null,
  updated_at: "2026-10-01T00:00:00Z",
  year: 2004,
  make: "Sample",
  model: "Coupe",
  trim_level: null,
  nickname: null,
  has_hero: false,
  followers_count: 3,
  mods_count: 1,
  last_activity_at: "2026-10-01T00:00:00Z",
};
const specs = {
  hp: 220,
  hp_status: "estimate",
  torque_lbft: null,
  torque_status: "unknown",
  weight_lb: 3000,
  weight_status: "estimate",
  zero_to_sixty_s: null,
  zero_to_sixty_status: "unknown",
  lb_per_hp: 13.6,
  lb_per_hp_status: "estimate",
  completed_mods_counted: 1,
};
const mod = {
  mod_id: "c0000000-0000-4000-8000-000000000001",
  vehicle_id: VID,
  build_id: publicBuild.build_id,
  name: "Sample intake",
  category: "engine",
  brand: "SampleBrand",
  part_number: "SB-100",
  status: "complete",
  installed_on: null,
  created_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { vehicleId: VID };
  mockSocial.publicMedia.mockResolvedValue(ok({ heroes: {}, photos: {} }));
  mockSocial.isFollowingBuild.mockResolvedValue(ok(false));
});

describe("public build page", () => {
  it("private, hidden and missing builds all show the same 'Build not found' (existence never leaks)", async () => {
    mockSocial.publicBuild.mockResolvedValue(ok({ status: "not_found" }));
    await withAuth(<PublicBuildScreen />, guest);
    expect(await screen.findByText(ERROR_COPY.buildNotFound.title)).toBeTruthy();
    expect(screen.getByText(ERROR_COPY.buildNotFound.body)).toBeTruthy();
  });

  it("a deleted public build says it no longer exists", async () => {
    mockSocial.publicBuild.mockResolvedValue(ok({ status: "gone" }));
    await withAuth(<PublicBuildScreen />, guest);
    expect(await screen.findByText("This build no longer exists")).toBeTruthy();
  });

  it("a malformed link never reaches the server", async () => {
    mockParams = { vehicleId: "../../garage" };
    await withAuth(<PublicBuildScreen />, guest);
    expect(await screen.findByText(ERROR_COPY.buildNotFound.title)).toBeTruthy();
    expect(mockSocial.publicBuild).not.toHaveBeenCalled();
  });

  it("shows the public projection with the exact disclaimer; guests are asked to sign in to follow", async () => {
    mockSocial.publicBuild.mockResolvedValue(ok({ status: "public", build: publicBuild, specs, mods: [mod] }));
    await withAuth(<PublicBuildScreen />, guest);
    expect(await screen.findByText("Coupe track prep")).toBeTruthy();
    expect(screen.getByText(SPEC_DISCLAIMER)).toBeTruthy();
    expect(screen.getByText("@sample_owner")).toBeTruthy();
    expect(screen.getByText("Sample intake")).toBeTruthy();
    expect(screen.getByText("Sign in to follow")).toBeTruthy();
    // no report/block for guests, no owner-only edit link
    expect(screen.queryByText("Report this build")).toBeNull();
    expect(screen.queryByText("Edit in your garage")).toBeNull();
    expect(screen.queryByText(VIN, { exact: false })).toBeNull();
    expect(screen.queryByText(/odometer|\$|USD/i)).toBeNull();
  });

  it("signed-in viewers can follow (state flips only after the server confirms) and see safety controls", async () => {
    mockSocial.publicBuild.mockResolvedValue(ok({ status: "public", build: publicBuild, specs, mods: [] }));
    mockSocial.followBuild.mockResolvedValue({ ok: false, error: { key: "rateLimited" } });
    await withAuth(<PublicBuildScreen />);
    const follow = await screen.findByLabelText("Follow Coupe track prep");
    await fireEvent.press(follow);
    expect(await screen.findByText(ERROR_COPY.rateLimited.title)).toBeTruthy();
    expect(screen.getByLabelText("Follow Coupe track prep")).toBeTruthy(); // unchanged
    mockSocial.followBuild.mockResolvedValue(ok());
    await fireEvent.press(screen.getByLabelText("Follow Coupe track prep"));
    expect(await screen.findByLabelText("Following Coupe track prep. Tap to unfollow")).toBeTruthy();
    // safety actions live in the "⋯" menu in the header
    expect(screen.queryByText("Report this build")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Build options" }));
    expect(screen.getByRole("button", { name: "Report this build" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Block @sample_owner" })).toBeTruthy();
  });

  it("the owner sees an edit link instead of follow", async () => {
    mockSocial.publicBuild.mockResolvedValue(ok({ status: "public", build: publicBuild, specs, mods: [] }));
    await withAuth(<PublicBuildScreen />, {
      ...signedIn,
      profile: { username: "sample_owner" },
    } as unknown as AuthState);
    expect(await screen.findByText("Edit in your garage")).toBeTruthy();
    expect(screen.queryByText("Follow")).toBeNull();
  });
});

describe("discover and search", () => {
  it("Discover lists server-ranked public builds; Nearby stays hidden while its flag is off", async () => {
    mockSocial.discover.mockResolvedValue(ok([publicBuild]));
    await withAuth(<DiscoverScreen />, guest);
    expect(await screen.findByText("Coupe track prep")).toBeTruthy();
    expect(mockSocial.discover).toHaveBeenCalledWith("trending", 0);
    expect(screen.getByLabelText("Trending")).toBeTruthy();
    expect(screen.queryByLabelText("Nearby")).toBeNull();
    expect(screen.queryByLabelText("For you")).toBeNull(); // guests have no build goal
  });

  it("Search asks guests to sign in", async () => {
    await withAuth(<SearchScreen />, guest);
    expect(screen.getByText("Sign in to search")).toBeTruthy();
  });

  it("Search shows the spec's empty state after the debounce", async () => {
    mockSocial.search.mockResolvedValue(ok([]));
    await withAuth(<SearchScreen />);
    await fireEvent.changeText(screen.getByLabelText("Search builds, users and mods"), "zz");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(mockSocial.search).toHaveBeenCalledWith("zz");
    expect(screen.getByText("Nothing found")).toBeTruthy();
    expect(screen.getByText("Try a different search.")).toBeTruthy();
  });
});

describe("notification settings", () => {
  it("has a switch for every category and only changes one after the server confirms", async () => {
    mockSocial.prefs.mockResolvedValue(ok([]));
    mockSocial.setPref.mockResolvedValue({ ok: false, error: { key: "offline" } });
    await withAuth(<NotificationSettings />);
    for (const c of NOTIFICATION_CATEGORIES) expect(await screen.findByRole("switch", { name: c.label })).toBeTruthy();
    const sw = screen.getByRole("switch", { name: "New followers" });
    expect(sw.props.value).toBe(true);
    await fireEvent(sw, "valueChange", false);
    await waitFor(() => expect(mockSocial.setPref).toHaveBeenCalledWith("new_follower", false));
    expect(await screen.findByText(ERROR_COPY.offline.title)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "New followers" }).props.value).toBe(true);

    mockSocial.setPref.mockResolvedValue(ok(false));
    await fireEvent(screen.getByRole("switch", { name: "New followers" }), "valueChange", false);
    await waitFor(() => expect(screen.getByRole("switch", { name: "New followers" }).props.value).toBe(false));
  });
});
