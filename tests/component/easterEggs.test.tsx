import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PowerGauge } from "@/components/vehicle/PowerGauge";
import { TorqNote } from "@/components/mascot/TorqNote";
import { prankPartLine } from "@/domain/easterEggs";

let mockReduced = false;
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));
jest.mock("@/services/haptics", () => ({ haptic: { tap: jest.fn(), success: jest.fn(), select: jest.fn() } }));

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

/** The needle is the last <Line> in the gauge: read its tip. */
type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null };
function needleTip() {
  const found: Record<string, unknown>[] = [];
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === "string") return;
    if (n.props && "x2" in n.props) found.push(n.props);
    n.children?.forEach(walk);
  };
  const tree = screen.toJSON() as Node | Node[] | null;
  (Array.isArray(tree) ? tree : [tree]).forEach(walk);
  const p = found.at(-1)!;
  return `${Math.round(Number(p.x2))},${Math.round(Number(p.y2))}`;
}

describe("rev the gauge", () => {
  it("the needle swings toward the limiter and comes back; the readout never changes", async () => {
    mockReduced = false;
    await render(<PowerGauge hp={200} stockHp={180} />);
    await act(async () => {
      jest.advanceTimersByTime(2000); // let the count-up settle
    });
    const idle = needleTip();
    await fireEvent.press(screen.getByRole("button", { name: /Power gauge/ }));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(needleTip()).not.toBe(idle);
    expect(screen.getByText("Bang, bang! Rev limiter.")).toBeTruthy();
    expect(screen.getByText(/HP · ESTIMATED RANGE/)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(needleTip()).toBe(idle);
  });

  it("with reduced motion it only talks", async () => {
    mockReduced = true;
    await render(<PowerGauge hp={200} />);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    const idle = needleTip();
    await fireEvent.press(screen.getByRole("button", { name: /Power gauge/ }));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(needleTip()).toBe(idle);
    expect(screen.getByText("Bang, bang! Rev limiter.")).toBeTruthy();
  });
});

describe("Torq's prank-part note", () => {
  it("reads as Torq speaking", async () => {
    await render(<TorqNote text={prankPartLine("blinker fluid")!} />);
    expect(screen.getByLabelText(/^Torq says: Blinker fluid\?/)).toBeTruthy();
  });
});
