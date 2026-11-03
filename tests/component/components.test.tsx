import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { ErrorState, ProgressBar } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { ERROR_COPY } from "@/domain/copy/errors";
import { color } from "@/theme/tokens";

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

describe("Button", () => {
  it("is an accessible button that reports busy and disabled", async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<Button title="Save" onPress={onPress} loading />);
    const busy = screen.getByRole("button", { name: "Save" });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("meets the 44pt minimum touch target", async () => {
    await render(<Button title="Go" />);
    const style = [screen.getByRole("button").props.style].flat(3).reduce((a, s) => ({ ...a, ...(s ?? {}) }), {});
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });
});

describe("Chip", () => {
  it("exposes checked state and a non-colour cue (a solid ink fill)", async () => {
    await render(<Chip label="Track Build" selected onPress={() => {}} />);
    const chip = screen.getByRole("checkbox", { name: "Track Build" });
    expect(chip.props.accessibilityState).toMatchObject({ checked: true });
    const style = [chip.props.style].flat(3).reduce((a, s) => ({ ...a, ...(s ?? {}) }), {});
    expect(style.backgroundColor).toBe(color.text);
  });
});

describe("TextField", () => {
  it("keeps a visible label and announces errors", async () => {
    await render(<TextField label="Username" required error="Already taken" />);
    expect(screen.getByText(/^Username/)).toBeTruthy();
    expect(screen.getByText(/\(required\)/)).toBeTruthy();
    expect(screen.getByLabelText("Username, required")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Already taken")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("uses the spec copy verbatim and a red destructive action first", async () => {
    const onAction = jest.fn();
    await render(<ErrorState kind="deleteVehicle" onAction={onAction} />);
    expect(screen.getByText(ERROR_COPY.deleteVehicle.title)).toBeTruthy();
    expect(screen.getByText(ERROR_COPY.deleteVehicle.body)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(onAction).toHaveBeenCalledWith("Delete");
    expect(screen.queryByText(/error has occurred/i)).toBeNull();
  });
});

describe("ProgressBar", () => {
  it("exposes a programmatic value and a text value", async () => {
    await render(<ProgressBar value={0.42} label="Upload" />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 42, min: 0, max: 100 });
    expect(screen.getByText("Upload: 42%")).toBeTruthy();
  });
});

describe("ComingSoon teaser", () => {
  it("has no buttons, so nothing pretends to work", async () => {
    await render(<ComingSoon title="Line" lines={["Record drives"]} />);
    expect(screen.getByText("COMING SOON")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
