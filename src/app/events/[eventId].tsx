import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { ConfirmModal, InlineError, InlineNotice } from "@/components/feedback/Inline";
import { ErrorState, LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { RouteMap } from "@/components/line/RouteMap";
import { EventPoster } from "@/components/paddock/EventPoster";
import { QrCode } from "@/components/paddock/QrCode";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { checkinOpen, checkinQrPayload, formatEventTime, spotsLeft } from "@/domain/events";
import { formatDistance } from "@/domain/routes";
import { useAuth } from "@/features/auth/AuthProvider";
import { useGoToSignIn } from "@/features/social/FollowButton";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { CheckinScanner } from "@/features/paddock/CheckinScanner";
import { communityService } from "@/features/paddock/communityService";
import { eventService } from "@/features/paddock/eventService";
import { addToCalendar } from "@/features/paddock/addToCalendar";
import {
  allowReminders,
  beforeEvent,
  clearReminder,
  remindersSupported,
  setReminder,
} from "@/features/notifications/reminders";
import { EventAlbum } from "@/features/paddock/EventAlbum";
import { SaveButton } from "@/features/social/SaveButton";
import { EventsMap } from "@/components/paddock/EventsMap";
import { ReportSheet } from "@/features/safety/ReportSheet";
import type { EventRow, PublicEvent, PublicRoute, RsvpStatus } from "@/services/supabase/database.types";
import { border, color, radius, space, touch } from "@/theme/tokens";
import { haptic } from "@/services/haptics";
import { ScreenMenu } from "@/components/feedback/ScreenMenu";
import { themed } from "@/theme/themed";
import { backOr } from "@/components/navigation/stackOptions";
import { PageMeta } from "@/components/seo/PageMeta";
import { metaDescription } from "@/domain/seo";

/**
 * dynorex.app/events/:eventId. Anyone can see a public event. RSVP respects capacity on the server.
 * The organizer gets the event's check-in code (one code for the whole event) and attendance counts;
 * attendees who said "Going" check in by entering the code shown at the meet.
 */
export default function EventScreen() {
  const { eventId, checkin } = useLocalSearchParams<{ eventId: string; checkin?: string }>();
  const id = String(eventId ?? "");
  // opened from the host's QR with the phone's camera: fill in the code (still checked by the server)
  const linkedCode = typeof checkin === "string" && /^\d{6}$/.test(checkin) ? checkin : "";
  const { status } = useAuth();
  const goToSignIn = useGoToSignIn();
  const [ev, setEv] = useState<PublicEvent | null | undefined>(undefined);
  const [mine, setMine] = useState<EventRow | null>(null);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [codeInput, setCodeInput] = useState(linkedCode);
  const [scanning, setScanning] = useState(false);
  const [reload, setReload] = useState(0);
  const [calendarNote, setCalendarNote] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isUuid(id)) return { ev: null, mine: null, rsvp: null, checkedIn: false };
    const signed = status === "signedIn";
    const [p, o, r, c] = await Promise.all([
      eventService.publicEvent(id),
      signed ? eventService.asOrganizer(id) : Promise.resolve(null),
      signed ? eventService.myRsvp(id) : Promise.resolve(null),
      signed ? eventService.myCheckin(id) : Promise.resolve(null),
    ]);
    return {
      ev: p.ok ? p.data : null,
      mine: o && o.ok ? o.data : null,
      rsvp: r && r.ok ? r.data : null,
      checkedIn: Boolean(c && c.ok && c.data),
    };
  }, [id, status]);

  useEffect(() => {
    let alive = true;
    void fetchAll().then((s) => {
      if (!alive) return;
      setEv(s.ev);
      setMine(s.mine);
      setRsvp(s.rsvp);
      setCheckedIn(s.checkedIn);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll, reload]);

  if (ev === undefined) return <LoadingState label="Loading event" />;
  if (ev === null)
    return (
      <Screen>
        <ErrorState kind="buildNotFound" onAction={() => backOr()} />
      </Screen>
    );

  const left = spotsLeft(ev);
  const cancelled = ev.status === "cancelled";
  const isOrganizer = Boolean(mine);
  const act = async (fn: () => Promise<{ ok: boolean; error?: MappedError }>) => {
    setBusy(true);
    setError(null);
    const r = (await fn()) as { ok: true } | { ok: false; error: MappedError };
    setBusy(false);
    if (!r.ok) {
      haptic.warning();
      return setError(r.error);
    }
    haptic.tap();
    setReload((n) => n + 1);
  };

  return (
    <Screen onRefresh={() => setReload((n) => n + 1)}>
      <PageMeta
        title={ev.title}
        description={metaDescription(
          `${formatEventTime(ev.starts_at, ev.ends_at)} at ${ev.location_text}.`,
          ev.description,
        )}
      />
      <ScreenMenu
        title={ev.title}
        label="Event options"
        actions={
          !isOrganizer && status === "signedIn"
            ? [{ label: "Report this event", hint: "Tell Dynorex about a problem.", onPress: () => setReporting(true) }]
            : []
        }
      />
      {cancelled ? <InlineError kind="eventClosed" /> : null}
      <EventPoster startsAt={ev.starts_at} kind={ev.kind} cancelled={cancelled} height={140} />
      <Text variant="display">{ev.title}</Text>
      <Text>{formatEventTime(ev.starts_at, ev.ends_at)}</Text>
      <Text>{ev.location_text}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/u/${ev.organizer_username}`)}
        style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <Text accent>{`Hosted by @${ev.organizer_username}`}</Text>
      </Pressable>
      <Text variant="caption">
        {`${ev.going_count} going · ${ev.interested_count} interested${left === null ? "" : left === 0 ? " · Full" : ` · ${left} of ${ev.capacity} spots left`}`}
      </Text>
      {ev.place_lat !== null && ev.place_lng !== null ? (
        <EventsMap
          pins={[{ lat: ev.place_lat, lng: ev.place_lng }]}
          label={`Map of the meeting place: ${ev.location_text}`}
          height={180}
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        {!cancelled ? (
          <Button
            title="Add to calendar"
            variant="secondary"
            onPress={async () => {
              const ok = await addToCalendar(ev);
              setCalendarNote(ok ? null : "This device can't open calendar files. Add it by hand.");
            }}
          />
        ) : null}
        {status === "signedIn" && (isOrganizer || rsvp) ? (
          <Button
            title="Event chat"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: "/chat/[type]/[roomId]", params: { type: "event", roomId: id, title: ev.title } })
            }
          />
        ) : null}
        <SaveButton kind="event" id={id} />
      </View>
      {calendarNote ? (
        <Text variant="caption" muted>
          {calendarNote}
        </Text>
      ) : null}
      {ev.description ? <Text>{ev.description}</Text> : null}
      {ev.club_id ? <ClubLink clubId={ev.club_id} /> : null}
      {ev.kind === "drive" ? <DriveRoute routeId={ev.route_id} /> : null}
      {ev.kind === "drive" && !cancelled ? (
        status === "signedIn" && (isOrganizer || rsvp === "going") ? (
          <Button
            title="Open live drive map"
            fullWidth
            onPress={() => router.push({ pathname: "/drive/[eventId]", params: { eventId: id } })}
          />
        ) : (
          <Text variant="caption" muted>
            The live drive map is for the host and people going. It opens 30 minutes before the start.
          </Text>
        )
      ) : null}
      <SeriesDates eventId={id} />
      {error ? <InlineError kind={error.key} /> : null}

      {!cancelled && !isOrganizer ? (
        status === "signedIn" ? (
          <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Your RSVP">
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button
                title={rsvp === "going" ? "Going" : "Going"}
                variant={rsvp === "going" ? "primary" : "secondary"}
                loading={busy}
                onPress={() =>
                  void act(async () => {
                    const r = await eventService.rsvp(id, "going");
                    // a heads-up on this phone 2 hours before (asks for permission once)
                    if (r.ok && remindersSupported() && (await allowReminders()))
                      await setReminder(
                        `event:${id}`,
                        beforeEvent(ev.starts_at),
                        ev.title,
                        `Starts in 2 hours at ${ev.location_text}.`,
                        { entity_type: "event", entity_id: id },
                      );
                    return r;
                  })
                }
              />
              <Button
                title={rsvp === "interested" ? "Interested" : "Interested"}
                variant={rsvp === "interested" ? "primary" : "secondary"}
                onPress={() => void act(() => eventService.rsvp(id, "interested"))}
              />
              {rsvp ? (
                <Button
                  title="Can't go"
                  variant="secondary"
                  onPress={() =>
                    void act(async () => {
                      await clearReminder(`event:${id}`);
                      return eventService.cancelRsvp(id);
                    })
                  }
                />
              ) : null}
            </View>
          </View>
        ) : (
          <Button title="Sign in to RSVP" variant="secondary" onPress={goToSignIn} />
        )
      ) : null}

      {/* attendee check-in */}
      {!isOrganizer && rsvp === "going" && checkinOpen(ev) ? (
        checkedIn ? (
          <InlineNotice title="You're checked in" />
        ) : (
          <Card>
            <Text variant="title">Check in</Text>
            <Text variant="caption" muted>
              Scan the host&apos;s QR code, or enter the 6-digit code they&apos;re showing.
            </Text>
            {Platform.OS !== "web" ? (
              <Button title="Scan QR code" variant="secondary" onPress={() => setScanning(true)} />
            ) : null}
            <CheckinScanner
              visible={scanning}
              eventId={id}
              onClose={() => setScanning(false)}
              onCode={(c) => {
                setCodeInput(c);
                void act(() => eventService.checkIn(id, c));
              }}
            />
            <TextField
              label="Check-in code"
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
            />
            <Button
              title="Check in"
              disabled={codeInput.length !== 6}
              loading={busy}
              onPress={() => void act(() => eventService.checkIn(id, codeInput))}
            />
          </Card>
        )
      ) : null}

      <EventAlbum eventId={id} title={ev.title} />

      {/* organizer tools */}
      {isOrganizer && mine ? (
        <OrganizerTools
          event={mine}
          onCancel={() => setConfirmCancel(true)}
          onCancelSeries={() => void act(() => eventService.cancelSeries(id))}
        />
      ) : null}

      <ReportSheet visible={reporting} target={{ type: "event", id }} onClose={() => setReporting(false)} />
      <ConfirmModal
        visible={confirmCancel}
        kind="cancelEvent"
        busy={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          setConfirmCancel(false);
          await act(() => eventService.cancel(id));
        }}
      />
    </Screen>
  );
}

/** The other coming dates of a repeating meet (D-60); nothing for a one-off. */
function SeriesDates({ eventId }: { eventId: string }) {
  const [dates, setDates] = useState<{ event_id: string; starts_at: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void eventService.seriesDates(eventId).then((r) => alive && r.ok && setDates(r.data));
    return () => {
      alive = false;
    };
  }, [eventId]);
  if (dates.length < 2) return null;
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">{`Repeats · ${dates.length} dates coming up`}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {dates.map((d) => {
          const here = d.event_id === eventId;
          const label = new Date(d.starts_at).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          return (
            <Pressable
              key={d.event_id}
              accessibilityRole="link"
              accessibilityState={{ selected: here }}
              accessibilityLabel={here ? `${label}, this date` : `${label}. Open`}
              disabled={here}
              onPress={() => router.push(`/events/${d.event_id}`)}
              style={({ pressed }) => [styles.date, here && styles.dateHere, pressed && { opacity: 0.7 }]}
            >
              <Text variant="caption" style={here ? { color: color.accent, fontWeight: "800" } : undefined}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OrganizerTools({
  event,
  onCancel,
  onCancelSeries,
}: {
  event: EventRow;
  onCancel: () => void;
  onCancelSeries: () => void;
}) {
  const [confirmSeries, setConfirmSeries] = useState(false);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const codeRef = useRef<string | null>(null);
  const [counts, setCounts] = useState<{ going: number; interested: number; checked_in: number } | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const open = checkinOpen({ ...event, status: event.status });

  // the event's one check-in code (fetched again only if it failed); attendance refreshes every minute
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [c, a] = await Promise.all([
        open && !codeRef.current ? eventService.checkinCode(event.id) : Promise.resolve(null),
        eventService.attendance(event.id),
      ]);
      if (!alive) return;
      if (c) {
        if (c.ok) {
          codeRef.current = c.data.code;
          setCode(c.data);
        } else setError(c.error);
      }
      if (a.ok) setCounts(a.data);
    };
    void tick();
    const t = setInterval(() => void tick(), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [event.id, open]);

  return (
    <Card featured>
      <Text variant="title">You&apos;re hosting</Text>
      {counts ? (
        <Text>{`${counts.going} going · ${counts.interested} interested · ${counts.checked_in} checked in`}</Text>
      ) : null}
      {event.status === "scheduled" ? (
        open ? (
          code ? (
            <View
              style={styles.codeBox}
              accessible
              accessibilityLabel={`Check-in code ${code.code.split("").join(" ")}. Same code for the whole event.`}
            >
              <Text variant="caption" muted>
                Check-in code for this event
              </Text>
              <Text style={styles.code}>{code.code}</Text>
              <QrCode
                value={checkinQrPayload(event.id, code.code)}
                size={200}
                label="Check-in QR code for attendees to scan"
              />
            </View>
          ) : null
        ) : (
          <Text variant="caption" muted>
            Check-in opens an hour before the start.
          </Text>
        )
      ) : null}
      {error ? <InlineError kind={error.key} /> : null}
      {event.status === "scheduled" ? (
        <>
          <Button
            title="Edit event"
            variant="secondary"
            onPress={() => router.push({ pathname: "/paddock/new", params: { edit: event.id } })}
          />
          <Button title="Cancel event" variant="destructive" onPress={onCancel} />
          {event.series_id ? (
            <Button
              title={confirmSeries ? "Tap again: cancel this and later dates" : "Cancel this and later dates"}
              variant={confirmSeries ? "destructive" : "secondary"}
              onPress={() => (confirmSeries ? onCancelSeries() : setConfirmSeries(true))}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/** A group drive's route: the shared (trimmed) copy only. If the route was made private, say so. */
function DriveRoute({ routeId }: { routeId: string | null }) {
  const [route, setRoute] = useState<PublicRoute | null | undefined>(routeId ? undefined : null);
  useEffect(() => {
    let alive = true;
    if (routeId) void lineService.publicRoute(routeId).then((r) => alive && setRoute(r.ok ? r.data : null));
    return () => {
      alive = false;
    };
  }, [routeId]);
  if (route === undefined) return null;
  return (
    <Card>
      <Text variant="label">Group drive</Text>
      {route ? (
        <>
          <RouteMap shared={route.points} height={180} label={`Map of the route ${route.title}`} />
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/route/${route.route_id}`)}
            style={{ minHeight: touch.min, justifyContent: "center" }}
          >
            <Text accent>{`${route.title} · ${formatDistance(route.distance_m)}`}</Text>
          </Pressable>
          <Text variant="caption" muted>
            Drive at a legal, safe pace. Dynorex never tracks a group drive.
          </Text>
        </>
      ) : (
        <Text variant="caption" muted>
          The route for this drive is no longer shared. Ask the host for directions.
        </Text>
      )}
    </Card>
  );
}

function ClubLink({ clubId }: { clubId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void communityService.club(clubId).then((r) => alive && r.ok && setName(r.data?.name ?? null));
    return () => {
      alive = false;
    };
  }, [clubId]);
  if (!name) return null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/clubs/${clubId}`)}
      style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
    >
      <Text accent>{`Club event · ${name}`}</Text>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    date: {
      minHeight: touch.min,
      justifyContent: "center",
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      backgroundColor: color.surface,
      borderWidth: border.hairline,
      borderColor: color.hairline,
    },
    dateHere: { borderColor: color.accent, backgroundColor: color.accentSoft },
    codeBox: {
      alignItems: "center",
      padding: space.lg,
      borderRadius: radius.md,
      borderWidth: border.focus,
      borderColor: color.accent,
      gap: space.xs,
    },
    code: { fontSize: 44, lineHeight: 52, fontWeight: "800", letterSpacing: 8, color: color.text },
  }),
);
