import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useEffect, type ReactElement } from "react";
import ModDetailScreen from "@/app/(tabs)/garage/[vehicleId]/mods/[modId]/index";
import VehicleDetailScreen from "@/app/(tabs)/garage/[vehicleId]/index";
import WishlistScreen from "@/app/(tabs)/garage/wishlist";
import { CostChart } from "@/components/build/CostChart";
import { SpecCard } from "@/components/build/SpecCard";
import { ERROR_COPY } from "@/domain/copy/errors";
import { SPEC_DISCLAIMER } from "@/domain/specs";
import { AuthContext, type AuthState } from "@/features/auth/AuthProvider";
import { deltasFromMod, fieldsFromMod, ModFormView } from "@/features/mods/ModFormView";

// ---------------------------------------------------------------- mocks
let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
  // run the focus callback once, like a screen gaining focus on mount
  useFocusEffect: (cb: () => void) => {
    const { useEffect: ue } = jest.requireActual<typeof import("react")>("react");
    ue(() => cb(), [cb]);
  },
  Stack: { Screen: () => null },
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
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000999" }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { JPEG: "jpeg" } }));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("@/services/analytics", () => ({ analytics: { track: jest.fn() } }));
jest.mock("@/services/supabase/client", () => ({ getSupabase: () => null }));

type Res = { ok: true; data: unknown } | { ok: false; error: { key: string } };
const ok = (data: unknown = undefined): Res => ({ ok: true, data });
const mockBuild = {
  getVehicle: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  specEstimate: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  listMods: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  getMod: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  modPhotos: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  deleteMod: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  setModStatus: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  deletePhoto: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  listWishlist: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  addWishlist: jest.fn<(...a: unknown[]) => Promise<Res>>(),
  deleteWishlist: jest.fn<(...a: unknown[]) => Promise<Res>>(),
};
jest.mock("@/features/garage/buildService", () => ({
  get buildService() {
    return mockBuild;
  },
  PAGE_SIZE: 20,
}));

const authState = {
  status: "signedIn",
  gate: "app",
  user: { id: "u1", email: "sample@example.test", emailVerified: true, providers: ["email"] },
  profile: null,
  guest: false,
  enterGuest: () => {},
  exitGuest: () => {},
  refreshProfile: async () => {},
  refreshSession: async () => {},
} as unknown as AuthState;
const withAuth = (ui: ReactElement) => render(<AuthContext.Provider value={authState}>{ui}</AuthContext.Provider>);

const unknownEstimate = {
  hp: null,
  hp_status: "unknown",
  torque_lbft: null,
  torque_status: "unknown",
  weight_lb: 2780,
  weight_status: "estimate",
  zero_to_sixty_s: null,
  zero_to_sixty_status: "unknown",
  lb_per_hp: null,
  lb_per_hp_status: "unknown",
  completed_mods_counted: 1,
  pending_hp_delta: 90,
  pending_torque_delta: 0,
  pending_weight_delta: 0,
  pending_zero_to_sixty_delta: 0,
};
const vehicle = {
  id: "v1",
  owner_id: "u1",
  year: 2004,
  make: "Sample",
  model: "Coupe",
  trim_level: null,
  nickname: "Weekend car",
  vin: null,
  odometer: null,
  odometer_unit: "mi",
  description: null,
  baseline_hp: null,
  baseline_torque_lbft: null,
  baseline_weight_lb: 2800,
  baseline_zero_to_sixty_s: null,
  baseline_source: "user_reported",
  data_source: "manual",
  nhtsa_make_id: null,
  nhtsa_model_id: null,
  hero_path: null,
  visibility: "private",
  client_ref: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "",
  deleted_at: null,
};
const mod = {
  id: "m1",
  owner_id: "u1",
  vehicle_id: "v1",
  name: "Sample coilovers",
  category: "suspension",
  brand: "Sample Parts Co.",
  part_number: "SP-1",
  cost_minor: 125000,
  currency: "USD",
  status: "complete",
  spec_deltas: { schema_version: 1, weight: { delta: -20, unit: "lb" } },
  notes: null,
  installed_on: "2026-03-14",
  status_changed_at: "2026-03-14T00:00:00Z",
  client_ref: null,
  created_at: "2026-03-14T00:00:00Z",
  updated_at: "",
  deleted_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

// ---------------------------------------------------------------- tests
describe("SpecCard", () => {
  it("always shows the exact disclaimer, says unknown instead of a number, and lists pending changes separately", async () => {
    await render(<SpecCard estimate={unknownEstimate as never} />);
    expect(screen.getByText(SPEC_DISCLAIMER)).toBeTruthy();
    expect(screen.getByLabelText("HP: unknown, no baseline")).toBeTruthy();
    // one completed mod: estimates are ranges, with the point estimate alongside
    expect(screen.getByLabelText("Weight: about 2720 to 2840 lb, estimate 2780")).toBeTruthy();
    expect(screen.getByText(/Planned or in progress, not counted yet: \+90 hp/)).toBeTruthy();
  });

  it("a stock car (no completed mods) shows its exact stock numbers, not a range", async () => {
    await render(<SpecCard estimate={{ ...unknownEstimate, completed_mods_counted: 0 } as never} />);
    expect(screen.getByLabelText("Weight: 2780 lb, stock")).toBeTruthy();
    expect(screen.getByText(/Stock numbers, as you entered them/)).toBeTruthy();
  });
});

describe("Vehicle Detail", () => {
  it("shows specs with the disclaimer and the exact empty-timeline message", async () => {
    mockParams = { vehicleId: "v1" };
    mockBuild.getVehicle.mockResolvedValue(ok(vehicle));
    mockBuild.specEstimate.mockResolvedValue(ok(unknownEstimate));
    mockBuild.listMods.mockResolvedValue(ok([]));
    await withAuth(<VehicleDetailScreen />);
    expect(await screen.findByText("Add your first mod to start your build story")).toBeTruthy();
    expect(screen.getByText(SPEC_DISCLAIMER)).toBeTruthy();
    expect(screen.getByText("Weekend car")).toBeTruthy();
  });

  it("shows 'Build not found' for a vehicle that isn't yours or doesn't exist", async () => {
    mockParams = { vehicleId: "nope" };
    mockBuild.getVehicle.mockResolvedValue(ok(null));
    mockBuild.specEstimate.mockResolvedValue(ok(null));
    mockBuild.listMods.mockResolvedValue(ok([]));
    await withAuth(<VehicleDetailScreen />);
    expect(await screen.findByText(ERROR_COPY.buildNotFound.title)).toBeTruthy();
  });
});

describe("Mod form", () => {
  function Harness({ onSubmit }: { onSubmit: (...a: unknown[]) => void }) {
    const { useState: us } = jest.requireActual<typeof import("react")>("react");
    const [f, setF] = us(fieldsFromMod(null));
    const [d, setD] = us(deltasFromMod(null));
    useEffect(() => {}, []);
    return (
      <ModFormView
        fields={f}
        deltas={d}
        onFieldsChange={setF}
        onDeltasChange={setD}
        busy={false}
        error={null}
        submitLabel="Save mod"
        onSubmit={onSubmit}
      />
    );
  }

  it("puts the fields in the spec's exact order", async () => {
    await render(<Harness onSubmit={() => {}} />);
    const text = JSON.stringify(screen.toJSON());
    const order = [
      "Name",
      "Category",
      "Brand",
      "Part number",
      "Cost (USD)",
      "Status",
      "Photos",
      "Spec changes (optional)",
      "Notes",
    ];
    const positions = order.map((label) => text.indexOf(`"${label}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("validates, keeps input on errors, and submits cost in minor units with typed deltas", async () => {
    const onSubmit = jest.fn();
    await render(<Harness onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole("button", { name: "Save mod" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Name the mod")).toBeTruthy();
    expect(screen.getByText("Pick a category")).toBeTruthy();

    // Name is a dropdown: open it, type a name that isn't in the list, and use it as typed
    await fireEvent.press(screen.getByRole("button", { name: "Name: not chosen" }));
    await fireEvent.changeText(screen.getByLabelText("Search name"), "Sample intake");
    await fireEvent.press(screen.getByRole("button", { name: "Use Sample intake" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Engine" }));
    await fireEvent.changeText(screen.getByLabelText("Cost (USD)"), "249.99");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Complete" }));
    await fireEvent.changeText(screen.getByLabelText("Power"), "8");
    await fireEvent.press(screen.getByRole("button", { name: "Save mod" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sample intake",
        category: "engine",
        cost_minor: 24999,
        currency: "USD",
        status: "complete",
      }),
      { schema_version: 1, hp: { delta: 8, unit: "hp" } },
    );
    // input still there after submit (nothing cleared)
    expect(screen.getByRole("button", { name: "Name: Sample intake" })).toBeTruthy();
  });

  it("picking a common mod from the list fills in its category", async () => {
    const onSubmit = jest.fn();
    await render(<Harness onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole("button", { name: "Name: not chosen" }));
    await fireEvent.changeText(screen.getByLabelText("Search name"), "downp");
    await fireEvent.press(screen.getByRole("button", { name: "Downpipe, Exhaust" }));
    await fireEvent.press(screen.getByRole("button", { name: "Brand: not chosen" }));
    await fireEvent.press(screen.getByRole("button", { name: "Invidia" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save mod" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Downpipe", category: "exhaust", brand: "Invidia" }),
      expect.anything(),
    );
  });
});

describe("Mod Detail", () => {
  it("deletes only after the red confirm with the spec copy", async () => {
    mockParams = { vehicleId: "v1", modId: "m1" };
    mockBuild.getMod.mockResolvedValue(ok(mod));
    mockBuild.modPhotos.mockResolvedValue(ok([]));
    mockBuild.deleteMod.mockResolvedValue(ok());
    await withAuth(<ModDetailScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete mod" }));
    expect(mockBuild.deleteMod).not.toHaveBeenCalled();
    expect(screen.getByText(ERROR_COPY.deleteMod.title)).toBeTruthy();
    expect(screen.getByText(ERROR_COPY.deleteMod.body)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(mockBuild.deleteMod).toHaveBeenCalledWith("m1");
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("explains that spec changes count only when complete", async () => {
    mockParams = { vehicleId: "v1", modId: "m1" };
    mockBuild.getMod.mockResolvedValue(ok({ ...mod, status: "planned" }));
    mockBuild.modPhotos.mockResolvedValue(ok([]));
    await withAuth(<ModDetailScreen />);
    expect(await screen.findByText("Not counted until this mod is Complete.")).toBeTruthy();
    expect(screen.getByText("Weight: -20 lb")).toBeTruthy();
  });
});

describe("Wishlist", () => {
  it("rejects unsafe links before they reach the server", async () => {
    mockBuild.listWishlist.mockResolvedValue(ok([]));
    await withAuth(<WishlistScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Part, required"), "Sample exhaust");
    await fireEvent.changeText(screen.getByLabelText("Link"), "javascript:alert(1)");
    await fireEvent.press(screen.getByRole("button", { name: "Add to wishlist" }));
    expect(screen.getByText("Use a link that starts with https://")).toBeTruthy();
    expect(mockBuild.addWishlist).not.toHaveBeenCalled();
  });

  it("asks before leaving the app and names the site and affiliate status", async () => {
    mockBuild.listWishlist.mockResolvedValue(
      ok([
        {
          id: "w1",
          owner_id: "u1",
          vehicle_id: null,
          name: "Sample exhaust",
          url: "https://shop.example.com/x",
          price_minor: null,
          currency: null,
          notes: null,
          is_affiliate: false,
          created_at: "",
          updated_at: "",
          deleted_at: null,
        },
      ]),
    );
    await withAuth(<WishlistScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Open link" }));
    await waitFor(() => expect(screen.getByText(/This opens shop\.example\.com in your browser/)).toBeTruthy());
    expect(screen.getByText("Not an affiliate link. Dynorex earns nothing from it.")).toBeTruthy();
  });
});

describe("Cost chart", () => {
  it("gives every slice a text label, amount and percentage", async () => {
    await render(
      <CostChart
        currency="USD"
        categories={[
          { category: "engine", spent: 30000, share: 0.75 },
          { category: "suspension", spent: 10000, share: 0.25 },
        ]}
      />,
    );
    expect(screen.getByLabelText(/^Engine: .*300\.00, 75 percent$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Suspension: .*100\.00, 25 percent$/)).toBeTruthy();
  });
});
