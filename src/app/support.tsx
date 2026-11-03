import { Linking } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { config } from "@/services/config";

/** dynorex.app/support: the support URL for both store listings. Public, no account needed. */
export default function Support() {
  const email = config.legal.supportEmail;
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        Help
      </Text>
      <Card>
        <Text variant="title">Contact</Text>
        {email ? (
          <>
            <Text>{`Email ${email}. Don't include passwords or your full VIN.`}</Text>
            <Button title="Email support" onPress={() => void Linking.openURL(`mailto:${email}`)} />
          </>
        ) : (
          <Text muted>The support inbox isn&apos;t set up yet.</Text>
        )}
      </Card>
      <Card>
        <Text variant="title">Common questions</Text>
        <Text variant="bodyStrong">Who can see my build?</Text>
        <Text>
          Only you, until you make it public on the vehicle page. Public pages never show your VIN, odometer, costs,
          notes or location.
        </Text>
        <Text variant="bodyStrong">Are the spec numbers measured?</Text>
        <Text>No. They are estimates from numbers owners enter. Dynorex doesn&apos;t verify them.</Text>
        <Text variant="bodyStrong">How do I cancel Dynorex+?</Text>
        <Text>
          In your App Store or Google Play subscription settings. You keep it until the end of the period you paid for.
        </Text>
        <Text variant="bodyStrong">Someone is harassing me.</Text>
        <Text>Use Report and Block on their profile or build. They aren&apos;t told who reported or blocked them.</Text>
      </Card>
    </Screen>
  );
}
