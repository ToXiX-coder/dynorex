/**
 * Home's first-run checklist (D-63, aimed at the Build Record in D-66): the four steps that get a new owner to a
 * record a buyer can weigh, shared. Shown on Home until done or dismissed.
 */
export type FirstBuildFacts = {
  /** the car the checklist follows (the owner's most recently updated one), or null */
  vehicleId: string | null;
  finishedMods: number;
  /** the owner's own live record entries with something behind them: paperwork, a part number or a shop */
  backed: number;
  /** a buyer's link is live for that car */
  shared: boolean;
};

export type FirstBuildStep = { id: "car" | "mod" | "paperwork" | "share"; title: string; detail: string; done: boolean };

export function firstBuildSteps(f: FirstBuildFacts): FirstBuildStep[] {
  return [
    {
      id: "car",
      title: "Add your car",
      detail: "Year, make and model. Factory specs fill in.",
      done: f.vehicleId !== null,
    },
    {
      id: "mod",
      title: "Log a finished mod",
      detail: "Brand, date and who fitted it. It goes on your Build Record.",
      done: f.finishedMods > 0,
    },
    {
      id: "paperwork",
      title: "Back it up",
      detail: "Add the receipt, a part number or a dyno sheet.",
      done: f.backed > 0,
    },
    {
      id: "share",
      title: "Share the record",
      detail: "Make a buyer's link to send with your listing.",
      done: f.shared,
    },
  ];
}

/** The first step not done yet, or null when the record is backed up and shared. */
export const nextFirstBuildStep = (steps: readonly FirstBuildStep[]) => steps.find((s) => !s.done) ?? null;
