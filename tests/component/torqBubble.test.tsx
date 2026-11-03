import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { OPEN_AFTER_MS, showTorqBubble, TorqBubble } from "@/features/torq/TorqBubble";

const mockRouter = { push: jest.fn() };
let mockPath = "/";
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  usePathname: () => mockPath,
}));
jest.mock("@/services/haptics", () => ({ haptic: { tap: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockReduced = false;
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.push.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

/** The drawn dial (needle included): changes whenever the needle moves. */
const needleTip = () => JSON.stringify(screen.toJSON());

describe("Ask Torq bubble", () => {
  it("shows on browsing screens, never over a form's Save button", () => {
    for (const p of ["/", "/garage", "/garage/abc", "/line", "/paddock", "/discover", "/inbox", "/profile"])
      expect([p, showTorqBubble(p)]).toEqual([p, true]);
    for (const p of [
      "/garage/new",
      "/garage/abc/edit",
      "/garage/abc/mods/new",
      "/garage/abc/mods/m1/edit",
      "/garage/abc/costs",
      "/paddock/new",
      "/paddock/post",
      "/paddock/club-new",
      "/line/record",
      "/driver",
      "/profile-edit",
      "/search",
      "/settings/privacy",
      "/torq",
    ])
      expect([p, showTorqBubble(p)]).toEqual([p, false]);
  });

  it("tap: the needle redlines, bounces off the limiter, then the chat opens", async () => {
    mockReduced = false;
    mockPath = "/paddock";
    await render(<TorqBubble />);
    const idle = needleTip();
    await fireEvent.press(screen.getByRole("button", { name: "Ask Torq" }));
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(needleTip()).not.toBe(idle); // swung into the red
    expect(mockRouter.push).not.toHaveBeenCalled(); // still revving
    await act(async () => {
      jest.advanceTimersByTime(OPEN_AFTER_MS);
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/torq");
    expect(needleTip()).toBe(idle); // back at idle for when you return
  });

  it("with reduced motion the chat opens straight away", async () => {
    mockReduced = true;
    mockPath = "/";
    await render(<TorqBubble />);
    await fireEvent.press(screen.getByRole("button", { name: "Ask Torq" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/torq");
  });
});
