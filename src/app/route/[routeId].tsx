import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { RouteMap } from "@/components/line/RouteMap";
import { RouteTrace } from "@/components/line/RouteTrace";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { formatDistance, formatDuration } from "@/domain/routes";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { ReportSheet } from "@/features/safety/ReportSheet";
import { SaveButton } from "@/features/social/SaveButton";
import { useFlags } from "@/providers/AppProviders";
import type { PublicRoute, RouteRow } from "@/services/supabase/database.types";
import { touch } from "@/theme/tokens";
import { RouteReviews } from "@/features/line/RouteReviews";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { backOr } from "@/components/navigation/stackOptions";

type State = "loading" | "missing" | { own: RouteRow | null; pub: PublicRoute | null };

/**
 * dynorex.app/route/:routeId. The owner sees their full drive and the share switch; everyone else sees
 * only the server's trimmed public copy. Private or missing routes look the same: "not found".
 */
export default function RouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const id = String(routeId ?? "");
  const { status } = useAuth();
  const flags = useFlags();
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);

  const fetchAll = useCallback(async (): Promise<State> => {
    if (!isUuid(id)) return "missing";
    const [own, pub] = await Promise.all([
      status === "signedIn" ? lineService.myRoute(id) : Promise.resolve(null),
      lineService.publicRoute(id),
    ]);
    const o = own && own.ok ? own.data : null;
    const p = pub.ok ? pub.data : null;
    return o || p ? { own: o, pub: p } : "missing";
  }, [id, status]);

  useEffect(() => {
    let alive = true;
    void fetchAll().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [fetchAll, id, status]);

  if (state === "loading") return <LoadingState label="Loading route" />;
  if (state === "missing")
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => backOr()} />
      </Screen>
    );

  const { own, pub } = state;
  const title = own?.title ?? pub!.title;
  const distance = own?.distance_m ?? pub!.distance_m;
  const duration = own?.duration_s ?? pub!.duration_s;
  const shape = own ? own.points.map(([a, b]) => [a, b] as [number, number]) : pub!.points;
  const reload = () => void fetchAll().then(setState);

  return (
    <Screen>
      <ScreenMenu
        title={title}
        label="Route options"
        actions={
          own
            ? [{ label: "Delete drive", destructive: true, onPress: () => setConfirmDelete(true) }]
            : pub && status === "signedIn"
              ? [
                  {
                    label: "Report this route",
                    hint: "Tell Dynorex about a problem.",
                    onPress: () => setReporting(true),
                  },
                ]
              : []
        }
      />
      {own ? (
        // your own drive, drawn on the phone: the full track never goes to the map provider
        <RouteTrace points={shape} height={220} label={`Shape of ${title}`} />
      ) : (
        <RouteMap shared={pub!.points} height={220} label={`Map of ${title}`} />
      )}
      <Text variant="display">{title}</Text>
      <Text>{`${formatDistance(distance)} · ${formatDuration(duration)}${pub ? ` · ${pub.drive_date}` : ""}`}</Text>
      {pub ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/u/${pub.owner_username}`)}
          style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text accent>{`@${pub.owner_username}`}</Text>
        </Pressable>
      ) : null}
      {pub ? <SaveButton kind="route" id={pub.route_id} /> : null}
      {pub ? (
        <Text variant="caption">
          {pub.rating_avg
            ? `Rated ${Number(pub.rating_avg).toFixed(1)} from ${pub.rating_count} ratings`
            : "No ratings yet"}
        </Text>
      ) : null}
      {error ? <InlineError kind={error.key} /> : null}
      {pub && status === "signedIn" && flags.paddock ? (
        <Button
          title="Plan a group drive"
          variant="secondary"
          onPress={() => router.push({ pathname: "/paddock/new", params: { routeId: id } })}
        />
      ) : null}

      {own ? (
        <Card>
          <Text variant="title">{own.visibility === "public" ? "Shared" : "Private"}</Text>
          <Text variant="caption" muted>
            {own.visibility === "public"
              ? "Others see the trimmed shape: your first and last half kilometre and the start time are hidden."
              : "Only you can see this drive, including its full start and finish."}
          </Text>
          <Button
            title={own.visibility === "public" ? "Make private" : "Share publicly"}
            variant={own.visibility === "public" ? "secondary" : "primary"}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              const r = await lineService.setPublic(id, own.visibility !== "public");
              setBusy(false);
              if (!r.ok) return setError(r.error);
              reload();
            }}
          />
        </Card>
      ) : null}
      {pub ? <RouteReviews routeId={id} canReview={status === "signedIn" && !own} onSaved={reload} /> : null}

      <ConfirmModal
        visible={confirmDelete}
        kind="deleteRoute"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const r = await lineService.remove(id);
          if (r.ok) router.replace("/line");
          else setError(r.error);
        }}
      />
      {pub ? (
        <ReportSheet visible={reporting} target={{ type: "route", id }} onClose={() => setReporting(false)} />
      ) : null}
    </Screen>
  );
}
