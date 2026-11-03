import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState, LoadingState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { REQUEST_LABEL } from "@/domain/services";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { servicesService } from "@/features/paddock/servicesService";
import { useFlags } from "@/providers/AppProviders";
import type { BusinessRequest, MyServiceRequest, ServiceRequestStatus } from "@/services/supabase/database.types";
import { withPress } from "@/theme/press";
import { color, space, touch } from "@/theme/tokens";

const live = (s: ServiceRequestStatus) => s === "open" || s === "accepted";

/** Service requests you've sent, and (if you run a business page) the ones sent to you. */
export default function Requests() {
  const flags = useFlags();
  const { status } = useAuth();
  const [tab, setTab] = useState<"sent" | "received">("sent");
  const [sent, setSent] = useState<MyServiceRequest[] | null>(null);
  const [received, setReceived] = useState<BusinessRequest[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(() => {
    void Promise.all([servicesService.myRequests(), servicesService.businessRequests()]).then(([s, r]) => {
      if (!s.ok) return setError(s.error);
      if (!r.ok) return setError(r.error);
      setError(null);
      setSent(s.data);
      setReceived(r.data);
    });
  }, []);
  useFocusEffect(load);

  if (!flags.marketplace) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to see your requests" />
      </Screen>
    );

  const openCount = (received ?? []).filter((r) => r.status === "open").length;
  const row = (id: string, label: string, title: string, sub: string, s: ServiceRequestStatus) => (
    <Pressable
      key={id}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push(`/requests/${id}`)}
      style={withPress({ minHeight: touch.min })}
    >
      <Card style={live(s) ? undefined : { opacity: 0.6 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption">{sub}</Text>
        <Text variant="caption" style={live(s) ? { color: color.accent } : undefined}>
          {REQUEST_LABEL[s]}
        </Text>
      </Card>
    </Pressable>
  );

  return (
    <Screen onRefresh={load}>
      <View style={{ flexDirection: "row", gap: space.xs }} accessibilityRole="tablist">
        <Chip label="Sent" selected={tab === "sent"} onPress={() => setTab("sent")} />
        <Chip
          label={openCount ? `To your shop (${openCount} new)` : "To your shop"}
          selected={tab === "received"}
          onPress={() => setTab("received")}
        />
      </View>
      {error ? <InlineError kind={error.key} onAction={load} /> : null}
      {sent === null && !error ? <LoadingState label="Loading requests" /> : null}
      {tab === "sent" && sent ? (
        sent.length === 0 ? (
          <EmptyState message="No requests yet" detail="Find a shop in Paddock > Services and ask about a job." />
        ) : (
          sent.map((r) =>
            row(
              r.request_id,
              `${r.service_name ?? "Service"} at ${r.business_name}, ${REQUEST_LABEL[r.status]}`,
              r.service_name ?? "Service request",
              r.business_name,
              r.status,
            ),
          )
        )
      ) : null}
      {tab === "received" && received ? (
        received.length === 0 ? (
          <EmptyState
            message="Nothing yet"
            detail="Requests to your business page show up here. Set one up with Your business."
          />
        ) : (
          received.map((r) =>
            row(
              r.request_id,
              `${r.service_name ?? "Service"} from @${r.customer_username}, ${REQUEST_LABEL[r.status]}`,
              r.service_name ?? "Service request",
              `@${r.customer_username}${r.vehicle_text ? ` · ${r.vehicle_text}` : ""}`,
              r.status,
            ),
          )
        )
      ) : null}
    </Screen>
  );
}
