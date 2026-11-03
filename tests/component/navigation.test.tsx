import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { HeaderBack, stackOptions } from "@/components/navigation/stackOptions";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("there is always a way back", () => {
  it("goes back through history when there is any", async () => {
    await render(<HeaderBack fallback="/garage" />);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("goes to the section's home when opened from a link with no history", async () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await render(<HeaderBack fallback="/garage" />);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/garage");
  });

  it("every screen except a stack's starting screens gets the back button", () => {
    const opts = stackOptions("/paddock");
    expect("headerLeft" in opts({ route: { name: "index" } })).toBe(false);
    expect("headerLeft" in opts({ route: { name: "new" } })).toBe(true);
    const root = stackOptions("/", ["(tabs)", "username"]);
    expect("headerLeft" in root({ route: { name: "username" } })).toBe(false);
    expect("headerLeft" in root({ route: { name: "torq" } })).toBe(true);
  });
});
