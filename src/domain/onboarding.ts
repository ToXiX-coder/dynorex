/** Build-goal cards for onboarding step 3 (handoff spec 5.3). Order matters: Just Browsing is last. */
export const BUILD_GOALS = [
  {
    id: "daily_driver",
    label: "Daily Driver",
    icon: "steering",
    description: "Making it reliable, comfortable, and mine",
  },
  {
    id: "track_build",
    label: "Track Build",
    icon: "helmet",
    description: "Cutting lap times. Every mod has a purpose.",
  },
  { id: "show_car", label: "Show Car", icon: "trophy", description: "Built to turn heads and win trophies" },
  { id: "off_road", label: "Off-Road", icon: "mountain", description: "Lifted, locked, and ready for anything" },
  { id: "jdm_build", label: "JDM Build", icon: "sun", description: "Japanese performance, done right" },
  { id: "restomod", label: "Restomod", icon: "classic", description: "Classic looks, modern everything else" },
  { id: "stance_build", label: "Stance Build", icon: "low", description: "Fitment, camber, and clean lines" },
  { id: "just_browsing", label: "Just Browsing", icon: "eyes", description: "I'm here to explore for now" },
] as const;

export type BuildGoalId = (typeof BUILD_GOALS)[number]["id"];
export type GoalIcon = (typeof BUILD_GOALS)[number]["icon"];

export const ONBOARDING_STEPS = [
  { step: 1, title: "What do you drive?" },
  { step: 2, title: "Show it off" },
  { step: 3, title: "What's the goal?" },
] as const;
