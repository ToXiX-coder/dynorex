import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DateField, DurationField, TimeField } from "@/components/forms/PickerFields";

jest.mock("@/services/haptics", () => ({ haptic: { tap: jest.fn(), success: jest.fn(), select: jest.fn() } }));

const adjust = async (name: string, action: "increment" | "decrement", times = 1) => {
  for (let i = 0; i < times; i++)
    await fireEvent(screen.getByRole("adjustable", { name }), "accessibilityAction", {
      nativeEvent: { actionName: action },
    });
};

describe("scroll-wheel pickers", () => {
  it("date: wheels change a draft; Done saves it", async () => {
    const onChange = jest.fn();
    await render(
      <DateField label="Install date" value="2026-10-08" onChange={onChange} min="2000-01-01" max="2027-12-31" />,
    );
    await fireEvent.press(screen.getByRole("button", { name: /^Install date:/ }));
    await adjust("Day", "increment", 2);
    await adjust("Month", "decrement");
    expect(onChange).not.toHaveBeenCalled(); // nothing changes until Done
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10");
  });

  it("optional dates can be cleared", async () => {
    const onChange = jest.fn();
    await render(<DateField label="Install date" value="2026-10-08" onChange={onChange} />);
    await fireEvent.press(screen.getByRole("button", { name: /^Install date:/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("time: 12-hour wheels save a 24-hour value", async () => {
    const onChange = jest.fn();
    await render(<TimeField label="Start time" value="09:00" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Start time: 9:00 AM" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Start time:/ }));
    await adjust("AM or PM", "increment");
    await adjust("Minute", "increment", 3);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("21:15");
  });

  it("how long: hours and minutes save as minutes", async () => {
    const onChange = jest.fn();
    await render(<DurationField label="How long" minutes={120} onChange={onChange} />);
    await fireEvent.press(screen.getByRole("button", { name: "How long: 2 h" }));
    await adjust("Minutes", "increment", 2);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith(150);
  });
});
