import { router } from "expo-router";
import { Linking } from "react-native";
import { Card } from "@/components/cards/Card";
import { TextLink } from "@/components/feedback/Inline";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { config } from "@/services/config";

const DOCS: { key: keyof Omit<typeof config.legal, "supportEmail">; title: string }[] = [
  { key: "terms", title: "Terms of service" },
  { key: "privacy", title: "Privacy notice" },
  { key: "guidelines", title: "Community guidelines" },
  { key: "affiliate", title: "Affiliate disclosure" },
];

/** Version, how records work, legal documents (linked once published, honest until then), support. */
export default function About() {
  const missing = DOCS.filter((d) => !config.legal[d.key]);
  return (
    <Screen>
      <Card>
        <Text variant="title">Dynorex</Text>
        <Text muted>{`Version ${config.release} (${config.appEnv})`}</Text>
      </Card>
      <Card>
        <Text variant="title">How records work</Text>
        <Text>
          Builds, mods and specs are entered by owners. Spec numbers are estimates from user-reported data. Dynorex does
          not verify vehicles, parts, work or numbers.
        </Text>
      </Card>
      <Card>
        <Text variant="title">Legal</Text>
        {DOCS.filter((d) => config.legal[d.key]).map((d) => (
          <TextLink key={d.key} title={d.title} onPress={() => void Linking.openURL(config.legal[d.key]!)} />
        ))}
        {missing.length ? (
          <Text muted>{`Not published yet: ${missing.map((d) => d.title.toLowerCase()).join(", ")}.`}</Text>
        ) : null}
        <Text variant="caption" muted>
          Dynorex has no affiliate deals today. If that changes, affiliate links will be labeled before you open them.
        </Text>
      </Card>
      <Card>
        <Text variant="title">Support</Text>
        <TextLink title="Help and contact" onPress={() => router.push("/support")} />
        <TextLink title="How to delete your account" onPress={() => router.push("/account-deletion")} />
      </Card>
    </Screen>
  );
}
