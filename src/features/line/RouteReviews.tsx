import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { StarIcon } from "@/components/icons";
import { Card } from "@/components/cards/Card";
import { InlineError, InlineNotice } from "@/components/feedback/Inline";
import { TextField } from "@/components/forms/TextField";
import { SectionHeader } from "@/components/SectionHeader";
import { Text } from "@/components/Text";
import type { MappedError } from "@/features/auth/errors";
import { haptic } from "@/services/haptics";
import type { RouteReview, RouteReviewSummary } from "@/services/supabase/database.types";
import { color, radius, space, touch } from "@/theme/tokens";
import { ASPECTS, reviewService, type MyReview } from "./reviewService";

type AspectKey = (typeof ASPECTS)[number]["key"];

/**
 * Road reviews on a public route: overall stars plus scenery, surface and traffic, and the newest written reviews.
 * Anyone can read them; signed-in drivers (not the route's owner) can leave one. A written comment is shown with
 * your username. No police or speed-trap reports here, on purpose.
 */
export function RouteReviews({
  routeId,
  canReview,
  onSaved,
}: {
  routeId: string;
  canReview: boolean;
  onSaved: () => void;
}) {
  const [summary, setSummary] = useState<RouteReviewSummary | null>(null);
  const [reviews, setReviews] = useState<RouteReview[]>([]);
  const [mine, setMine] = useState<MyReview | null>(null);
  const [draft, setDraft] = useState<MyReview | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void reviewService.summary(routeId).then((r) => r.ok && setSummary(r.data));
    void reviewService.reviews(routeId).then((r) => r.ok && setReviews(r.data));
    if (canReview) void reviewService.mine(routeId).then((r) => r.ok && setMine(r.data));
  }, [routeId, canReview]);
  useEffect(load, [load]);

  const editing = draft ?? mine ?? { stars: 0, scenery: null, surface: null, traffic: null, comment: null };
  const set = (patch: Partial<MyReview>) => {
    setSaved(false);
    setDraft({ ...editing, ...patch });
  };

  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader>Road reviews</SectionHeader>
      {summary && summary.reviews ? (
        <Card style={{ gap: space.xs }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
            accessible
            accessibilityLabel={`${summary.stars?.toFixed(1) ?? "No"} stars from ${summary.reviews} review${summary.reviews === 1 ? "" : "s"}`}
          >
            <StarIcon color={color.accent} size={20} />
            <Text variant="title">{`${summary.stars?.toFixed(1) ?? "–"} · ${summary.reviews} review${summary.reviews === 1 ? "" : "s"}`}</Text>
          </View>
          {ASPECTS.map((a) => (
            <AspectBar key={a.key} label={a.label} low={a.low} high={a.high} value={summary[a.key]} />
          ))}
        </Card>
      ) : (
        <Text muted>No reviews yet.</Text>
      )}

      {canReview ? (
        <Card style={{ gap: space.sm }}>
          <Text variant="label">{mine ? "Your review" : "Review this road"}</Text>
          <Scale
            label="Overall"
            value={editing.stars || null}
            render={(n, on) => <StarIcon on={on} color={on ? color.accent : color.textMuted} size={26} />}
            onPick={(n) => set({ stars: n })}
          />
          {ASPECTS.map((a) => (
            <Scale
              key={a.key}
              label={`${a.label} (${a.low} 1 – 5 ${a.high})`}
              value={editing[a.key as AspectKey]}
              render={(n) => String(n)}
              onPick={(n) => set({ [a.key]: n } as Partial<MyReview>)}
            />
          ))}
          <TextField
            label="Comment (optional)"
            value={editing.comment ?? ""}
            onChangeText={(t) => set({ comment: t })}
            maxLength={280}
            multiline
            placeholder="Best time to go, road surface, where to regroup"
          />
          <Text variant="caption" muted>
            Shown publicly with your username. Keep it about the road: no police or speed-trap reports.
          </Text>
          {error ? <InlineError kind={error.key} /> : null}
          {saved ? <InlineNotice title="Review saved" /> : null}
          <Button
            title={mine ? "Update review" : "Post review"}
            disabled={!editing.stars || !draft}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              const comment = editing.comment?.trim() || null;
              const r = await reviewService.save(routeId, { ...editing, comment });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              haptic.success();
              setDraft(null);
              setSaved(true);
              load();
              onSaved();
            }}
          />
        </Card>
      ) : null}

      {reviews.map((r, i) => (
        <Card key={`${r.username}-${i}`} style={{ gap: 2 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
            accessible
            accessibilityLabel={`@${r.username}, ${r.stars} of 5 stars`}
          >
            <Text variant="bodyStrong">{`@${r.username}`}</Text>
            <View style={{ flexDirection: "row", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <StarIcon key={n} on={n <= r.stars} color={n <= r.stars ? color.accent : color.textMuted} size={14} />
              ))}
            </View>
          </View>
          <Text variant="caption" muted>
            {ASPECTS.filter((a) => r[a.key] !== null)
              .map((a) => `${a.label} ${r[a.key]}/5`)
              .join(" · ")}
          </Text>
          {r.comment ? <Text>{r.comment}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

/** One aspect's average as a bar, with the number in words for screen readers. */
function AspectBar({ label, low, high, value }: { label: string; low: string; high: string; value: number | null }) {
  const pct = value === null ? 0 : (value / 5) * 100;
  return (
    <View
      accessible
      accessibilityLabel={value === null ? `${label}: not rated yet` : `${label}: ${value.toFixed(1)} of 5`}
      style={{ gap: 2 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption">{label}</Text>
        <Text variant="caption" muted>
          {value === null ? "–" : `${value.toFixed(1)} · ${value >= 3 ? high : low}`}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: color.border }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: radius.pill, backgroundColor: color.accent }} />
      </View>
    </View>
  );
}

/** Pick 1 to 5. */
function Scale({
  label,
  value,
  render,
  onPick,
}: {
  label: string;
  value: number | null;
  render: (n: number, on: boolean) => ReactNode;
  onPick: (n: number) => void;
}) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption">{label}</Text>
      <View style={{ flexDirection: "row", gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== null && n <= value;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} of 5`}
              accessibilityState={{ checked: value === n }}
              onPress={() => {
                haptic.select();
                onPick(n);
              }}
              style={{ minWidth: touch.min, minHeight: touch.min, alignItems: "center", justifyContent: "center" }}
            >
              {/* a number scale is text; the star scale draws its own icons */}
              {typeof render(n, on) === "string" ? (
                <Text variant="title" style={{ color: on ? color.accent : color.textMuted }}>
                  {render(n, on)}
                </Text>
              ) : (
                render(n, on)
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
