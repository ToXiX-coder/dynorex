import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { BrandSplash, TAGLINE } from "@/components/mascot/BrandSplash";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { INTRO_MS, QUICK_INTRO_MS } from "@/domain/intro";

let mockReduced = false;
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));

beforeEach(async () => {
  // every test starts as a first launch (the device hasn't seen the full intro)
  await AsyncStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const play = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe("app-open splash", () => {
  it("tachometer first, then the logo with the fuel gauge and tagline; done after exactly 5 s", async () => {
    mockReduced = false;
    const onIntroDone = jest.fn();
    await render(<BrandSplash onIntroDone={onIntroDone} />);
    expect(screen.getByText("RPM × 1000")).toBeTruthy(); // the tach is on stage first
    await play(3000);
    expect(screen.queryByText("RPM × 1000")).toBeNull(); // faded into the logo
    // the gauge is decorative (hidden from screen readers; the splash itself reads "Loading")
    expect(screen.getByText("E", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("F", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(TAGLINE)).toBeTruthy();
    await play(INTRO_MS - 3000 - 100);
    expect(onIntroDone).not.toHaveBeenCalled(); // not before 5 s
    await play(200);
    expect(onIntroDone).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(`Dynorex. ${TAGLINE} Loading`)).toBeTruthy();
  });

  it("plays with reduced motion too (gentler: no zoom, still slashes), same 5 s", async () => {
    mockReduced = true;
    const onIntroDone = jest.fn();
    await render(<BrandSplash onIntroDone={onIntroDone} />);
    expect(screen.getByText("RPM × 1000")).toBeTruthy();
    expect(onIntroDone).not.toHaveBeenCalled();
    await play(INTRO_MS + 100);
    expect(onIntroDone).toHaveBeenCalledTimes(1);
  });

  it("later launches play the 1.2 s version: logo and fuel gauge, no tachometer", async () => {
    mockReduced = false;
    await AsyncStorage.setItem("dynorex:intro:v1", "1");
    const onIntroDone = jest.fn();
    await render(<BrandSplash onIntroDone={onIntroDone} />);
    await play(50);
    expect(screen.queryByText("RPM × 1000")).toBeNull();
    await play(QUICK_INTRO_MS + 100);
    expect(onIntroDone).toHaveBeenCalledTimes(1);
  });
});
