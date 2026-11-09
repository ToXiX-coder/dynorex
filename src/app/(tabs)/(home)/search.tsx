import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Button } from "@/components/buttons/Button";
import { Chip } from "@/components/buttons/Chip";
import { TorqNote } from "@/components/mascot/TorqNote";
import { searchEggLine } from "@/domain/easterEggs";
import { Card } from "@/components/cards/Card";
import { InlineError } from "@/components/feedback/Inline";
import { EmptyState } from "@/components/feedback/States";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { PublicImage } from "@/components/social/PublicImage";
import { Text } from "@/components/Text";
import { ERROR_COPY } from "@/domain/copy/errors";
import { buildPath, modPath, searchTerms, userPath } from "@/domain/deepLinks";
import { useAuth } from "@/features/auth/AuthProvider";
import { SignInPrompt } from "@/features/auth/SignInPrompt";
import type { MappedError } from "@/features/auth/errors";
import { addRecent, recentSearches } from "@/features/social/recentSearches";
import { socialService } from "@/features/social/socialService";
import { usePublicMedia } from "@/features/social/usePublicMedia";
import { useFlags } from "@/providers/AppProviders";
import { analytics } from "@/services/analytics";
import type { SearchHit } from "@/services/supabase/database.types";
import { kindPlural, VEHICLE_KINDS, type VehicleKind } from "@/domain/vehicleKind";
import { border, color, radius, space, touch, type } from "@/theme/tokens";
import { withPress } from "@/theme/press";
import { themed } from "@/theme/themed";

const GROUPS: { kind: SearchHit["kind"]; label: string }[] = [
  { kind: "build", label: "Builds" },
  { kind: "user", label: "Users" },
  { kind: "mod", label: "Mods" },
  { kind: "route", label: "Routes" },
  { kind: "event", label: "Events" },
  { kind: "club", label: "Clubs" },
];
const V2_PATH: Partial<Record<SearchHit["kind"], string>> = { route: "/route/", event: "/events/", club: "/clubs/" };

/**
 * Search builds, users and mods. Results come from the server's public-only search (never a private
 * build, whatever the query), grouped by type, live after 2+ characters. Signed-in only (the server
 * limits it to 60 searches a minute per person).
 */
/** Starting points shown before anything is typed: popular platforms and the parts people look up most. */
const SEARCH_IDEAS = ["WRX", "Skyline", "Camaro", "Bronco", "Coilovers", "Exhaust", "Intake", "Wheels"];

export default function Search() {
  const { status } = useAuth();
  const flags = useFlags();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // D-71: narrow builds and mods to one kind of vehicle; people, routes and the rest always show
  const [only, setOnly] = useState<VehicleKind | null>(null);
  const [kinds, setKinds] = useState<Record<string, VehicleKind>>({});
  const seq = useRef(0);
  const media = usePublicMedia([
    ...new Set((hits ?? []).filter((h) => h.has_hero && h.vehicle_id).map((h) => h.vehicle_id!)),
  ]);

  useEffect(() => {
    void recentSearches.load().then(setRecent);
  }, []);

  // live results, debounced; only the latest answer is shown
  useEffect(() => {
    if (status !== "signedIn") return;
    // under 2 characters the screen shows recent searches instead, so old results are never shown
    const mine = ++seq.current;
    if (!searchTerms(q).ready) return;
    const t = setTimeout(async () => {
      const r = await socialService.search(q);
      if (mine !== seq.current) return;
      if (!r.ok) return setError(r.error);
      setError(null);
      setHits(r.data);
      analytics.track("search_performed", { result_count: r.data.length, has_results: r.data.length > 0 });
      const ids = [
        ...new Set(
          r.data.filter((h) => (h.kind === "build" || h.kind === "mod") && h.vehicle_id).map((h) => h.vehicle_id!),
        ),
      ];
      // only builds and mods can be narrowed by kind, so nothing to ask when there are none
      if (!ids.length) return;
      const k = await socialService.buildKinds(ids);
      if (mine === seq.current && k.ok) setKinds(k.data);
    }, 300);
    return () => clearTimeout(t);
  }, [q, status]);

  if (status !== "signedIn")
    return (
      <Screen>
        <SignInPrompt message="Sign in to search" />
      </Screen>
    );

  const remember = () => {
    const next = addRecent(recent, q);
    setRecent(next);
    void recentSearches.save(next);
  };
  const open = (h: SearchHit) => {
    remember();
    const v2 = V2_PATH[h.kind];
    const href = v2
      ? `${v2}${h.id}`
      : h.kind === "user"
        ? userPath(h.label.replace(/^@/, ""))
        : h.kind === "mod"
          ? modPath(h.vehicle_id!, h.id)
          : buildPath(h.vehicle_id!);
    router.push(href as Href);
  };

  return (
    <Screen>
      <TextInput
        autoFocus
        value={q}
        onChangeText={setQ}
        onSubmitEditing={remember}
        returnKeyType="search"
        placeholder="Make, model, username, part…"
        placeholderTextColor={color.textMuted}
        selectionColor={color.accent}
        accessibilityLabel="Search builds, users and mods"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {error ? <InlineError kind={error.key} /> : null}
      {/* easter egg: some words get a line from Torq (results still show as normal) */}
      {searchEggLine(q) ? <TorqNote text={searchEggLine(q)!} expression="excited" /> : null}

      {!searchTerms(q).ready ? (
        recent.length ? (
          <View style={{ gap: space.xs }}>
            <Text variant="label">Recent searches</Text>
            {recent.map((r) => (
              <Pressable key={r} accessibilityRole="button" onPress={() => setQ(r)} style={styles.recent}>
                <Text>{r}</Text>
              </Pressable>
            ))}
            <Button
              title="Clear recent searches"
              variant="secondary"
              onPress={() => {
                setRecent([]);
                void recentSearches.clear();
              }}
            />
          </View>
        ) : (
          // nothing searched yet: a few common starting points instead of a blank screen
          <View style={{ gap: space.sm }}>
            <Text variant="label">Try</Text>
            <View style={styles.ideas}>
              {SEARCH_IDEAS.map((s) => (
                <Chip key={s} label={s} action onPress={() => setQ(s)} />
              ))}
            </View>
          </View>
        )
      ) : hits && hits.length === 0 ? (
        <EmptyState message={ERROR_COPY.searchEmpty.title} detail={ERROR_COPY.searchEmpty.body} />
      ) : (
        <>
        {(hits ?? []).some((h) => h.kind === "build" || h.kind === "mod") ? (
          <View style={styles.ideas} accessibilityLabel="Show only">
            {VEHICLE_KINDS.map((k) => (
              <Chip
                key={k.id}
                label={kindPlural(k.id)}
                selected={only === k.id}
                onPress={() => setOnly((cur) => (cur === k.id ? null : k.id))}
              />
            ))}
          </View>
        ) : null}
        {GROUPS.filter((g) => (V2_PATH[g.kind] ? (g.kind === "route" ? flags.line : flags.paddock) : true)).map((g) => {
          const items = (hits ?? []).filter(
            (h) =>
              h.kind === g.kind &&
              (!only || (h.kind !== "build" && h.kind !== "mod") || (kinds[h.vehicle_id ?? ""] ?? "car") === only),
          );
          if (!items.length) return null;
          return (
            <View key={g.kind} style={{ gap: space.sm }}>
              <Text variant="section" accessibilityRole="header">
                {g.label}
              </Text>
              {items.map((h) => (
                <Pressable
                  key={`${h.kind}-${h.id}`}
                  accessibilityRole="link"
                  accessibilityLabel={[h.label, h.sublabel].filter(Boolean).join(", ")}
                  onPress={() => open(h)}
                  style={withPress({ minHeight: touch.min })}
                >
                  <Card style={styles.row}>
                    {h.kind === "user" ? (
                      <Avatar username={h.label.replace(/^@/, "")} name={h.sublabel || null} size={56} />
                    ) : V2_PATH[h.kind] ? (
                      <View style={[styles.thumb, styles.initial]}>
                        <Text variant="caption" accent>
                          {h.kind.toUpperCase()}
                        </Text>
                      </View>
                    ) : (
                      <PublicImage
                        uri={h.vehicle_id ? media.heroes[h.vehicle_id] : undefined}
                        expected={h.has_hero}
                        alt=""
                        style={styles.thumb}
                      />
                    )}
                    <View style={{ flex: 1, gap: space.xxs }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {h.label}
                      </Text>
                      {h.sublabel ? (
                        <Text variant="caption" muted numberOfLines={1}>
                          {h.sublabel}
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          );
        })}
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    ideas: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
    input: {
      ...type.body,
      minHeight: touch.min,
      color: color.text,
      borderWidth: border.focus,
      borderColor: color.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
    },
    recent: { minHeight: touch.min, justifyContent: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm },
    thumb: { width: 56, height: 56, borderRadius: radius.sm },
    initial: { backgroundColor: color.background, alignItems: "center", justifyContent: "center" },
  }),
);
