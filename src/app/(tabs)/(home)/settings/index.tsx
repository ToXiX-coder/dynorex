import { router, type Href } from "expo-router";
import type { ComponentType } from "react";
import { BellIcon, LockIcon, PlusIcon, ProfileIcon, ShareIcon, SteeringIcon, WrenchIcon } from "@/components/icons";
import { IconTile, ListGroup, ListRow } from "@/components/lists/ListGroup";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import { config } from "@/services/config";
import { useTheme } from "@/theme/ThemeProvider";
import { ACCENTS, baseInfo } from "@/theme/themes";
import { color, iconSize } from "@/theme/tokens";

interface Row {
  title: string;
  detail: string;
  href: Href;
  needsAccount: boolean;
  Icon: ComponentType<{ color: string; size?: number }>;
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Account",
    rows: [
      {
        title: "Account",
        detail: "Email, password, sign out",
        href: "/settings/account",
        needsAccount: true,
        Icon: ProfileIcon,
      },
      {
        title: "Privacy and safety",
        detail: "Default visibility, blocked people",
        href: "/settings/privacy",
        needsAccount: true,
        Icon: LockIcon,
      },
      {
        title: "Notifications",
        detail: "What we can notify you about",
        href: "/settings/notifications",
        needsAccount: true,
        Icon: BellIcon,
      },
      {
        title: "Your data",
        detail: "Export or delete your account",
        href: "/settings/data",
        needsAccount: true,
        Icon: ShareIcon,
      },
    ],
  },
  {
    title: "App",
    rows: [
      {
        title: "Appearance",
        detail: "Theme and accent color",
        href: "/settings/appearance",
        needsAccount: false,
        Icon: SteeringIcon,
      },
      {
        title: "Dynorex+",
        detail: "Plan and billing",
        href: "/settings/subscription",
        needsAccount: false,
        Icon: PlusIcon,
      },
    ],
  },
  {
    title: "About",
    rows: [
      {
        title: "About and legal",
        detail: "Terms, privacy, version",
        href: "/settings/about",
        needsAccount: false,
        Icon: WrenchIcon,
      },
    ],
  },
];

export default function Settings() {
  const { status } = useAuth();
  const { choice, base } = useTheme();
  const signedIn = status === "signedIn";
  const themeName = `${choice.base === "auto" ? `Auto (${baseInfo(base).name})` : baseInfo(base).name} · ${
    ACCENTS.find((a) => a.id === choice.accent)!.name
  }`;
  return (
    <Screen>
      {!signedIn ? <SignInPrompt message="Sign in to change settings" /> : null}
      {GROUPS.map((g) => {
        const rows = g.rows.filter((r) => signedIn || !r.needsAccount);
        if (!rows.length) return null;
        return (
          <ListGroup key={g.title} title={g.title}>
            {rows.map((r) => (
              <ListRow
                key={r.title}
                title={r.title}
                detail={r.href === "/settings/appearance" ? themeName : r.detail}
                leading={
                  <IconTile>
                    <r.Icon color={color.accent} size={iconSize.sm + 2} />
                  </IconTile>
                }
                onPress={() => router.push(r.href)}
              />
            ))}
          </ListGroup>
        );
      })}
      <Text
        variant="caption"
        muted
        style={{ textAlign: "center" }}
      >{`Version ${config.release} · ${config.appEnv}`}</Text>
    </Screen>
  );
}
