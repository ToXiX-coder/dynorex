import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import SignInScreen from "@/app/(auth)/sign-in";
import DataScreen from "@/app/(tabs)/(home)/settings/data";
import GoalScreen from "@/app/onboarding/goal";
import PublicProfileScreen from "@/app/u/[username]";
import UsernameScreen from "@/app/username";
import { ERROR_COPY } from "@/domain/copy/errors";
import { AuthContext, type AuthState } from "@/features/auth/AuthProvider";

// ---------------------------------------------------------------- module mocks
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
let mockSearchParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockSearchParams,
  Redirect: () => null,
  Stack: { Screen: () => null },
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: {},
  AppleAuthenticationButtonStyle: {},
}));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: {} }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("@/services/analytics", () => ({ analytics: { track: jest.fn() } }));

type Res = { ok: true; data?: unknown } | { ok: false; error: { key: string; cancelled?: boolean } };
const okRes = (data?: unknown): Res => ({ ok: true, data });
const mockAuth = {
  signInWithEmail: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  signUpWithEmail: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  resendVerification: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  signInWithApple: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  signInWithGoogle: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  deleteAccount: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  exportData: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  signOut: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  appleAvailable: jest.fn(async () => false),
};
jest.mock("@/features/auth/authService", () => ({
  get authService() {
    return mockAuth;
  },
  redirectUrl: () => "dynorex://auth/callback",
}));

const mockProfiles = {
  usernameAvailable: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  setUsername: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  completeOnboarding: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  skipOnboarding: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  addFirstVehicle: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  getPublic: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  block: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  mute: jest.fn<(...a: unknown[]) => Promise<Res>>(),
};
jest.mock("@/features/profiles/profileService", () => ({
  get profileService() {
    return mockProfiles;
  },
}));
jest.mock("@/services/supabase/client", () => ({ getSupabase: () => null }));

// ---------------------------------------------------------------- helpers
const baseProfile = {
  id: "u1",
  username: "sample_rex",
  display_name: null,
  bio: null,
  general_location: null,
  years_experience: null,
  avatar_path: null,
  build_goal: null,
  driver_gear: null,
  onboarding_step: 2,
  onboarding_completed_at: null,
  onboarding_skipped_at: null,
  default_visibility: "private",
  reputation: 0,
  business_badge: false,
  created_at: "",
  updated_at: "",
  deleted_at: null,
} as const;

function authState(over: Partial<AuthState> = {}): AuthState {
  return {
    status: "signedIn",
    gate: "app",
    user: { id: "u1", email: "sample@example.test", emailVerified: true, providers: ["email"] },
    profile: { ...baseProfile } as unknown as AuthState["profile"],
    guest: false,
    enterGuest: jest.fn(),
    exitGuest: jest.fn(),
    refreshProfile: jest.fn(async () => {}),
    refreshSession: jest.fn(async () => {}),
    ...over,
  };
}

async function renderWith(ui: ReactElement, state = authState()) {
  await render(<AuthContext.Provider value={state}>{ui}</AuthContext.Provider>);
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = {};
});

// ---------------------------------------------------------------- tests
describe("Sign in", () => {
  it("validates before calling the server, then shows the spec copy for a wrong password", async () => {
    await renderWith(
      <SignInScreen />,
      authState({ status: "signedOut", gate: "welcome", user: null, profile: undefined }),
    );
    await fireEvent.press(screen.getAllByRole("button", { name: "Sign in" })[0]!);
    expect(mockAuth.signInWithEmail).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address")).toBeTruthy();

    mockAuth.signInWithEmail.mockResolvedValue({ ok: false, error: { key: "wrongPassword" } });
    await fireEvent.changeText(screen.getByLabelText("Email, required"), "Sample@Example.test ");
    await fireEvent.changeText(screen.getByLabelText("Password, required"), "whatever");
    await fireEvent.press(screen.getAllByRole("button", { name: "Sign in" })[0]!);
    expect(mockAuth.signInWithEmail).toHaveBeenCalledWith("sample@example.test", "whatever");
    expect(screen.getByText(ERROR_COPY.wrongPassword.title)).toBeTruthy();
    expect(screen.getByText(ERROR_COPY.wrongPassword.body)).toBeTruthy();
  });
});

describe("Username", () => {
  it("checks availability, blocks taken names, and saves a free one", async () => {
    jest.useFakeTimers();
    const Username = UsernameScreen;
    const state = await renderWith(<Username />, authState({ gate: "username" }));
    const field = screen.getByLabelText("Username, required");
    const cont = () => screen.getByRole("button", { name: "Continue" });

    mockProfiles.usernameAvailable.mockResolvedValue(okRes(false));
    await fireEvent.changeText(field, "taken_name");
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    expect(screen.getByText("That username is taken or reserved")).toBeTruthy();
    expect(cont().props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(field, "admin");
    expect(screen.getByText("That name is reserved")).toBeTruthy();

    mockProfiles.usernameAvailable.mockResolvedValue(okRes(true));
    mockProfiles.setUsername.mockResolvedValue(okRes());
    await fireEvent.changeText(field, "Fresh_Name");
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    expect(mockProfiles.usernameAvailable).toHaveBeenLastCalledWith("fresh_name");
    expect(cont().props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(cont());
    expect(mockProfiles.setUsername).toHaveBeenCalledWith("fresh_name");
    expect(state.refreshProfile).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe("Onboarding step 3 (goal)", () => {
  it("needs a choice, lists Just Browsing last, marks selection accessibly, and saves it", async () => {
    mockProfiles.completeOnboarding.mockResolvedValue(okRes());
    const Goal = GoalScreen;
    const state = await renderWith(<Goal />, authState({ gate: "onboarding" }));
    const finish = () => screen.getByRole("button", { name: "Finish" });
    expect(finish().props.accessibilityState).toMatchObject({ disabled: true });

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(8);
    expect(radios[7]!.props.accessibilityLabel).toMatch(/^Just Browsing/);

    await fireEvent.press(radios[7]!);
    expect(screen.getAllByRole("radio")[7]!.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(finish());
    expect(mockProfiles.completeOnboarding).toHaveBeenCalledWith("just_browsing");
    expect(state.refreshProfile).toHaveBeenCalled();
  });

  it("Skip records the step and creates nothing", async () => {
    mockProfiles.skipOnboarding.mockResolvedValue(okRes());
    const Goal = GoalScreen;
    await renderWith(<Goal />, authState({ gate: "onboarding" }));
    await fireEvent.press(screen.getByRole("button", { name: "Skip setup" }));
    expect(mockProfiles.skipOnboarding).toHaveBeenCalledWith(3);
    expect(mockProfiles.addFirstVehicle).not.toHaveBeenCalled();
    expect(mockProfiles.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe("Delete account", () => {
  async function open() {
    const Data = DataScreen;
    await renderWith(<Data />);
  }

  it("stays disabled until DELETE is typed and the password entered", async () => {
    await open();
    const btn = () => screen.getByRole("button", { name: "Delete my account" });
    expect(btn().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByLabelText('Type "DELETE" to confirm'), "delete");
    await fireEvent.changeText(screen.getByLabelText("Your password"), "Pw12345678");
    expect(btn().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByLabelText('Type "DELETE" to confirm'), "DELETE");
    expect(btn().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("re-authenticates first and never calls delete if that fails", async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Type "DELETE" to confirm'), "DELETE");
    await fireEvent.changeText(screen.getByLabelText("Your password"), "wrong-Pass1");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));
    expect(screen.getByText(ERROR_COPY.deleteAccount.title)).toBeTruthy();

    mockAuth.signInWithEmail.mockResolvedValue({ ok: false, error: { key: "wrongPassword" } });
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(mockAuth.signInWithEmail).toHaveBeenCalledWith("sample@example.test", "wrong-Pass1");
    expect(mockAuth.deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText(ERROR_COPY.wrongPassword.title)).toBeTruthy();
  });

  it("deletes only after a successful re-auth, then signs out", async () => {
    mockAuth.signInWithEmail.mockResolvedValue(okRes());
    mockAuth.deleteAccount.mockResolvedValue(okRes());
    mockAuth.signOut.mockResolvedValue(okRes());
    await open();
    await fireEvent.changeText(screen.getByLabelText('Type "DELETE" to confirm'), "DELETE");
    await fireEvent.changeText(screen.getByLabelText("Your password"), "Right-Pass1");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    const order = [mockAuth.signInWithEmail, mockAuth.deleteAccount, mockAuth.signOut].map(
      (m) => m.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(screen.getByText("Account deleted")).toBeTruthy();
  });
});

describe("Public profile", () => {
  it("shows the same not-found screen for missing, private or blocked accounts", async () => {
    mockSearchParams = { username: "someone" };
    mockProfiles.getPublic.mockResolvedValue(okRes(null));
    const Profile = PublicProfileScreen;
    await renderWith(<Profile />);
    expect(await screen.findByText(ERROR_COPY.buildNotFound.title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
  });

  it("blocking (in the ⋯ menu) asks for confirmation with a red Block button first", async () => {
    mockSearchParams = { username: "other_user" };
    mockProfiles.getPublic.mockResolvedValue(
      okRes({
        user_id: "u2",
        username: "other_user",
        display_name: null,
        bio: null,
        general_location: null,
        years_experience: null,
        build_goal: null,
        reputation: 3,
        business_badge: false,
      }),
    );
    mockProfiles.block.mockResolvedValue(okRes());
    const Profile = PublicProfileScreen;
    await renderWith(<Profile />);
    // Mute, Report and Block live in the "More options" sheet, not as a wall of buttons
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "More options for @other_user" }));
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Block" }));
    expect(mockProfiles.block).not.toHaveBeenCalled();
    expect(screen.getByText(ERROR_COPY.confirmBlock.title)).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Block" }).at(-1)!;
    await fireEvent.press(confirm);
    expect(mockProfiles.block).toHaveBeenCalledWith("u2");
    expect(screen.getByText(ERROR_COPY.blocked.title)).toBeTruthy();
  });
});
