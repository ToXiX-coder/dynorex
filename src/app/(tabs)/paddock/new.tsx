import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { LoadingState } from "@/components/feedback/States";
import { TextField } from "@/components/forms/TextField";
import { RouteTrace } from "@/components/line/RouteTrace";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { isUuid } from "@/domain/deepLinks";
import { formatEventTime, REPEAT_OPTIONS, seriesDates, type RepeatId } from "@/domain/events";
import { windowAt, ymd } from "@/domain/pickers";
import { DateField, DurationField, TimeField } from "@/components/forms/PickerFields";
import { PlaceField } from "@/features/paddock/PlaceField";
import { formatDistance } from "@/domain/routes";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { lineService } from "@/features/line/lineService";
import { communityService } from "@/features/paddock/communityService";
import { eventService } from "@/features/paddock/eventService";
import { useFlags } from "@/providers/AppProviders";
import type { EventRow, PublicClub, PublicRoute } from "@/services/supabase/database.types";
import { space } from "@/theme/tokens";

const tomorrow = () => ymd(new Date(Date.now() + 86_400_000));
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const param = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && isUuid(s) ? s : null;
};

/**
 * Host a meet, plan a group drive (?routeId=, a shared route) or a club event (?clubId=), or edit your event
 * (?edit=). Date, start time and length are scroll wheels in a dropdown (adjustable controls for screen readers).
 * The meeting place suggests places as you type (Mapbox, optionally near you) and is shown publicly, so the form
 * asks for a public spot, not a home address. The server checks that the route
 * is shared, that you belong to the club, and that a started event isn't moved.
 */
export default function NewEvent() {
  const flags = useFlags();
  const { status } = useAuth();
  const params = useLocalSearchParams<{ routeId?: string; clubId?: string; edit?: string }>();
  const editId = param(params.edit);
  const routeId = editId ? null : param(params.routeId);
  const clubId = editId ? null : param(params.clubId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  // set only from a picked place suggestion (for the events map); typing over it clears them
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(120);
  // events can be planned from today up to a year out (worked out once per visit)
  const [limits] = useState(() => ({ min: ymd(new Date()), max: ymd(new Date(Date.now() + 366 * 86_400_000)) }));
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedError | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [route, setRoute] = useState<PublicRoute | null>(null);
  const [club, setClub] = useState<PublicClub | null>(null);
  const [original, setOriginal] = useState<EventRow | null | undefined>(editId ? undefined : null);
  // editing keeps the saved time until the day, start time or length is changed
  const [keepTime, setKeepTime] = useState(Boolean(editId));
  const [started, setStarted] = useState(false);
  // repeating meets (D-60): new events only; each date becomes its own event
  const [repeat, setRepeat] = useState<RepeatId | null>(null);
  const [count, setCount] = useState(4);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    if (routeId) void lineService.publicRoute(routeId).then((r) => alive && r.ok && setRoute(r.data));
    if (clubId) void communityService.club(clubId).then((r) => alive && r.ok && setClub(r.data));
    if (editId)
      void eventService.asOrganizer(editId).then((r) => {
        if (!alive) return;
        const e = r.ok ? r.data : null;
        setOriginal(e);
        if (e) {
          setStarted(Date.parse(e.starts_at) <= Date.now());
          setTitle(e.title);
          setDescription(e.description ?? "");
          setPlace(e.location_text);
          setCoords(e.place_lat !== null && e.place_lng !== null ? { lat: e.place_lat, lng: e.place_lng } : null);
          setCapacity(e.capacity === null ? "" : String(e.capacity));
          const s = new Date(e.starts_at);
          setDate(ymd(s));
          setTime(hhmm(s));
          setMinutes(Math.max(15, Math.round((Date.parse(e.ends_at) - s.getTime()) / 60_000)));
        }
      });
    return () => {
      alive = false;
    };
  }, [routeId, clubId, editId]);

  if (!flags.paddock) return null;
  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to host an event" />
      </Screen>
    );
  if (original === undefined) return <LoadingState label="Loading event" />;
  if (editId && original === null)
    return (
      <Screen>
        <InlineError kind="buildNotFound" />
      </Screen>
    );

  const win = windowAt(date, time, minutes);
  const when = keepTime && original ? { starts_at: original.starts_at, ends_at: original.ends_at } : win;
  const cap = capacity.trim() === "" ? null : Number(capacity);
  // any change to the date, time or length replaces the saved time when editing
  const pick =
    <T,>(f: (v: T) => void) =>
    (v: T) => {
      setKeepTime(false);
      f(v);
    };

  const submit = async () => {
    setFieldError(null);
    setError(null);
    // the name and place sit above the button, often scrolled out of sight: bring the problem into view
    const missing = (f: string) => {
      setFieldError(f);
      scroller.current?.scrollTo({ y: 0, animated: true });
    };
    if (!title.trim()) return missing("title");
    if (!place.trim()) return missing("place");
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 5000)) return setFieldError("capacity");
    if (!keepTime && win.inPast) return setError({ key: "eventInPast" });
    if (routeId && !route) return setError({ key: "routeNotPublic" });
    setBusy(true);
    const base = {
      title: title.trim(),
      description: description.trim() || null,
      location_text: place.trim(),
      capacity: cap,
      place_lat: coords?.lat ?? null,
      place_lng: coords?.lng ?? null,
    };
    if (editId) {
      const r = await eventService.update(editId, keepTime ? base : { ...base, ...when });
      setBusy(false);
      if (!r.ok) return setError(r.error);
      return router.replace(`/events/${editId}`);
    }
    const input = {
      ...base,
      ...when,
      kind: routeId ? ("drive" as const) : ("meet" as const),
      route_id: routeId,
      club_id: clubId,
    };
    const r = repeat ? await eventService.createSeries(input, repeat, count) : await eventService.create(input);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(`/events/${r.data}`);
  };

  return (
    <Screen scrollRef={scroller}>
      <Stack.Screen options={{ title: editId ? "Edit event" : routeId ? "Plan a group drive" : "Create event" }} />
      {routeId ? (
        route ? (
          <Card>
            <Text variant="label">Group drive route</Text>
            <RouteTrace points={route.points} height={120} label={`Shape of ${route.title}`} />
            <Text variant="title">{route.title}</Text>
            <Text variant="caption" muted>
              {`${formatDistance(route.distance_m)} · shared by @${route.owner_username}`}
            </Text>
          </Card>
        ) : (
          <InlineError kind="routeNotPublic" />
        )
      ) : null}
      {club ? <Text variant="caption">{`Hosted in ${club.name}`}</Text> : null}
      <TextField
        label="Event name"
        required
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        error={fieldError === "title" ? "Give it a name" : null}
        placeholder={routeId ? "Sunrise canyon drive" : "Cars and Coffee"}
      />
      {started ? (
        <Text variant="caption" muted>
          This event has started, so its time can&apos;t change.
        </Text>
      ) : (
        <>
          <DateField label="Day" required value={date} onChange={pick(setDate)} min={limits.min} max={limits.max} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <TimeField label="Start time" value={time} onChange={pick(setTime)} />
            </View>
            <View style={{ flex: 1 }}>
              <DurationField label="How long" minutes={minutes} onChange={pick(setMinutes)} />
            </View>
          </View>
        </>
      )}
      <Text variant="caption">{formatEventTime(when.starts_at, when.ends_at)}</Text>
      {!editId ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label">Repeats</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            <Chip label="Just once" selected={repeat === null} onPress={() => setRepeat(null)} />
            {REPEAT_OPTIONS.map((o) => (
              <Chip key={o.id} label={o.label} selected={repeat === o.id} onPress={() => setRepeat(o.id)} />
            ))}
          </View>
          {repeat ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
                <Text variant="caption" muted>
                  How many dates:
                </Text>
                {[4, 8, 12].map((n) => (
                  <Chip key={n} label={String(n)} selected={count === n} onPress={() => setCount(n)} />
                ))}
              </View>
              <Text variant="caption" muted>
                {`Last date: ${new Date(seriesDates(when.starts_at, when.ends_at, repeat, count).at(-1)!.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}. Each date gets its own RSVPs, check-in and chat, and you can cancel any date onward.`}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      <PlaceField
        label={routeId ? "Meeting point" : "Meeting place"}
        value={place}
        onChange={setPlace}
        onCoords={setCoords}
        error={fieldError === "place" ? "Say where to meet" : null}
      />
      <TextField
        label="Spots (optional)"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="number-pad"
        hint="Leave empty for no limit."
        error={fieldError === "capacity" ? "Use a number from 1 to 5000" : null}
      />
      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
        hint={routeId ? "Pace, stops, and a reminder to follow road laws." : undefined}
      />
      {error ? <InlineError kind={error.key} /> : null}
      <Button
        title={editId ? "Save changes" : routeId ? "Create group drive" : "Create event"}
        fullWidth
        loading={busy}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
