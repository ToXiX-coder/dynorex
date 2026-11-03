import { Card } from "@/components/cards/Card";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { config } from "@/services/config";

/**
 * dynorex.app/account-deletion: the public page Google Play requires for account deletion, also linked
 * from the App Store listing. Describes exactly what the delete-account function does.
 */
export default function AccountDeletion() {
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        Delete your Dynorex account
      </Text>
      <Card>
        <Text variant="title">In the app</Text>
        <Text>1. Open Profile, then Settings, then Your data.</Text>
        <Text>2. Type DELETE, confirm it&apos;s you (password, Apple or Google), and tap Delete my account.</Text>
        <Text variant="bodyStrong">
          Have Dynorex+? Cancel it in your App Store or Google Play settings first. Deleting the account doesn&apos;t
          stop store billing.
        </Text>
      </Card>
      <Card>
        <Text variant="title">What is deleted</Text>
        <Text>
          Right away: your profile, vehicles, builds, mods, photos, wishlist, follows, reactions, notifications, push
          tokens, nearby setting and subscription record. Purchase records held by our payment processor for your
          account are deleted too.
        </Text>
        <Text variant="title">What is kept</Text>
        <Text>
          Reports you filed stay without your name so moderators can finish them. Moderation records about content stay
          for safety and legal reasons. Encrypted database backups expire on our hosting provider&apos;s schedule. App
          stores keep their own purchase records under their policies.
        </Text>
      </Card>
      <Card>
        <Text variant="title">Can&apos;t open the app?</Text>
        <Text>
          {config.legal.supportEmail
            ? `Email ${config.legal.supportEmail} from the address on your account and ask for deletion.`
            : "Email support from the address on your account (the support inbox is being set up)."}
        </Text>
      </Card>
    </Screen>
  );
}
