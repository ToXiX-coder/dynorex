import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Paywall from "@/app/plus";
import { DEFAULT_FLAGS } from "@/domain/flags";

// ---------------------------------------------------------------- mocks
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string> = { source: "limit" };
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
const mockTrack = jest.fn();
jest.mock("@/services/analytics", () => ({ analytics: { track: (...a: unknown[]) => mockTrack(...a) } }));
jest.mock("@/services/supabase/client", () => ({ getSupabase: () => null }));

let mockFlags = { ...DEFAULT_FLAGS };
jest.mock("@/providers/AppProviders", () => ({ useFlags: () => mockFlags }));

type Res = { ok: true; data: unknown } | { ok: false; error: { key: string } };
const free = {
  plus: false,
  status: null,
  product_id: null,
  platform: null,
  expires_at: null,
  grace_until: null,
  will_renew: false,
  via_override: false,
};
const mockSub = {
  mySubscription: jest.fn<() => Promise<Res>>(),
  sync: jest.fn<() => Promise<Res>>(),
};
jest.mock("@/features/plus/subscriptionService", () => ({
  get subscriptionService() {
    return mockSub;
  },
}));
const mockStore = {
  availability: "ready" as "ready" | "unavailable" | "demo",
  platform: "app_store" as const,
  start: async () => {},
  stop: async () => {},
  plans: jest.fn<() => Promise<{ id: "monthly" | "annual"; priceString: string }[] | null>>(),
  purchase: jest.fn<() => Promise<{ ok: true } | { ok: false; cancelled: boolean }>>(),
  restore: jest.fn<() => Promise<boolean>>(),
  manage: async () => {},
};
jest.mock("@/services/purchases/store", () => ({
  get store() {
    return mockStore;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { source: "limit" };
  mockFlags = { ...DEFAULT_FLAGS, subscriptions: true };
  mockStore.availability = "ready";
  mockSub.mySubscription.mockResolvedValue({ ok: true, data: free });
  mockStore.plans.mockResolvedValue([
    { id: "monthly", priceString: "$7.99" },
    { id: "annual", priceString: "$59.99" },
  ]);
});

describe("paywall", () => {
  it("shows Torq's copy, both exact prices, the comparison and the renewal terms before buying", async () => {
    await render(<Paywall />);
    expect(await screen.findByText("That's a Dynorex+ thing")).toBeTruthy();
    expect(screen.getByText("$59.99/year")).toBeTruthy();
    expect(screen.getByText("$7.99/month")).toBeTruthy();
    expect(screen.getByLabelText(/Vehicles: Free, Up to 2\. Dynorex\+, Unlimited/)).toBeTruthy();
    expect(screen.getByLabelText(/Route recordings.*Coming later/)).toBeTruthy();
    expect(
      screen.getByText(/Renews automatically until you cancel\. Cancel any time in your Apple ID settings/),
    ).toBeTruthy();
    expect(screen.getByText("Restore purchases")).toBeTruthy();
    await fireEvent.press(screen.getByText("Not now"));
    expect(mockTrack).toHaveBeenCalledWith("paywall_dismissed", { source_screen: "limit" });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("is honest when Dynorex+ isn't on sale (flag off): nothing can be bought", async () => {
    mockFlags = { ...DEFAULT_FLAGS };
    await render(<Paywall />);
    expect(await screen.findByText(/Dynorex\+ isn't on sale yet/)).toBeTruthy();
    const buy = screen.getByLabelText(/Subscribe for/);
    expect(buy.props.accessibilityState?.disabled).toBe(true);
  });

  it("on web (no store SDK) it points to the app instead of selling", async () => {
    mockStore.availability = "unavailable";
    mockStore.plans.mockResolvedValue(null);
    await render(<Paywall />);
    expect(await screen.findByText(/Buy Dynorex\+ in the Dynorex app/)).toBeTruthy();
    expect(screen.getByText(/US list price shown/)).toBeTruthy();
  });

  it("says 'You're on Dynorex+' only after the server confirms the purchase", async () => {
    mockStore.purchase.mockResolvedValue({ ok: true });
    mockSub.sync.mockResolvedValue({ ok: true, data: { ...free, plus: true, status: "active" } });
    await render(<Paywall />);
    await fireEvent.press(await screen.findByLabelText(/Subscribe for \$59\.99\/year/));
    expect(await screen.findByText("You're on Dynorex+")).toBeTruthy();
    expect(mockSub.sync).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("subscription_started", { plan: "annual" });
  });

  it("if the store took payment but the server hasn't confirmed, it says so and offers to check again", async () => {
    mockStore.purchase.mockResolvedValue({ ok: true });
    mockSub.sync.mockResolvedValue({ ok: true, data: free });
    await render(<Paywall />);
    await fireEvent.press(await screen.findByLabelText(/Subscribe for/));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5000));
    });
    expect(screen.getByText("Confirming your purchase")).toBeTruthy();
    expect(screen.queryByText("You're on Dynorex+")).toBeNull();
    expect(mockTrack).not.toHaveBeenCalledWith("subscription_started", expect.anything());
  }, 15000);

  it("a cancelled store sheet shows no error and changes nothing", async () => {
    mockStore.purchase.mockResolvedValue({ ok: false, cancelled: true });
    await render(<Paywall />);
    await fireEvent.press(await screen.findByLabelText(/Subscribe for/));
    expect(mockSub.sync).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't save")).toBeNull();
  });
});
