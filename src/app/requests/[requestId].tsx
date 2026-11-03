import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { ChatHeaderCard, PrivateChat } from "@/components/chat/PrivateChat";
import { ComingSoon } from "@/components/feedback/ComingSoon";
import { InlineError } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { REQUEST_LABEL } from "@/domain/services";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { servicesService } from "@/features/paddock/servicesService";
import { useFlags } from "@/providers/AppProviders";
import type { OfferMessage, ServiceRequestDetail, ServiceRequestStatus } from "@/services/supabase/database.types";
import { color, layout, space } from "@/theme/tokens";

const REFRESH_MS = 15_000;

/**
 * One service request: what was asked, its status, the actions each side has (the shop accepts, declines or
 * marks it done; the customer can cancel), and the private chat between the two.
 */
export default function RequestScreen() {
  const flags = useFlags();
  const { status } = useAuth();
  if (!flags.marketplace) return <ComingSoon title="Services" lines={["Shops near you, in Paddock"]} />;
  if (status !== "signedIn")
    return (
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <SignInPrompt message="Sign in to see this request" />
      </View>
    );
  return <Request />;
}

function Request() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const id = String(requestId ?? "");
  const [req, setReq] = useState<ServiceRequestDetail | null | undefined>(undefined);
  const [messages, setMessages] = useState<OfferMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([isUuid(id) ? servicesService.requestDetail(id) : Promise.resolve(null), servicesService.thread(id)]),
    [id],
  );
  const apply = useCallback(([d, t]: Awaited<ReturnType<typeof fetchAll>>) => {
    setReq(d && d.ok ? d.data : null);
    if (t.ok) setMessages(t.data);
  }, []);
  useEffect(() => {
    let alive = true;
    const tick = () => void fetchAll().then((r) => alive && apply(r));
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fetchAll, apply]);

  if (req === undefined) return <LoadingState label="Loading request" />;
  if (req === null)
    return (
      <View style={{ flex: 1, backgroundColor: color.background, padding: layout.screenGutter }}>
        <ErrorState
          kind="buildNotFound"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/paddock/requests"))}
        />
      </View>
    );

  const shop = req.role === "business";
  const other = shop ? `@${req.customer_username}` : req.business_name;
  const set = async (s: ServiceRequestStatus) => {
    setBusy(true);
    setError(null);
    const r = await servicesService.setStatus(id, s);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    apply(await fetchAll());
  };
  const actions: { title: string; status: ServiceRequestStatus; secondary?: boolean }[] = shop
    ? req.status === "open"
      ? [
          { title: "Accept", status: "accepted" },
          { title: "Decline", status: "declined", secondary: true },
        ]
      : req.status === "accepted"
        ? [{ title: "Mark job done", status: "completed" }]
        : []
    : req.status === "open" || req.status === "accepted"
      ? [{ title: "Cancel request", status: "cancelled", secondary: true }]
      : [];
  const date = req.preferred_date
    ? new Date(`${req.preferred_date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <>
      <Stack.Screen options={{ title: other }} />
      <PrivateChat
        header={
          <>
            <ChatHeaderCard
              label={`${req.service_name ?? "Service"} at ${req.business_name}, ${REQUEST_LABEL[req.status]}`}
            >
              <Text variant="bodyStrong">{req.service_name ?? "Service request"}</Text>
              <Text variant="caption">
                {shop ? `From @${req.customer_username}` : `At ${req.business_name}`}
                {req.vehicle_text ? ` · ${req.vehicle_text}` : ""}
                {date ? ` · prefers ${date}` : ""}
              </Text>
              <Text variant="caption" style={{ color: color.accent }}>
                {REQUEST_LABEL[req.status]}
              </Text>
              <Text style={{ marginTop: space.xs }}>{req.message}</Text>
            </ChatHeaderCard>
            {actions.length ? (
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                {actions.map((a) => (
                  <Button
                    key={a.status}
                    title={a.title}
                    variant={a.secondary ? "secondary" : "primary"}
                    loading={busy && !a.secondary}
                    disabled={busy}
                    onPress={() => void set(a.status)}
                  />
                ))}
              </View>
            ) : null}
            {!shop ? (
              <Button
                title="View the shop"
                variant="secondary"
                onPress={() => router.push(`/business/${req.business_id}`)}
              />
            ) : null}
            {error ? <InlineError kind={error.key} /> : null}
          </>
        }
        messages={messages}
        open={req.status === "open" || req.status === "accepted"}
        to={other}
        emptyText={shop ? "Reply with questions, a quote or a time." : "The shop will reply here."}
        closedText="This request is closed, so the chat is read-only."
        onSend={async (body) => {
          const r = await servicesService.send(id, body);
          if (r.ok) apply(await fetchAll());
          return r;
        }}
      />
    </>
  );
}
