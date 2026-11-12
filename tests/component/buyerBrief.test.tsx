import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { BuyerBrief } from "@/features/record/BuyerBrief";
import type { BuildRecord, RecordEntry } from "@/services/supabase/database.types";

/** D-76: the brief on the buyer's link and on the owner's record. */
const mod: RecordEntry = {
  type: "mod",
  id: "m1",
  title: "Coilovers",
  category: "suspension",
  brand: "Kessler",
  part_number: null,
  compliance: null,
  carb_eo: null,
  installed_by: "Apex Tuning",
  date: "2026-03-01",
  odometer: null,
  whp: null,
  wtq: null,
  dyno: null,
  correction: null,
  logged_at: "2026-03-02T10:00:00Z",
  removed_at: null,
  reopened: false,
  earlier_owner: false,
  has_sheet: false,
  version: 0,
  revisions: [],
  receipts: [],
  confirmation: null,
};
const rec = (entries: RecordEntry[]): BuildRecord => ({
  car: { year: 2019, make: "Audi", model: "RS3", trim: null, kind: "car" },
  odometer: 42000,
  odometer_unit: "mi",
  owners: 1,
  owner_since: "2022-01-01T00:00:00Z",
  sold_at: null,
  entries,
});

describe("BuyerBrief", () => {
  it("shows a buyer the facts and what to ask the seller", async () => {
    await render(<BuyerBrief rec={rec([mod])} side="buyer" today="2026-11-12" />);
    expect(screen.getByText("Before you pay")).toBeTruthy();
    expect(screen.getByText("1 finished mod: 1 by a named shop.")).toBeTruthy();
    expect(screen.getByText("Ask the seller")).toBeTruthy();
    expect(screen.getByText("Ask whether the stock parts come with the car.")).toBeTruthy();
  });

  it("shows the owner the same gaps in their own words, without the facts", async () => {
    await render(<BuyerBrief rec={rec([mod])} side="seller" today="2026-11-12" />);
    expect(screen.getByText("What a buyer will ask")).toBeTruthy();
    expect(screen.getByText("1 mod has no receipt on file. Add the ones you still have.")).toBeTruthy();
    expect(screen.queryByText("1 finished mod: 1 by a named shop.")).toBeNull();
  });

  it("renders nothing for the owner when there is nothing to ask", async () => {
    const { toJSON } = await render(<BuyerBrief rec={rec([])} side="seller" today="2026-11-12" />);
    expect(toJSON()).toBeNull();
  });
});
