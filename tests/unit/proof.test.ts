import { describe, expect, it } from "vitest";
import {
  dynoImpact,
  formatLap,
  insuranceHtml,
  insuranceText,
  insuranceTotals,
  parseLapList,
  parseLapTime,
} from "@/domain/proof";
import { toRecallItems, usDate } from "../../supabase/functions/_shared/recalls";

describe("lap times", () => {
  it("reads common formats and refuses impossible laps", () => {
    expect(parseLapTime("1:42.31")).toBe(102310);
    expect(parseLapTime("1:42.3")).toBe(102300);
    expect(parseLapTime("102.31")).toBe(102310);
    expect(parseLapTime("0:59,9")).toBe(59900);
    expect(parseLapTime("1:75.00")).toBeNull(); // 75 seconds isn't a seconds field
    expect(parseLapTime("12.5")).toBeNull(); // under 20 s
    expect(parseLapTime("45:00")).toBeNull(); // over 30 min
    expect(formatLap(102310)).toBe("1:42.31");
    expect(formatLap(59905)).toBe("0:59.91");
  });

  it("pulls laps out of a pasted export without picking up dates or other numbers", () => {
    const csv = [
      "Lap,Time,Max speed",
      "1,1:45.62,112",
      "2,1:44.80,113",
      "Session 2026-10-01 09:14",
      "3,1:43.91,114",
    ].join("\n");
    expect(parseLapList(csv)).toEqual([105620, 104800, 103910]);
    expect(parseLapList("1:44.80\n\n103.91\nnot a time")).toEqual([104800, 103910]);
  });
});

describe("dyno before and after", () => {
  const r = (measured_on: string, whp: number, dyno = "dynojet", correction = "sae") =>
    ({ measured_on, whp, dyno, correction }) as const;
  const mod = (id: string, installed_on: string | null, status = "complete") => ({
    id,
    name: id,
    status,
    installed_on,
  });

  it("compares the last result before a mod with the first after, on the same dyno and correction only", () => {
    const results = [r("2026-06-01", 236), r("2026-07-01", 246), r("2026-08-01", 254, "mustang"), r("2026-09-01", 255)];
    const impact = dynoImpact(results as never, [
      mod("intake", "2026-06-15"),
      mod("exhaust", "2026-07-15"),
      mod("planned", null, "planned"),
    ]);
    expect(impact).toEqual([
      expect.objectContaining({ modId: "intake", before: 236, after: 246, delta: 10, dyno: "dynojet" }),
      // the August result was on a different dyno, so it's skipped for the comparison
      expect.objectContaining({ modId: "exhaust", before: 246, after: 255, delta: 9 }),
    ]);
  });

  it("leaves a mod out when there's nothing comparable before and after", () => {
    expect(dynoImpact([r("2026-07-01", 246)] as never, [mod("intake", "2026-06-15")])).toEqual([]);
    expect(
      dynoImpact([r("2026-06-01", 236), r("2026-07-01", 246, "dynojet", "std")] as never, [
        mod("intake", "2026-06-15"),
      ]),
    ).toEqual([]);
  });
});

describe("insurance mod list", () => {
  const mods = [
    {
      name: "Coilovers",
      brand: "BC <Racing>",
      part_number: "F-12",
      installed_on: "2026-05-01",
      installed_by: "Garage 42",
      cost_minor: 120000,
      currency: "USD",
      receipt: true,
    },
    {
      name: "Intake",
      brand: null,
      part_number: null,
      installed_on: null,
      installed_by: null,
      cost_minor: null,
      currency: null,
      receipt: false,
    },
  ];
  it("totals what's priced and counts receipts", () => {
    expect(insuranceTotals(mods)).toMatchObject({
      count: 2,
      priced: 1,
      receipts: 1,
      totalMinor: 120000,
      currency: "USD",
    });
  });
  it("lists every detail an insurer asks for, and escapes what owners typed", () => {
    const text = insuranceText("2015 Subaru WRX", mods, "Oct 14, 2026");
    expect(text).toContain("- Coilovers · BC <Racing> · part F-12 · fitted 2026-05-01 · by Garage 42");
    expect(text).toContain("receipt kept");
    const html = insuranceHtml("2015 Subaru WRX", mods, "Oct 14, 2026");
    expect(html).toContain("BC &#60;Racing&#62;");
    expect(html).not.toContain("<Racing>");
  });
});

describe("NHTSA recall answers", () => {
  it("keep valid campaigns once, with dates as ISO and park-it flags", () => {
    const answer = {
      Count: 3,
      results: [
        {
          NHTSACampaignNumber: "17V625000",
          Component: "ELECTRICAL SYSTEM:WIRING",
          Summary: " s ",
          ReportReceivedDate: "06/10/2017",
          parkIt: false,
        },
        { NHTSACampaignNumber: "17V625000", Component: "dup" },
        { NHTSACampaignNumber: "nope!", Component: "bad" },
        { NHTSACampaignNumber: "19v100000", parkIt: true, ReportReceivedDate: "2019-01-01" },
      ],
    };
    expect(toRecallItems(answer)).toEqual([
      {
        campaign: "17V625000",
        component: "ELECTRICAL SYSTEM:WIRING",
        summary: "s",
        consequence: null,
        remedy: null,
        reported_on: "2017-06-10",
        park_it: false,
      },
      {
        campaign: "19V100000",
        component: null,
        summary: null,
        consequence: null,
        remedy: null,
        reported_on: null,
        park_it: true,
      },
    ]);
    expect(toRecallItems({ Message: "error" })).toEqual([]);
    // a date that doesn't exist would make the database refuse the whole batch
    expect(usDate("13/40/2020")).toBeNull();
    expect(usDate("02/30/2021")).toBeNull();
    expect(usDate("02/28/2021")).toBe("2021-02-28");
  });
});
