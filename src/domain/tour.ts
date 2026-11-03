/**
 * The pitch-mode guided tour (D-61): seven stops through the sample data, each a real screen with one line on what
 * to look at, so a judge can explore alone. Paths point at fixed sample ids from src/demo/data.ts.
 */
const sample = (n: number) => `d0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const WRX = sample(0x101);

export const TOUR_STEPS: readonly { path: string; title: string; body: string }[] = [
  {
    path: "/",
    title: "Your garage, your feed",
    body: "Your cars at the top, updates from builds you follow below. Five tabs: Home, Build, add, Line, Paddock.",
  },
  {
    path: `/garage/${WRX}`,
    title: "A build, documented",
    body: "Every mod, cost, photo and service on one page, with spec estimates shown as ranges.",
  },
  {
    path: `/garage/${WRX}/runs`,
    title: "Prove it",
    body: "Runs timed with the phone, and what each mod changed: best run before against best run after.",
  },
  {
    path: `/listings/${sample(0xb03)}`,
    title: "Will it fit?",
    body: "Used parts that show how many owners of your car run that kind of part.",
  },
  {
    path: `/events/${sample(0x706)}`,
    title: "Meets and drives",
    body: "RSVPs, chat, a photo album and a live map for the drive, open only to the people going.",
  },
  {
    path: `/route/${sample(0x601)}`,
    title: "Find your road",
    body: "Shared roads with reviews for scenery, surface and traffic.",
  },
  {
    path: "/settings/appearance",
    title: "Make it yours",
    body: "Five themes and six accent colours. That's the tour: tap around, nothing here is real.",
  },
];

/** The next step after `i`, or null when the tour is over. */
export const nextStep = (i: number) => (i + 1 < TOUR_STEPS.length ? i + 1 : null);
