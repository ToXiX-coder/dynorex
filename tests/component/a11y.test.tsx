/* eslint-disable @typescript-eslint/no-require-imports -- screens load lazily per case, after mocks */
import { describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { StyleSheet } from "react-native";
import { DEMO_ME, seedDemo } from "@/demo/data";
import { DEFAULT_FLAGS } from "@/domain/flags";
import { AuthContext, type AuthState } from "@/features/auth/AuthProvider";

/**
 * Phase 6 automated accessibility audit. Renders real screens on the pitch-mode sample data (no mocks per
 * screen) and checks every host element for: a screen-reader name and role on everything tappable, no
 * explicit tap target under 44x44, labeled images/switches/inputs, and nothing that disables text scaling.
 * Manual checks (VoiceOver/TalkBack order, 200% text, contrast in context) are in docs/accessibility.md.
 */
let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    const { useEffect: ue } = jest.requireActual<typeof import("react")>("react");
    ue(() => cb(), [cb]);
  },
  // render the header's right-hand button (the "⋯" menu) so it can be tested and audited
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
  Redirect: () => null,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock("@/services/analytics", () => ({ analytics: { track: jest.fn() } }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000999" }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { JPEG: "jpeg" } }));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("@/services/config", () => {
  const flags = { ...jest.requireActual<typeof import("@/domain/flags")>("@/domain/flags").DEFAULT_FLAGS };
  return {
    config: {
      appEnv: "development",
      supabaseUrl: null,
      supabaseAnonKey: null,
      sentryDsn: null,
      mapboxToken: null,
      release: "test",
      flags: {
        ...flags,
        subscriptions: true,
        discoverNearby: true,
        buildOfTheWeek: true,
        line: true,
        paddock: true,
        torqChat: true,
      },
      appStoreUrl: null,
      playStoreUrl: null,
      easProjectId: null,
      demoMode: true,
      revenueCatIosKey: null,
      revenueCatAndroidKey: null,
      legal: { terms: null, privacy: null, guidelines: null, affiliate: null, supportEmail: null },
    },
    backendConfigured: () => true,
    resolveDemoMode: () => true,
  };
});

const me = seedDemo().users.find((u) => u.id === DEMO_ME)!;
const auth = {
  status: "signedIn",
  gate: "app",
  user: { id: DEMO_ME, email: null, emailVerified: true, providers: ["pitch"] },
  profile: me,
  guest: false,
  enterGuest: () => {},
  exitGuest: () => {},
  refreshProfile: async () => {},
  refreshSession: async () => {},
} as unknown as AuthState;

// ---------------------------------------------------------------- the audit

type Host = { type: unknown; props: Record<string, unknown>; children: (Host | string)[] };
const INTERACTIVE = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "togglebutton"]);
const text = (n: Host | string): string =>
  typeof n === "string" ? n : n.children.map(text).join(" ").replace(/\s+/g, " ").trim();
const name = (n: Host) =>
  (n.props.accessibilityLabel as string | undefined) ?? (n.props["aria-label"] as string | undefined) ?? text(n);

let checked = 0;
function audit(root: Host): string[] {
  const problems: string[] = [];
  checked = 0;
  const walk = (n: Host | string) => {
    if (typeof n === "string") return;
    const p = n.props;
    const type = String(n.type);
    const role = p.accessibilityRole as string | undefined;
    const tappable = typeof p.onClick === "function" || typeof p.onResponderRelease === "function";
    const label = name(n);
    if ((tappable && p.accessible !== false) || (role && INTERACTIVE.has(role))) {
      checked++;
      if (!label) problems.push(`${type} (${role ?? "no role"}) has no accessible name`);
      if (tappable && !role) problems.push(`"${label}" is tappable but has no role`);
      const s = (StyleSheet.flatten(p.style as never) ?? {}) as Record<string, unknown>;
      const slop = typeof p.hitSlop === "number" ? p.hitSlop * 2 : 0;
      for (const k of ["height", "minHeight"] as const) {
        const v = (s as Record<string, unknown>)[k];
        if (typeof v === "number" && v + slop < 44 && !(k === "height" && Number(s.minHeight) >= 44))
          problems.push(`"${label}" ${k} ${v} is under 44`);
      }
    }
    if ((type === "Image" || type === "RCTImageView") && p.accessible !== false && !p.accessibilityLabel && !p.alt)
      problems.push("image without a text alternative");
    if (type === "RCTSwitch" && !p.accessibilityLabel) problems.push("switch without a label");
    if (type === "TextInput" && !p.accessibilityLabel) problems.push("text field without a label");
    if (p.allowFontScaling === false) problems.push(`text scaling disabled near "${label.slice(0, 30)}"`);
    n.children.forEach(walk);
  };
  walk(root);
  return [...new Set(problems)];
}

const WRX = "d0000000-0000-4000-8000-000000000101";
// [name, screen, route params, minimum tappable controls expected once loaded]
const CASES: [string, () => ComponentType, Record<string, string>, number?][] = [
  ["Home", () => require("@/app/(tabs)/(home)/index").default, {}],
  ["Garage", () => require("@/app/(tabs)/garage/index").default, {}],
  ["Vehicle detail", () => require("@/app/(tabs)/garage/[vehicleId]/index").default, { vehicleId: WRX }],
  ["Add mod", () => require("@/app/(tabs)/garage/[vehicleId]/mods/new").default, { vehicleId: WRX }],
  ["Costs", () => require("@/app/(tabs)/garage/[vehicleId]/costs").default, { vehicleId: WRX }, 0],
  ["Wishlist", () => require("@/app/(tabs)/garage/wishlist").default, {}],
  ["Discover", () => require("@/app/(tabs)/(home)/discover/index").default, {}],
  ["Search", () => require("@/app/(tabs)/(home)/search").default, {}, 0],
  ["Inbox", () => require("@/app/(tabs)/(home)/inbox").default, {}],
  ["My profile", () => require("@/app/(tabs)/(home)/profile").default, {}],
  ["Public profile", () => require("@/app/u/[username]").default, { username: "apex_hunter" }],
  ["Public build", () => require("@/app/build/[vehicleId]/index").default, { vehicleId: WRX }],
  ["Paywall", () => require("@/app/plus").default, { source: "limit" }],
  ["Settings", () => require("@/app/(tabs)/(home)/settings/index").default, {}],
  ["Notification settings", () => require("@/app/(tabs)/(home)/settings/notifications").default, {}],
  ["Dynorex+ settings", () => require("@/app/(tabs)/(home)/settings/subscription").default, {}, 2],
  ["Privacy settings", () => require("@/app/(tabs)/(home)/settings/privacy").default, {}],
  ["About", () => require("@/app/(tabs)/(home)/settings/about").default, {}, 2],
  ["Support", () => require("@/app/support").default, {}, 0],
  ["Line hub", () => require("@/app/(tabs)/line/index").default, {}],
  ["Record a drive", () => require("@/app/(tabs)/line/record").default, {}, 1],
  ["Route page", () => require("@/app/route/[routeId]").default, { routeId: "d0000000-0000-4000-8000-000000000601" }],
  ["Paddock events", () => require("@/app/(tabs)/paddock/index").default, {}],
  ["Create event", () => require("@/app/(tabs)/paddock/new").default, {}],
  ["Event page", () => require("@/app/events/[eventId]").default, { eventId: "d0000000-0000-4000-8000-000000000701" }],
  [
    "Event page (host)",
    () => require("@/app/events/[eventId]").default,
    { eventId: "d0000000-0000-4000-8000-000000000704" },
    1,
  ],
  ["Account deletion page", () => require("@/app/account-deletion").default, {}, 0],
  // Phase 7b
  [
    "Group drive page",
    () => require("@/app/events/[eventId]").default,
    { eventId: "d0000000-0000-4000-8000-000000000705" },
  ],
  [
    "Plan a group drive",
    () => require("@/app/(tabs)/paddock/new").default,
    { routeId: "d0000000-0000-4000-8000-000000000601" },
  ],
  ["Edit event", () => require("@/app/(tabs)/paddock/new").default, { edit: "d0000000-0000-4000-8000-000000000704" }],
  ["New post", () => require("@/app/(tabs)/paddock/post").default, {}],
  ["Start a club", () => require("@/app/(tabs)/paddock/club-new").default, {}, 1],
  ["Club page", () => require("@/app/clubs/[clubId]").default, { clubId: "d0000000-0000-4000-8000-000000000801" }],
  ["Post page", () => require("@/app/posts/[postId]").default, { postId: "d0000000-0000-4000-8000-000000000902" }],
  ["Ask Torq", () => require("@/app/torq").default, { vehicleId: WRX }],
  ["Your driver", () => require("@/app/(tabs)/(home)/driver").default, {}],
];

describe("accessibility audit (sample data)", () => {
  it.each(CASES)("%s", async (_name, load, params, min = 3) => {
    mockParams = params;
    const Screen = load();
    await render(
      <AuthContext.Provider value={auth}>
        <Screen />
      </AuthContext.Provider>,
    );
    // let the sample backend answer (it waits ~120 ms like a network call)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(audit(screen.root as unknown as Host)).toEqual([]);
    // the screen really rendered its content (not just a spinner)
    expect(checked).toBeGreaterThanOrEqual(min);
  });

  it("the audit itself catches problems", () => {
    const bad: Host = {
      type: "View",
      props: {},
      children: [
        { type: "View", props: { onClick: () => {}, accessible: true, style: { height: 30 } }, children: [] },
        { type: "RCTSwitch", props: {}, children: [] },
      ],
    };
    expect(audit(bad)).toEqual([
      "View (no role) has no accessible name",
      '"" is tappable but has no role',
      '"" height 30 is under 44',
      "switch without a label",
    ]);
  });
});

void DEFAULT_FLAGS;
